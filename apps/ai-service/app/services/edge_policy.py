"""
Trade-Z Edge Policy, Data Quality & Causal Safety Governance Engine:
Canonical source of truth for:
1. EdgeState and BacktestEdgeMode enums
2. Machine-readable RejectionReasonCodes
3. Point-in-time temporal causality assertions (assert_point_in_time_data)
4. Multi-layer LIVE execution discovery prohibitions
5. Stateful discovery exposure budgets
6. Strict historical dataset quality verification gates
7. Currency exposure calculations and versioned broker profile snapshots
"""

from enum import Enum
from typing import Dict, Any, List, Optional, Tuple, Union
import hashlib
from datetime import datetime, timezone, date
import pandas as pd
from pydantic import BaseModel, Field


class EdgeState(str, Enum):
    UNKNOWN_EDGE = "UNKNOWN_EDGE"
    WEAK_EVIDENCE = "WEAK_EVIDENCE"
    MODERATE_EVIDENCE = "MODERATE_EVIDENCE"
    STRONG_EVIDENCE = "STRONG_EVIDENCE"
    NEGATIVE_EDGE = "NEGATIVE_EDGE"


class BacktestEdgeMode(str, Enum):
    DISCOVERY = "DISCOVERY"
    STRICT = "STRICT"
    PAPER = "PAPER"
    LIVE = "LIVE"


class DatasetPhase(str, Enum):
    TRAIN = "TRAIN"
    VALIDATION = "VALIDATION"
    OOS = "OOS"


class DataQualityStatus(str, Enum):
    VERIFIED = "VERIFIED"
    CONDITIONAL = "CONDITIONAL"
    INVALID = "INVALID"


class IntrabarResolutionMethod(str, Enum):
    OHLC_UNAMBIGUOUS = "OHLC_UNAMBIGUOUS"
    OHLC_CONSERVATIVE = "OHLC_CONSERVATIVE"
    GAP_OPEN_FILL = "GAP_OPEN_FILL"
    TICK_EXACT = "TICK_EXACT"
    M1_CHRONOLOGICAL = "M1_CHRONOLOGICAL"


class RejectionReasonCode(str, Enum):
    STRUCTURE_INVALID = "STRUCTURE_INVALID"
    QUALITY_BELOW_MINIMUM = "QUALITY_BELOW_MINIMUM"
    RR_TOO_LOW = "RR_TOO_LOW"
    PREMIUM_DISCOUNT_VETO = "PREMIUM_DISCOUNT_VETO"
    SESSION_BLOCKED = "SESSION_BLOCKED"
    KILL_ZONE_BLOCKED = "KILL_ZONE_BLOCKED"
    NEWS_BLOCKED = "NEWS_BLOCKED"
    NEWS_DATA_UNAVAILABLE = "NEWS_DATA_UNAVAILABLE"
    BROKER_SYMBOL_UNAVAILABLE = "BROKER_SYMBOL_UNAVAILABLE"
    BROKER_DATA_UNAVAILABLE = "BROKER_DATA_UNAVAILABLE"
    ACCOUNT_RISK_TOO_HIGH = "ACCOUNT_RISK_TOO_HIGH"
    MIN_LOT_TOO_LARGE = "MIN_LOT_TOO_LARGE"
    MARGIN_INSUFFICIENT = "MARGIN_INSUFFICIENT"
    NEGATIVE_EDGE = "NEGATIVE_EDGE"
    INSUFFICIENT_EVIDENCE_STRICT_MODE = "INSUFFICIENT_EVIDENCE_STRICT_MODE"
    DISCOVERY_SYMBOL_LIMIT_REACHED = "DISCOVERY_SYMBOL_LIMIT_REACHED"
    DISCOVERY_FAMILY_LIMIT_REACHED = "DISCOVERY_FAMILY_LIMIT_REACHED"
    DISCOVERY_CONCURRENT_LIMIT_REACHED = "DISCOVERY_CONCURRENT_LIMIT_REACHED"
    DISCOVERY_DAILY_RISK_EXCEEDED = "DISCOVERY_DAILY_RISK_EXCEEDED"
    DUPLICATE_SETUP = "DUPLICATE_SETUP"
    PORTFOLIO_RISK_EXCEEDED = "PORTFOLIO_RISK_EXCEEDED"
    PORTFOLIO_CURRENCY_EXPOSURE_EXCEEDED = "PORTFOLIO_CURRENCY_EXPOSURE_EXCEEDED"
    DATA_INVALID = "DATA_INVALID"
    DATA_UNAVAILABLE = "DATA_UNAVAILABLE"
    LOOKAHEAD_DETECTED = "LOOKAHEAD_DETECTED"
    LIVE_DISCOVERY_PROHIBITED = "LIVE_DISCOVERY_PROHIBITED"


class CausalDataIntegrityError(Exception):
    """Raised when data from the future contaminates a historical decision."""
    pass


class LiveDiscoveryProhibitedError(Exception):
    """Raised when LIVE execution attempts to enable bootstrap/discovery mode."""
    pass


def parse_to_utc_timestamp(ts: Union[str, datetime, pd.Timestamp, int, float]) -> pd.Timestamp:
    """Normalizes any supported timestamp representation into a UTC pd.Timestamp."""
    if isinstance(ts, (int, float)) or (isinstance(ts, str) and ts.strip().replace(".", "", 1).isdigit()):
        val = float(ts)
        unit = "s" if val < 1e11 else "ms"
        return pd.to_datetime(val, unit=unit, utc=True)
    if isinstance(ts, pd.Timestamp):
        return ts.tz_convert("UTC") if ts.tzinfo is not None else ts.tz_localize("UTC")
    if isinstance(ts, datetime):
        return pd.Timestamp(ts).tz_convert("UTC") if ts.tzinfo is not None else pd.Timestamp(ts).tz_localize("UTC")
    try:
        parsed = pd.to_datetime(ts, utc=True)
        return parsed
    except Exception as e:
        raise ValueError(f"Unable to parse timestamp '{ts}': {e}")


def assert_point_in_time_data(
    data_timestamp: Union[str, datetime, pd.Timestamp, int, float],
    decision_timestamp: Union[str, datetime, pd.Timestamp, int, float],
    context_label: str = "general"
) -> None:
    """
    Guarantees strict zero-lookahead causality:
    Every piece of information entering a decision at decision_timestamp must satisfy:
    data_timestamp <= decision_timestamp.
    Fails closed with CausalDataIntegrityError if future data is detected.
    """
    data_dt = parse_to_utc_timestamp(data_timestamp)
    dec_dt = parse_to_utc_timestamp(decision_timestamp)
    if data_dt > dec_dt:
        raise CausalDataIntegrityError(
            f"LOOKAHEAD_DETECTED in {context_label}: Data timestamp {data_dt} is in the future relative to decision timestamp {dec_dt}."
        )


def validate_live_safety(
    mode: Union[BacktestEdgeMode, str],
    bootstrap_unknown_edge: bool = False
) -> None:
    """
    Multi-layer safety assertion:
    Under NO circumstances may LIVE mode enable DISCOVERY mode or bootstrap_unknown_edge=True.
    """
    mode_str = str(mode).upper()
    if "LIVE" in mode_str:
        if "DISCOVERY" in mode_str or bootstrap_unknown_edge:
            raise LiveDiscoveryProhibitedError(
                "LIVE_DISCOVERY_PROHIBITED: LIVE execution cannot enable DISCOVERY mode or bootstrap_unknown_edge. Production safety violation."
            )


class BrokerProfileSnapshot(BaseModel):
    """
    Versioned snapshot of broker specifications used during a simulation.
    Ensures complete reproducibility even if broker profile files change later.
    """
    broker_name: str
    account_currency: str = "USD"
    leverage: float = 2000.0
    margin_mode: str = "forex"
    contract_size: float = 100000.0
    tick_size: float = 0.00001
    tick_value: float = 1.0
    volume_min: float = 0.01
    volume_step: float = 0.01
    volume_max: float = 100.0
    stop_level: float = 0.0
    freeze_level: float = 0.0
    commission_model: str = "zero_raw"
    swap_model: str = "standard_overnight"
    margin_model: str = "standard_mt5"
    spread_model: str = "typical_pips"
    slippage_model: str = "deterministic_latency"
    profile_version: str = "2.2.0"
    effective_start: Optional[str] = None
    effective_end: Optional[str] = None


class DiscoveryExposureLimits(BaseModel):
    max_unknown_edge_trades_per_symbol: int = 5
    max_unknown_edge_trades_per_setup_family: int = 10
    max_concurrent_discovery_positions: int = 1
    daily_discovery_risk_budget_pct: float = 2.0


class DiscoveryExposureBudget:
    """
    Persistent, stateful tracking of discovery trade quotas across the entire simulation.
    Counters persist across bars and increment ONLY upon an actual position fill.
    Rejected candidates or cancelled orders consume zero quota.
    """
    def __init__(self, limits: Optional[DiscoveryExposureLimits] = None):
        self.limits = limits or DiscoveryExposureLimits()
        self.symbol_counts: Dict[str, int] = {}
        self.family_counts: Dict[str, int] = {}
        self.daily_risk_used: Dict[str, float] = {}  # date_str -> total risk dollars
        self.active_discovery_tickets: set = set()
        self.diversity_records: List[Dict[str, Any]] = []

    def can_open_discovery_trade(
        self,
        symbol: str,
        setup_family: str,
        risk_dollars: float,
        account_equity: float,
        trade_date_str: str
    ) -> Tuple[bool, Optional[RejectionReasonCode]]:
        """Evaluates whether discovery limits permit a new discovery trade entry."""
        # 1. Concurrent discovery positions cap
        if len(self.active_discovery_tickets) >= self.limits.max_concurrent_discovery_positions:
            return False, RejectionReasonCode.DISCOVERY_CONCURRENT_LIMIT_REACHED

        # 2. Per-symbol cap
        if self.symbol_counts.get(symbol, 0) >= self.limits.max_unknown_edge_trades_per_symbol:
            return False, RejectionReasonCode.DISCOVERY_SYMBOL_LIMIT_REACHED

        # 3. Per-setup-family cap
        if self.family_counts.get(setup_family, 0) >= self.limits.max_unknown_edge_trades_per_setup_family:
            return False, RejectionReasonCode.DISCOVERY_FAMILY_LIMIT_REACHED

        # 4. Daily discovery risk budget cap
        daily_used = self.daily_risk_used.get(trade_date_str, 0.0)
        max_daily_risk = account_equity * (self.limits.daily_discovery_risk_budget_pct / 100.0)
        if daily_used + risk_dollars > max_daily_risk:
            return False, RejectionReasonCode.DISCOVERY_DAILY_RISK_EXCEEDED

        return True, None

    def record_fill(
        self,
        ticket: Any,
        symbol: str,
        setup_family: str,
        direction: str,
        session: str,
        regime: str,
        risk_dollars: float,
        trade_date_str: str
    ) -> None:
        """Called ONLY when a discovery pending order or market order is actually filled."""
        self.active_discovery_tickets.add(ticket)
        self.symbol_counts[symbol] = self.symbol_counts.get(symbol, 0) + 1
        self.family_counts[setup_family] = self.family_counts.get(setup_family, 0) + 1
        self.daily_risk_used[trade_date_str] = self.daily_risk_used.get(trade_date_str, 0.0) + risk_dollars

        self.diversity_records.append({
            "ticket": ticket,
            "symbol": symbol,
            "setup_family": setup_family,
            "direction": direction,
            "session": session,
            "regime": regime,
            "risk_dollars": risk_dollars,
            "date": trade_date_str
        })

    def record_close(self, ticket: Any) -> None:
        """Removes ticket from active discovery positions when closed."""
        self.active_discovery_tickets.discard(ticket)

    def get_diversity_telemetry(self) -> Dict[str, Any]:
        """Provides full auditable diversity breakdown of all discovery trades."""
        by_sym: Dict[str, int] = {}
        by_fam: Dict[str, int] = {}
        by_dir: Dict[str, int] = {}
        by_ses: Dict[str, int] = {}
        by_reg: Dict[str, int] = {}

        for rec in self.diversity_records:
            by_sym[rec["symbol"]] = by_sym.get(rec["symbol"], 0) + 1
            by_fam[rec["setup_family"]] = by_fam.get(rec["setup_family"], 0) + 1
            by_dir[rec["direction"]] = by_dir.get(rec["direction"], 0) + 1
            by_ses[rec["session"]] = by_ses.get(rec["session"], 0) + 1
            by_reg[rec["regime"]] = by_reg.get(rec["regime"], 0) + 1

        return {
            "total_discovery_fills": len(self.diversity_records),
            "by_symbol": by_sym,
            "by_setup_family": by_fam,
            "by_direction": by_dir,
            "by_session": by_ses,
            "by_regime": by_reg
        }


def verify_dataset_quality(
    df: pd.DataFrame,
    symbol: str,
    requested_start: Optional[str] = None,
    requested_end: Optional[str] = None,
    min_bars: int = 25
) -> Tuple[DataQualityStatus, List[str]]:
    """
    Strict historical data verification gate.
    Returns (status, rejection_reasons).
    Fails closed with INVALID if timestamps are missing, unparseable, out of order,
    or if OHLC values violate physical reality. Never fabricates or silently pads data.
    """
    reasons = []
    if df is None or len(df) == 0:
        return DataQualityStatus.INVALID, ["DATASET_EMPTY_OR_NONE"]

    if len(df) < min_bars:
        return DataQualityStatus.INVALID, [f"INSUFFICIENT_BARS: Found {len(df)}, required at least {min_bars}"]

    # 1. Timestamp column validation
    ts_col = None
    for col in ["time", "timestamp", "datetime", "Date", "date"]:
        if col in df.columns:
            ts_col = col
            break

    if ts_col is None:
        return DataQualityStatus.INVALID, ["MISSING_TIMESTAMP_COLUMN: Candle records lack valid timestamp identifier"]

    try:
        parsed_ts = pd.to_datetime(df[ts_col], utc=True)
    except Exception as e:
        return DataQualityStatus.INVALID, [f"UNPARSEABLE_TIMESTAMPS: {e}"]

    # Check for NaT
    if parsed_ts.isna().any():
        return DataQualityStatus.INVALID, ["NULL_OR_NAT_TIMESTAMPS_DETECTED"]

    # Check strictly monotonic increasing (out-of-order timestamps)
    if not parsed_ts.is_monotonic_increasing:
        # Check if duplicates exist or actual out-of-order
        if parsed_ts.duplicated().any():
            return DataQualityStatus.INVALID, ["DUPLICATE_TIMESTAMPS_DETECTED"]
        return DataQualityStatus.INVALID, ["OUT_OF_ORDER_TIMESTAMPS_DETECTED"]

    if parsed_ts.duplicated().any():
        return DataQualityStatus.INVALID, ["DUPLICATE_TIMESTAMPS_DETECTED"]

    # 2. OHLC physical price reality checks
    required_cols = ["open", "high", "low", "close"]
    missing_ohlc = [c for c in required_cols if c not in df.columns]
    if missing_ohlc:
        return DataQualityStatus.INVALID, [f"MISSING_OHLC_COLUMNS: {', '.join(missing_ohlc)}"]

    opens = df["open"].astype(float)
    highs = df["high"].astype(float)
    lows = df["low"].astype(float)
    closes = df["close"].astype(float)

    if (lows <= 0).any() or (highs <= 0).any() or (opens <= 0).any() or (closes <= 0).any():
        return DataQualityStatus.INVALID, ["NON_POSITIVE_PRICE_VALUES_DETECTED"]

    # High must be >= Low
    if (highs < lows).any():
        bad_idx = (highs < lows).idxmax()
        return DataQualityStatus.INVALID, [f"IMPOSSIBLE_OHLC: High < Low at index {bad_idx}"]

    # High must be >= max(Open, Close) and Low <= min(Open, Close)
    if (highs < opens).any() or (highs < closes).any():
        return DataQualityStatus.INVALID, ["IMPOSSIBLE_OHLC: High is lower than Open or Close"]

    if (lows > opens).any() or (lows > closes).any():
        return DataQualityStatus.INVALID, ["IMPOSSIBLE_OHLC: Low is higher than Open or Close"]

    # 3. Exact date-range enforcement if requested
    if requested_start is not None:
        req_start_dt = parse_to_utc_timestamp(requested_start)
        actual_start_dt = parsed_ts.iloc[0]
        if actual_start_dt > req_start_dt + pd.Timedelta(days=2):
            reasons.append(f"DATA_STARTS_LATE: Requested {req_start_dt}, actual first bar is {actual_start_dt}")

    if requested_end is not None:
        req_end_dt = parse_to_utc_timestamp(requested_end)
        actual_end_dt = parsed_ts.iloc[-1]
        if actual_end_dt < req_end_dt - pd.Timedelta(days=2):
            reasons.append(f"DATA_ENDS_EARLY: Requested {req_end_dt}, actual last bar is {actual_end_dt}")

    if reasons:
        return DataQualityStatus.CONDITIONAL, reasons

    return DataQualityStatus.VERIFIED, []


def calculate_currency_exposure(
    positions: List[Dict[str, Any]],
    pending_orders: Optional[List[Any]] = None
) -> Dict[str, float]:
    """
    Deterministic currency exposure accounting for Forex pairs.
    EURUSD BUY 0.10 lot (10,000 EUR) -> +EUR 10000 notional, -USD notional.
    Returns mapping of currency -> net signed notional exposure.
    """
    net_exposure: Dict[str, float] = {}
    items = list(positions or [])

    for pos in items:
        if isinstance(pos, dict):
            sym = pos.get("symbol", "").upper().replace("/", "").replace(" ", "")
            direction = pos.get("direction", "long").lower()
            vol = float(pos.get("volume", pos.get("lot_size", 0.01)))
        else:
            sym = getattr(pos, "symbol", "").upper().replace("/", "").replace(" ", "")
            direction = getattr(pos, "direction", "long").lower()
            vol = float(getattr(pos, "volume", getattr(pos, "lot_size", 0.01)))

        notional = vol * 100000.0  # Standard FX contract

        if len(sym) == 6 and not sym.startswith("XAU") and not sym.startswith("BTC"):
            base = sym[:3]
            quote = sym[3:]
            sign = 1.0 if direction in ["long", "buy"] else -1.0
            net_exposure[base] = net_exposure.get(base, 0.0) + (notional * sign)
            net_exposure[quote] = net_exposure.get(quote, 0.0) - (notional * sign)
        elif "XAU" in sym:
            sign = 1.0 if direction in ["long", "buy"] else -1.0
            gold_oz = vol * 100.0
            net_exposure["XAU"] = net_exposure.get("XAU", 0.0) + (gold_oz * sign)
            net_exposure["USD"] = net_exposure.get("USD", 0.0) - (gold_oz * 2000.0 * sign)

    return net_exposure


def validate_currency_exposure_limits(
    net_exposure: Dict[str, float],
    max_currency_exposure: float = 500000.0,
    max_currency_cluster_risk: float = 800000.0,
    max_directional_cluster_risk: float = 600000.0
) -> Tuple[bool, Optional[RejectionReasonCode], Optional[str]]:
    """
    Validates currency exposure against configurable portfolio limits:
    - max_currency_exposure: max absolute net exposure for any individual currency
    - max_currency_cluster_risk: max sum of absolute exposures across related currencies
    - max_directional_cluster_risk: max directional exposure in a single currency (e.g. USD short)
    """
    for ccy, exp in net_exposure.items():
        if abs(exp) > max_currency_exposure:
            return False, RejectionReasonCode.PORTFOLIO_CURRENCY_EXPOSURE_EXCEEDED, f"Max currency exposure exceeded for {ccy}: {abs(exp):.0f} > {max_currency_exposure:.0f}"

    total_cluster_exposure = sum(abs(exp) for exp in net_exposure.values())
    if total_cluster_exposure > max_currency_cluster_risk:
        return False, RejectionReasonCode.PORTFOLIO_CURRENCY_EXPOSURE_EXCEEDED, f"Max currency cluster risk exceeded: {total_cluster_exposure:.0f} > {max_currency_cluster_risk:.0f}"

    # Directional risk on USD or dominant currency
    usd_exp = abs(net_exposure.get("USD", 0.0))
    if usd_exp > max_directional_cluster_risk:
        return False, RejectionReasonCode.PORTFOLIO_CURRENCY_EXPOSURE_EXCEEDED, f"Max directional cluster risk exceeded for USD: {usd_exp:.0f} > {max_directional_cluster_risk:.0f}"

    return True, None, None
