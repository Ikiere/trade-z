"""
Trade-Z Deterministic Market Context Resolver
Version: 2.1.0

Resolves point-in-time market context strictly from completed historical candle data.
Zero lookahead bias: Never accesses future bars or unclosed candles.
Shared across UnifiedStrategyEngine, OpportunityEngine, and EventDrivenSimulator.
"""

from typing import Optional, Dict, Any
from datetime import datetime, timezone
import pandas as pd
import numpy as np
from pydantic import BaseModel, Field


class MarketContext(BaseModel):
    market_context_version: str = "2.1.0"
    timestamp: str = ""
    session: str = "LONDON"           # ASIA | LONDON | NEW_YORK | LONDON_NY_OVERLAP | SYDNEY_TOKYO
    day_of_week: str = "MONDAY"       # MONDAY - FRIDAY
    regime: str = "BULLISH_TREND"     # BULLISH_TREND | BEARISH_TREND | RANGE
    volatility_regime: str = "NORMAL" # EXPANSION | CONTRACTION | NORMAL
    atr_state: str = "NORMAL"         # HIGH | LOW | NORMAL
    atr_value: float = 0.0
    htf_context: str = "NEUTRAL"      # ALIGNED_BULLISH | ALIGNED_BEARISH | COUNTER_TREND | NEUTRAL
    expansion_contraction: str = "EQUILIBRIUM" # EXPANSION | CONTRACTION | EQUILIBRIUM


class MarketContextResolver:
    """
    Deterministic resolver that maps historical price bars into authoritative market context.
    Eliminates hardcoded sessions or regimes.
    """

    @staticmethod
    def resolve(
        df: pd.DataFrame,
        current_idx: Optional[int] = None,
        htf_df: Optional[pd.DataFrame] = None
    ) -> MarketContext:
        """
        Determines the market context at df.iloc[current_idx] (or last row if current_idx is None).
        All calculations use only bars up to the evaluation bar.
        """
        if df is None or len(df) == 0:
            return MarketContext(timestamp=datetime.now(timezone.utc).isoformat())

        sub_df = df.iloc[:current_idx + 1] if current_idx is not None else df
        if len(sub_df) == 0:
            return MarketContext(timestamp=datetime.now(timezone.utc).isoformat())

        last_row = sub_df.iloc[-1]
        raw_time = last_row.get("time", "")

        # 1. Parse Timestamp & Session
        dt: Optional[datetime] = None
        if isinstance(raw_time, str) and raw_time:
            try:
                dt = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
            except Exception:
                pass
        elif isinstance(raw_time, (pd.Timestamp, datetime)):
            dt = pd.to_datetime(raw_time).to_pydatetime()

        if dt is None:
            # Fallback to current UTC if time column is missing or unparseable
            dt = datetime.now(timezone.utc)

        hour = dt.hour
        day_name = dt.strftime("%A").upper()

        # Session Mapping (UTC):
        # Asia: 00:00 - 07:00 UTC
        # London: 07:00 - 16:00 UTC (12:00 - 16:00 is London/NY Overlap)
        # New York: 12:00 - 21:00 UTC
        # Off-hours: 21:00 - 24:00 UTC (Sydney/Tokyo open)
        if 12 <= hour < 16:
            session = "LONDON_NY_OVERLAP"
        elif 7 <= hour < 16:
            session = "LONDON"
        elif 16 <= hour < 21:
            session = "NEW_YORK"
        elif 0 <= hour < 7:
            session = "ASIA"
        else:
            session = "SYDNEY_TOKYO"

        # 2. Volatility & ATR State (using up to last 50 bars)
        n_bars = len(sub_df)
        if n_bars >= 15:
            highs = sub_df["high"].astype(float).values
            lows = sub_df["low"].astype(float).values
            closes = sub_df["close"].astype(float).values

            # True Range
            tr1 = highs[1:] - lows[1:]
            tr2 = np.abs(highs[1:] - closes[:-1])
            tr3 = np.abs(lows[1:] - closes[:-1])
            tr = np.maximum(tr1, np.maximum(tr2, tr3))

            # ATR(14)
            period = min(14, len(tr))
            current_atr = float(np.mean(tr[-period:]))

            # Benchmark ATR over longer window (up to 50 bars)
            baseline_period = min(50, len(tr))
            median_atr = float(np.median(tr[-baseline_period:]))

            if median_atr > 0:
                atr_ratio = current_atr / median_atr
            else:
                atr_ratio = 1.0

            if atr_ratio >= 1.25:
                volatility_regime = "EXPANSION"
                atr_state = "HIGH"
                expansion_contraction = "EXPANSION"
            elif atr_ratio <= 0.80:
                volatility_regime = "CONTRACTION"
                atr_state = "LOW"
                expansion_contraction = "CONTRACTION"
            else:
                volatility_regime = "NORMAL"
                atr_state = "NORMAL"
                expansion_contraction = "EQUILIBRIUM"
        else:
            current_atr = 0.0010
            volatility_regime = "NORMAL"
            atr_state = "NORMAL"
            expansion_contraction = "EQUILIBRIUM"

        # 3. Trend / Range Regime (using 20 vs 50 EMA or slope of close prices)
        if n_bars >= 20:
            c = sub_df["close"].astype(float)
            fast_ema = c.ewm(span=min(20, n_bars), adjust=False).mean().iloc[-1]
            slow_ema = c.ewm(span=min(50, n_bars), adjust=False).mean().iloc[-1]

            # Price position and slope
            last_close = float(c.iloc[-1])
            pct_diff = (fast_ema - slow_ema) / max(0.0001, slow_ema) * 100.0

            if pct_diff > 0.08 and last_close >= fast_ema:
                regime = "BULLISH_TREND"
            elif pct_diff < -0.08 and last_close <= fast_ema:
                regime = "BEARISH_TREND"
            else:
                regime = "RANGE"
        else:
            regime = "RANGE"

        # 4. Higher Timeframe Context
        htf_context = "NEUTRAL"
        if htf_df is not None and len(htf_df) >= 5:
            htf_c = htf_df["close"].astype(float)
            htf_fast = htf_c.ewm(span=min(10, len(htf_c)), adjust=False).mean().iloc[-1]
            htf_slow = htf_c.ewm(span=min(25, len(htf_c)), adjust=False).mean().iloc[-1]
            if htf_fast > htf_slow:
                htf_context = "ALIGNED_BULLISH" if regime == "BULLISH_TREND" else "COUNTER_TREND"
            elif htf_fast < htf_slow:
                htf_context = "ALIGNED_BEARISH" if regime == "BEARISH_TREND" else "COUNTER_TREND"

        return MarketContext(
            market_context_version="2.1.0",
            timestamp=str(raw_time) if raw_time else dt.isoformat(),
            session=session,
            day_of_week=day_name,
            regime=regime,
            volatility_regime=volatility_regime,
            atr_state=atr_state,
            atr_value=round(current_atr, 6),
            htf_context=htf_context,
            expansion_contraction=expansion_contraction
        )
