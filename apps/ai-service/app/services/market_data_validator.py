"""
Market Data Pre-Flight Validator
Institutional data integrity and sanity filter.
If any validation fails, the system must immediately abort with NO_TRADE.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, List, Tuple
import pandas as pd
import numpy as np


@dataclass
class ValidationResult:
    is_valid: bool
    failure_reasons: List[str]
    metrics: dict


def validate_dataframe_candles(
    df: Optional[pd.DataFrame],
    timeframe: str = "15m",
    min_candles: int = 30,
    max_stale_seconds: Optional[int] = None
) -> ValidationResult:
    """
    Validates candle integrity for institutional SMC analysis:
    - Minimum candle depth
    - OHLC structural sanity (High >= Low, High >= Open/Close, Low <= Open/Close)
    - Positive prices (> 0)
    - Duplicate timestamps
    - Abnormal price spikes (> 4x ATR)
    - Timestamp freshness
    """
    reasons: List[str] = []
    metrics: dict = {
        "candle_count": 0,
        "latest_timestamp": None,
        "spread_valid": True,
        "atr": 0.0,
        "duplicate_timestamps": 0,
        "abnormal_spikes": 0
    }

    if df is None or not isinstance(df, pd.DataFrame):
        return ValidationResult(
            is_valid=False,
            failure_reasons=["MARKET_DATA_EMPTY_OR_NONE"],
            metrics=metrics
        )

    metrics["candle_count"] = len(df)
    if len(df) < min_candles:
        reasons.append(f"INSUFFICIENT_CANDLE_DEPTH: Required {min_candles}, got {len(df)}")
        return ValidationResult(is_valid=False, failure_reasons=reasons, metrics=metrics)

    # Required columns
    required_cols = {"open", "high", "low", "close"}
    lower_cols = {str(col).lower(): col for col in df.columns}
    missing = required_cols - set(lower_cols.keys())
    if missing:
        reasons.append(f"MISSING_REQUIRED_OHLC_COLUMNS: {list(missing)}")
        return ValidationResult(is_valid=False, failure_reasons=reasons, metrics=metrics)

    # Standardize OHLC series
    o = pd.to_numeric(df[lower_cols["open"]], errors="coerce")
    h = pd.to_numeric(df[lower_cols["high"]], errors="coerce")
    l = pd.to_numeric(df[lower_cols["low"]], errors="coerce")
    c = pd.to_numeric(df[lower_cols["close"]], errors="coerce")

    # Check for NaN / null values
    if o.isna().any() or h.isna().any() or l.isna().any() or c.isna().any():
        reasons.append("CANDLES_CONTAIN_NAN_OR_NULL_VALUES")

    # 1. Positive prices
    if (o <= 0).any() or (h <= 0).any() or (l <= 0).any() or (c <= 0).any():
        reasons.append("NON_POSITIVE_PRICE_DETECTED")

    # 2. Geometric bar sanity: High must be >= Low, Open, Close; Low must be <= Open, Close
    invalid_high = (h < l) | (h < o) | (h < c)
    invalid_low = (l > o) | (l > c)
    if invalid_high.any() or invalid_low.any():
        reasons.append("GEOMETRIC_OHLC_INCONSISTENCY: High < Low or Bar Extremes violated")

    # 3. Duplicate timestamps
    if isinstance(df.index, pd.DatetimeIndex):
        dup_count = int(df.index.duplicated().sum())
        metrics["duplicate_timestamps"] = dup_count
        if dup_count > 0:
            reasons.append(f"DUPLICATE_TIMESTAMPS_DETECTED: {dup_count} duplicate timestamps")
    elif "datetime" in lower_cols or "time" in lower_cols:
        time_col = lower_cols.get("datetime") or lower_cols.get("time")
        dup_count = int(df[time_col].duplicated().sum())
        metrics["duplicate_timestamps"] = dup_count
        if dup_count > 0:
            reasons.append(f"DUPLICATE_TIMESTAMPS_DETECTED: {dup_count} duplicate timestamps")

    # 4. Abnormal price spike / bad tick filter (> 4x ATR)
    tr1 = h - l
    tr2 = (h - c.shift(1)).abs()
    tr3 = (l - c.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = float(tr.rolling(14).mean().iloc[-1]) if len(tr) >= 14 else float(tr.mean())
    metrics["atr"] = atr

    if atr > 0:
        # Check last 5 bars for abnormal price spikes
        recent_tr = tr.tail(5)
        bad_ticks = (recent_tr > (atr * 4.5)).sum()
        metrics["abnormal_spikes"] = int(bad_ticks)
        if bad_ticks > 0:
            reasons.append(f"ABNORMAL_PRICE_SPIKE_DETECTED: {bad_ticks} bars exceeded 4.5x ATR")

    # 5. Timestamp freshness check
    latest_ts = None
    if isinstance(df.index, pd.DatetimeIndex) and len(df) > 0:
        latest_ts = df.index[-1]
    elif ("datetime" in lower_cols or "time" in lower_cols) and len(df) > 0:
        time_col = lower_cols.get("datetime") or lower_cols.get("time")
        latest_ts = pd.to_datetime(df[time_col].iloc[-1])

    if latest_ts is not None:
        metrics["latest_timestamp"] = str(latest_ts)
        # Verify freshness if UTC aware
        if max_stale_seconds is not None and max_stale_seconds > 0:
            try:
                now_utc = datetime.now(timezone.utc)
                if latest_ts.tzinfo is None:
                    # Treat naive as UTC for financial feeds
                    candle_utc = latest_ts.replace(tzinfo=timezone.utc)
                else:
                    candle_utc = latest_ts.astimezone(timezone.utc)
                
                age_seconds = (now_utc - candle_utc).total_seconds()
                metrics["data_age_seconds"] = age_seconds
                if age_seconds > max_stale_seconds:
                    reasons.append(
                        f"DATA_STALE: Latest bar is {age_seconds:.0f}s old (limit {max_stale_seconds}s)"
                    )
            except Exception:
                pass

    return ValidationResult(
        is_valid=len(reasons) == 0,
        failure_reasons=reasons,
        metrics=metrics
    )


def validate_spread(bid: float, ask: float, max_allowed_spread_points: Optional[float] = None) -> Tuple[bool, Optional[str]]:
    """
    Validates real-time bid/ask quote spread sanity.
    """
    if ask <= 0 or bid <= 0:
        return False, "NON_POSITIVE_BID_OR_ASK"
    if ask < bid:
        return False, f"NEGATIVE_SPREAD_DETECTED: ask ({ask}) < bid ({bid})"
    
    spread = ask - bid
    if max_allowed_spread_points is not None and spread > max_allowed_spread_points:
        return False, f"EXCESSIVE_SPREAD: {spread} > {max_allowed_spread_points}"

    return True, None
