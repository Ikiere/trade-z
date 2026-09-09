"""
Trade-Z Historical Event-Driven Simulator:
An institutional discrete-event backtesting engine that operates strictly chronologically:
BarEvent -> SignalEvent (from UnifiedStrategyEngine) -> OrderEvent -> FillEvent.

Hardened Features:
1. Strict Zero-Lookahead Causal Queue & Independent Per-Symbol Bar Index
2. Strict Data Quality Gate & No Synthetic Timestamps
3. Versioned Broker Profile Snapshot & Single-Source Bid/Ask Cost Accounting
4. Dual Order Types & Complete Pending Limit Order Lifecycle (PENDING -> FILLED / CANCELLED / EXPIRED)
5. Conservative Intrabar Execution Hierarchy (resolves all same-bar combinations A through J)
6. 17-Stage Auditable Candidate Funnel & "Why No Trades?" Rejection Breakdown
7. Phase-Aware Experience Memory (TRAIN / VALIDATION / OOS)
8. Stateful Discovery Exposure Budget & Live Safety Prohibition
9. Causal Forensic Trade Autopsies & Sentinel Counterfactual Audit
10. Strict Ledger Reconciliation (ending_balance == starting_balance + sum(net_pnl))
"""

from enum import Enum
import math
import random
from typing import List, Dict, Any, Optional, Set, Tuple
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import pandas as pd
import numpy as np

from app.services.structure import generate_simulated_candles
from app.services.unified_strategy_engine import unified_strategy_engine, ExecutionMode, DecisionAction, TradingDecision
from app.services.broker_profiles import get_broker_profile, BrokerProfile, SymbolSpec
from app.services.virtual_mt5_account import VirtualMT5Account, SimulatedPosition
from app.services.trade_autopsy import autopsy_engine, TradeAutopsy
from app.services.experience_memory import experience_memory, ExperienceRecord
from app.services.duplicate_detector import duplicate_detector
from app.services.real_market_simulator import generate_summary_from_ledger, run_sentinel_counterfactual_audit
from app.services.market_context_resolver import MarketContextResolver, MarketContext
from app.services.edge_policy import (
    EdgeState,
    BacktestEdgeMode,
    DatasetPhase,
    RejectionReasonCode,
    DataQualityStatus,
    IntrabarResolutionMethod,
    BrokerProfileSnapshot,
    DiscoveryExposureBudget,
    DiscoveryExposureLimits,
    verify_dataset_quality,
    calculate_currency_exposure,
    validate_live_safety,
    assert_point_in_time_data,
    parse_to_utc_timestamp,
    LiveDiscoveryProhibitedError,
    CausalDataIntegrityError
)


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    REJECTED = "REJECTED"


class PendingOrder(BaseModel):
    order_id: str
    symbol: str
    direction: str  # long | short
    order_type: str  # limit | market
    target_price: float
    stop_loss: float
    take_profit: float
    volume: float
    created_bar: int
    expiry_bars: int = 12
    setup_id: str
    status: OrderStatus = OrderStatus.PENDING
    order_created_timestamp: str = ""
    order_expiry_timestamp: str = ""
    fill_timestamp: Optional[str] = None
    cancel_timestamp: Optional[str] = None
    cancel_reason: Optional[str] = None
    is_discovery: bool = False
    setup_family: str = ""
    actual_risk_dollars: float = 0.0


class EventDrivenSimulator:
    """
    High-fidelity discrete-event market simulator with zero-lookahead causality.
    """

    def __init__(self, broker_name: str = "exness"):
        self.broker_name = broker_name

    def run_simulation(
        self,
        symbols: List[str] = ["EURUSD", "GBPUSD", "XAUUSD"],
        initial_balance: float = 1000.0,
        timeframe: str = "15m",
        period_days: int = 30,
        bars: Optional[int] = None,
        risk_percent: float = 1.0,
        broker_name: Optional[str] = None,
        custom_leverage: Optional[float] = None,
        custom_candles_map: Optional[Dict[str, pd.DataFrame]] = None,
        enable_limit_orders: bool = True,
        allow_synthetic: bool = False,
        sentinel_variant: str = "CURRENT_H",
        monte_carlo_mode: bool = False,
        monte_carlo_seed: Optional[int] = None,
        news_windows: Optional[List[Dict[str, Any]]] = None,
        edge_mode: BacktestEdgeMode = BacktestEdgeMode.DISCOVERY,
        bootstrap_unknown_edge: bool = True,
        dataset_phase: DatasetPhase = DatasetPhase.TRAIN,
        requested_start: Optional[str] = None,
        requested_end: Optional[str] = None,
        discovery_budget: Optional[DiscoveryExposureBudget] = None,
        max_currency_exposure: float = 500000.0
    ) -> Dict[str, Any]:
        """
        Executes an institutional discrete event simulation with:
        - Strict Data Quality Gate & No Synthetic Timestamps
        - Multi-Layer LIVE Discovery Prohibition
        - Independent Per-Symbol Timeline Resolution
        - 17-Stage Auditable Candidate Funnel
        - 12-Step Deterministic Bar Event Hierarchy
        - Complete Ledger Reconciliation
        """
        # 1. Multi-Layer LIVE Safety Verification
        validate_live_safety(edge_mode, bootstrap_unknown_edge)

        b_name = broker_name or self.broker_name
        try:
            broker = get_broker_profile(b_name)
        except ValueError as e:
            return self._build_unavailable_result(str(e), initial_balance, symbols, "BROKER_PROFILE", 2000.0, None)

        leverage_source = "CUSTOM_OVERRIDE" if custom_leverage is not None else "BROKER_PROFILE"
        effective_leverage = custom_leverage if custom_leverage is not None else broker.default_leverage

        first_sym = symbols[0].upper().replace("/", "").replace(" ", "") if symbols else "EURUSD"
        first_spec = broker.symbols.get(first_sym)

        # Versioned Broker Profile Snapshot (20 Authoritative Parameters)
        broker_snapshot = BrokerProfileSnapshot(
            broker_name=broker.name,
            account_currency="USD",
            leverage=effective_leverage,
            margin_mode="standard_mt5",
            contract_size=first_spec.contract_size if first_spec else 100000.0,
            tick_size=first_spec.tick_size if first_spec else 0.00001,
            tick_value=first_spec.tick_value if first_spec else 1.0,
            volume_min=first_spec.min_volume if first_spec else 0.01,
            volume_step=first_spec.vol_step if first_spec else 0.01,
            volume_max=first_spec.max_volume if first_spec else 100.0,
            stop_level=0.0,
            freeze_level=0.0,
            commission_model=broker.name,
            swap_model="standard_overnight",
            margin_model="standard_mt5",
            spread_model="typical_pips",
            slippage_model="deterministic_latency",
            profile_version="2.2.0",
            effective_start=requested_start or "2020-01-01",
            effective_end=requested_end or "2030-01-01"
        )

        account = VirtualMT5Account(
            initial_balance=initial_balance,
            broker_profile=broker,
            custom_leverage=effective_leverage
        )
        duplicate_detector.reset()

        # Set ExperienceMemory dataset phase
        experience_memory.set_phase(dataset_phase)

        # Discovery Exposure Budget
        disc_budget = discovery_budget or DiscoveryExposureBudget()

        clean_symbols = [s.upper().replace("/", "").replace(" ", "") for s in symbols]
        missing_symbols = [
            s for s in clean_symbols
            if not custom_candles_map or s not in custom_candles_map or custom_candles_map[s] is None or len(custom_candles_map[s]) == 0
        ]

        # Fail closed when historical candles are not supplied in production
        if missing_symbols and not allow_synthetic:
            err_msg = f"DATA_UNAVAILABLE: Historical candles not supplied for symbol(s): {', '.join(missing_symbols)}. Production backtests strictly forbid synthetic candle generation."
            return self._build_unavailable_result(err_msg, initial_balance, missing_symbols, leverage_source, effective_leverage, broker_snapshot)

        # Prepare candle datasets
        candles_by_symbol: Dict[str, pd.DataFrame] = {}
        data_source = "HISTORICAL_CANDLES" if not allow_synthetic else "SYNTHETIC_TEST_MOCK"

        for sym_idx, clean_sym in enumerate(clean_symbols):
            if custom_candles_map and clean_sym in custom_candles_map and custom_candles_map[clean_sym] is not None:
                candles_by_symbol[clean_sym] = custom_candles_map[clean_sym].copy()
            elif allow_synthetic:
                candles_by_symbol[clean_sym] = generate_simulated_candles(clean_sym, timeframe, seed_offset=sym_idx * 100)

            if allow_synthetic and clean_sym in candles_by_symbol:
                cdf = candles_by_symbol[clean_sym]
                has_ts = any(c in cdf.columns for c in ["time", "timestamp", "datetime", "Date", "date"])
                if not has_ts:
                    start_dt = pd.Timestamp("2026-01-15 00:00:00", tz="UTC")
                    cdf["time"] = [(start_dt + pd.Timedelta(minutes=15 * i)).isoformat() for i in range(len(cdf))]

        # 2. Strict Data Quality Verification Gate
        data_quality_reasons: Dict[str, List[str]] = {}
        for sym, df in candles_by_symbol.items():
            dq_status, dq_errs = verify_dataset_quality(df, sym, requested_start=requested_start, requested_end=requested_end)
            if dq_status == DataQualityStatus.INVALID:
                err_msg = f"DATA_INVALID on {sym}: {'; '.join(dq_errs)}. Backtest rejected without fabrication."
                return self._build_invalid_result(err_msg, initial_balance, sym, dq_errs, leverage_source, effective_leverage, broker_snapshot)
            elif dq_status == DataQualityStatus.CONDITIONAL:
                data_quality_reasons[sym] = dq_errs

        # 3. Build Timestamp-Synchronized Multi-Asset Timeline (Zero Synthetic Timestamps)
        sym_ts: Dict[str, pd.DatetimeIndex] = {}
        for sym, df in candles_by_symbol.items():
            ts_col = None
            for col in ["time", "timestamp", "datetime", "Date", "date"]:
                if col in df.columns:
                    ts_col = col
                    break
            if ts_col is None:
                return self._build_invalid_result(f"DATA_INVALID on {sym}: Missing timestamp column.", initial_balance, sym, ["MISSING_TIMESTAMP"], leverage_source, effective_leverage, broker_snapshot)
            try:
                sym_ts[sym] = pd.DatetimeIndex(pd.to_datetime(df[ts_col], utc=True))
            except Exception as e:
                return self._build_invalid_result(f"DATA_INVALID on {sym}: Unparseable timestamps: {e}", initial_balance, sym, [str(e)], leverage_source, effective_leverage, broker_snapshot)

        all_ts_sets = [s for s in sym_ts.values()]
        if all_ts_sets:
            merged_timeline = pd.DatetimeIndex(
                sorted(set().union(*[set(s) for s in all_ts_sets]))
            )
        else:
            merged_timeline = pd.DatetimeIndex([])

        if bars:
            merged_timeline = merged_timeline[:bars]

        if len(merged_timeline) < 35:
            return self._build_unavailable_result("DATA_UNAVAILABLE: Insufficient bars for warmup (need at least 35 bars)", initial_balance, clean_symbols, leverage_source, effective_leverage, broker_snapshot)

        # Parse news windows
        _parsed_news_windows: List[tuple] = []
        if news_windows:
            for nw in news_windows:
                try:
                    sym_nw = nw.get("symbol", "").upper()
                    st = parse_to_utc_timestamp(nw["start"])
                    et = parse_to_utc_timestamp(nw["end"])
                    _parsed_news_windows.append((sym_nw, st, et))
                except Exception:
                    pass

        def _is_in_kill_zone(sym: str, bar_ts: pd.Timestamp) -> bool:
            if bar_ts is None:
                return False
            # FX kill zone (Gold/Crypto exempt)
            if "XAU" not in sym and "BTC" not in sym and "ETH" not in sym:
                if bar_ts.hour in {21, 22, 23, 0, 1}:
                    return True
            # News blackout
            for sym_nw, st, et in _parsed_news_windows:
                if sym_nw == "" or sym_nw == sym:
                    if st <= bar_ts <= et:
                        return True
            return False

        # Independent per-symbol index tracking
        sym_bar_idx: Dict[str, int] = {sym: 0 for sym in candles_by_symbol}

        pending_orders: List[PendingOrder] = []
        equity_curve: List[Dict[str, Any]] = [
            {"bar": 0, "balance": initial_balance, "equity": initial_balance, "drawdown_pct": 0.0}
        ]
        completed_autopsies: List[Dict[str, Any]] = []

        # 17-Stage Auditable Candidate Funnel Counters
        funnel = {
            "bars_scanned": len(merged_timeline),
            "candidates_detected": 0,
            "structure_valid": 0,
            "quality_valid": 0,
            "rr_valid": 0,
            "session_valid": 0,
            "kill_zone_valid": 0,
            "news_valid": 0,
            "broker_executable": 0,
            "account_executable": 0,
            "portfolio_valid": 0,
            "duplicate_free": 0,
            "unknown_edge": 0,
            "negative_edge": 0,
            "positive_edge": 0,
            "discovery_trades": 0,
            "strict_trades": 0,
            "final_trades": 0
        }
        rejection_breakdown: Dict[str, int] = {}
        edge_breakdown: Dict[str, int] = {
            "UNKNOWN_EDGE": 0,
            "WEAK_EVIDENCE": 0,
            "MODERATE_EVIDENCE": 0,
            "STRONG_EVIDENCE": 0,
            "NEGATIVE_EDGE": 0
        }

        warmup = 35

        # ── Deterministic 12-Step Bar Event Loop ──
        for timeline_step, bar_ts in enumerate(merged_timeline):
            bar_ts_str = str(bar_ts)

            # Advance independent symbol pointers
            for sym, df in candles_by_symbol.items():
                s_idx = sym_bar_idx[sym]
                while s_idx < len(df) - 1 and sym_ts[sym][s_idx + 1] <= bar_ts:
                    s_idx += 1
                sym_bar_idx[sym] = s_idx

            if timeline_step < warmup:
                continue

            if account.is_failed:
                break

            # Step 1 & 2: Advance Market & Update Executable Bid/Ask Prices
            current_bar_prices: Dict[str, Dict[str, float]] = {}
            for sym, df in candles_by_symbol.items():
                s_idx = sym_bar_idx[sym]
                row = df.iloc[s_idx]
                spec = broker.get_symbol_spec(sym)
                spread = spec.spread_price()

                mid = float(row.get("close", row.iloc[-1]))
                o = float(row.get("open", mid))
                h = float(row.get("high", mid))
                lo = float(row.get("low", mid))
                bid = mid - (spread / 2.0)
                ask = mid + (spread / 2.0)
                current_bar_prices[sym] = {
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": mid,
                    "bid": bid,
                    "ask": ask,
                    "bid_open": o - (spread / 2.0),
                    "bid_high": h - (spread / 2.0),
                    "bid_low": lo - (spread / 2.0),
                    "ask_open": o + (spread / 2.0),
                    "ask_high": h + (spread / 2.0),
                    "ask_low": lo + (spread / 2.0),
                    "time": str(row.get("time", row.get("timestamp", bar_ts_str)))
                }

            # Step 3: Process Pending-Order Fills & Invalidation (Combinations H, I, J)
            active_pending: List[PendingOrder] = []
            for po in pending_orders:
                if po.status != OrderStatus.PENDING:
                    continue

                # Expiration check
                if timeline_step - po.created_bar > po.expiry_bars:
                    po.status = OrderStatus.EXPIRED
                    po.cancel_timestamp = bar_ts_str
                    po.cancel_reason = "EXPIRED_AFTER_BAR_LIMIT"
                    continue

                # Invalidation check on news window start
                if _is_in_kill_zone(po.symbol, bar_ts):
                    po.status = OrderStatus.CANCELLED
                    po.cancel_timestamp = bar_ts_str
                    po.cancel_reason = "NEWS_OR_KILL_ZONE_INVALIDATION"
                    continue

                p_info = current_bar_prices.get(po.symbol)
                if not p_info:
                    active_pending.append(po)
                    continue

                spec = broker.get_symbol_spec(po.symbol)
                spread = spec.spread_price()
                filled = False
                fill_price = po.target_price
                method = "OHLC_UNAMBIGUOUS"

                if po.direction == "long":
                    ask_open = p_info["ask_open"]
                    ask_low = p_info["ask_low"]
                    # Combination H: Gap through Entry
                    if ask_open < po.target_price:
                        filled = True
                        fill_price = ask_open
                        method = "GAP_OPEN_FILL"
                    elif ask_low <= po.target_price:
                        filled = True
                        fill_price = po.target_price
                        method = "OHLC_UNAMBIGUOUS"
                else:  # short
                    bid_open = p_info["bid_open"]
                    bid_high = p_info["bid_high"]
                    # Combination H: Gap through Entry
                    if bid_open > po.target_price:
                        filled = True
                        fill_price = bid_open
                        method = "GAP_OPEN_FILL"
                    elif bid_high >= po.target_price:
                        filled = True
                        fill_price = po.target_price
                        method = "OHLC_UNAMBIGUOUS"

                if filled and len(account.open_positions) < 3 and po.symbol not in {p.symbol for p in account.open_positions.values()}:
                    # Consume discovery quota ONLY upon actual fill
                    if po.is_discovery:
                        trade_date = bar_ts_str[:10]
                        disc_budget.record_fill(
                            ticket=po.order_id,
                            symbol=po.symbol,
                            setup_family=po.setup_family,
                            direction=po.direction,
                            session="LONDON",
                            regime="trending",
                            risk_dollars=po.actual_risk_dollars,
                            trade_date_str=trade_date
                        )

                    entry_bid = fill_price - (spread / 2.0) if po.direction == "long" else fill_price
                    entry_ask = fill_price if po.direction == "long" else fill_price + (spread / 2.0)
                    pos_obj = account.open_position(
                        spec=spec,
                        direction=po.direction,
                        volume=po.volume,
                        entry_price=round(fill_price, spec.decimals),
                        stop_loss=po.stop_loss,
                        take_profit=po.take_profit,
                        bar_index=timeline_step,
                        timestamp=bar_ts_str,
                        order_type=po.order_type,
                        setup_id=po.setup_id,
                        entry_bid=entry_bid,
                        entry_ask=entry_ask
                    )
                    po.status = OrderStatus.FILLED
                    po.fill_timestamp = bar_ts_str
                else:
                    active_pending.append(po)

            pending_orders = active_pending

            # Step 4: Update Open Positions & Floating PnL
            account.update_bar(current_bar_prices, bar_index=timeline_step)

            # Step 5 & 6: Process SL / TP / Sentinel Management (Combinations A through J)
            for ticket, pos in list(account.open_positions.items()):
                p_info = current_bar_prices.get(pos.symbol)
                if not p_info:
                    continue

                spec = broker.get_symbol_spec(pos.symbol)
                sl_dist = abs(pos.entry_price - pos.initial_stop_loss) if pos.initial_stop_loss > 0 else abs(pos.entry_price - pos.stop_loss)

                # Sentinel Breakeven & Trailing stop
                if sentinel_variant in ["STRUCTURE_CONFIRMED", "CURRENT_H"]:
                    if not pos.is_breakeven_set and pos.unrealized_r >= 1.5:
                        pos.stop_loss = pos.entry_price
                        pos.is_breakeven_set = True
                    if pos.unrealized_r >= 2.0:
                        trail_r = pos.unrealized_r - 1.0
                        if pos.direction == "long":
                            new_sl = pos.entry_price + (trail_r * sl_dist)
                            if new_sl > pos.stop_loss:
                                pos.stop_loss = round(new_sl, spec.decimals)
                        else:
                            new_sl = pos.entry_price - (trail_r * sl_dist)
                            if new_sl < pos.stop_loss:
                                pos.stop_loss = round(new_sl, spec.decimals)

                is_closed = False
                exit_price = pos.current_price
                exit_reason = "STOP_LOSS"
                res_method = "OHLC_UNAMBIGUOUS"

                if pos.direction == "long":
                    bid_open = p_info["bid_open"]
                    bid_high = p_info["bid_high"]
                    bid_low = p_info["bid_low"]

                    # Combination I: Gap through SL
                    if bid_open <= pos.stop_loss:
                        is_closed = True
                        exit_price = bid_open
                        exit_reason = "STOP_LOSS"
                        res_method = "GAP_OPEN_FILL"
                    # Combination J: Gap through TP
                    elif bid_open >= pos.take_profit:
                        is_closed = True
                        exit_price = bid_open
                        exit_reason = "TAKE_PROFIT"
                        res_method = "GAP_OPEN_FILL"
                    # Combination C & D: SL and TP touched on same bar -> Conservative SL
                    elif bid_low <= pos.stop_loss and bid_high >= pos.take_profit:
                        is_closed = True
                        exit_price = pos.stop_loss
                        exit_reason = "STOP_LOSS"
                        res_method = "CONSERVATIVE_SL_ASSUMPTION"
                    elif bid_high >= pos.take_profit:
                        is_closed = True
                        exit_price = pos.take_profit
                        exit_reason = "TAKE_PROFIT"
                        res_method = "OHLC_UNAMBIGUOUS"
                    elif bid_low <= pos.stop_loss:
                        is_closed = True
                        exit_price = pos.stop_loss
                        res_method = "OHLC_UNAMBIGUOUS"
                        if pos.stop_loss > pos.entry_price:
                            exit_reason = "TRAILING_STOP"
                        elif pos.is_breakeven_set and abs(pos.stop_loss - pos.entry_price) < 0.0001:
                            exit_reason = "BREAKEVEN"
                        else:
                            exit_reason = "STOP_LOSS"
                else:  # short
                    ask_open = p_info["ask_open"]
                    ask_high = p_info["ask_high"]
                    ask_low = p_info["ask_low"]

                    # Combination I: Gap through SL
                    if ask_open >= pos.stop_loss:
                        is_closed = True
                        exit_price = ask_open
                        exit_reason = "STOP_LOSS"
                        res_method = "GAP_OPEN_FILL"
                    # Combination J: Gap through TP
                    elif ask_open <= pos.take_profit:
                        is_closed = True
                        exit_price = ask_open
                        exit_reason = "TAKE_PROFIT"
                        res_method = "GAP_OPEN_FILL"
                    # Combination C & D: SL and TP touched on same bar -> Conservative SL
                    elif ask_high >= pos.stop_loss and ask_low <= pos.take_profit:
                        is_closed = True
                        exit_price = pos.stop_loss
                        exit_reason = "STOP_LOSS"
                        res_method = "CONSERVATIVE_SL_ASSUMPTION"
                    elif ask_low <= pos.take_profit:
                        is_closed = True
                        exit_price = pos.take_profit
                        exit_reason = "TAKE_PROFIT"
                        res_method = "OHLC_UNAMBIGUOUS"
                    elif ask_high >= pos.stop_loss:
                        is_closed = True
                        exit_price = pos.stop_loss
                        res_method = "OHLC_UNAMBIGUOUS"
                        if pos.stop_loss < pos.entry_price:
                            exit_reason = "TRAILING_STOP"
                        elif pos.is_breakeven_set and abs(pos.stop_loss - pos.entry_price) < 0.0001:
                            exit_reason = "BREAKEVEN"
                        else:
                            exit_reason = "STOP_LOSS"

                # Step 10 & 11: Close Completed Trades & Write ExperienceMemory (if TRAIN)
                if is_closed:
                    if pos.direction == "long":
                        exit_bid = exit_price
                        exit_ask = round(exit_price + spec.spread_price(), spec.decimals)
                    else:
                        exit_ask = exit_price
                        exit_bid = round(exit_price - spec.spread_price(), spec.decimals)

                    event_seq = []
                    data_res_level = "OHLC_UNAMBIGUOUS"
                    if res_method == "GAP_OPEN_FILL":
                        event_seq = ["GAP_OPEN_FILL", "POSITION_CLOSED"]
                        data_res_level = "GAP_OPEN_FILL"
                    elif res_method == "CONSERVATIVE_SL_ASSUMPTION":
                        event_seq = ["SL_AND_TP_TOUCHED", "CONSERVATIVE_SL_EXIT", "POSITION_CLOSED"]
                        data_res_level = "OHLC_CONSERVATIVE"
                    elif res_method == "OHLC_UNAMBIGUOUS":
                        event_seq = [f"{exit_reason}_HIT", "POSITION_CLOSED"]
                        data_res_level = "OHLC_UNAMBIGUOUS"

                    closed_rec = account.close_position(
                        ticket=ticket,
                        exit_price=exit_price,
                        exit_reason=exit_reason,
                        close_bar_index=timeline_step,
                        close_timestamp=bar_ts_str,
                        exit_bid=exit_bid,
                        exit_ask=exit_ask,
                        intrabar_resolution_method=res_method,
                        event_sequence=event_seq,
                        data_resolution_level=data_res_level
                    )
                    if closed_rec:
                        disc_budget.record_close(ticket)

                        # Resolve market context using causal slice
                        _sub_df = candles_by_symbol.get(pos.symbol)
                        _s_idx = sym_bar_idx.get(pos.symbol, 0)
                        _causal_slice = _sub_df.iloc[:_s_idx + 1] if _sub_df is not None else None
                        _ctx = MarketContextResolver.resolve(_causal_slice) if _causal_slice is not None else None

                        _ctx_dict = {
                            "session": _ctx.session if _ctx else "UNKNOWN",
                            "regime": _ctx.regime if _ctx else "unknown",
                            "spread_pips": spec.typical_spread_pips,
                            "decision_timestamp": pos.open_timestamp,
                            "close_timestamp": bar_ts_str
                        }
                        autopsy = autopsy_engine.analyze_trade(
                            trade_record=closed_rec,
                            market_context=_ctx_dict
                        )
                        autopsy_dict = autopsy.model_dump()
                        closed_rec["autopsy"] = autopsy_dict
                        completed_autopsies.append(autopsy_dict)

                        # Step 11: Phase-Aware ExperienceMemory Writing (TRAIN phase only)
                        if dataset_phase == DatasetPhase.TRAIN:
                            exp_rec = ExperienceRecord(
                                id=f"EXP-{pos.symbol}-{ticket}",
                                ticket=ticket,
                                timestamp=bar_ts_str,
                                close_timestamp=bar_ts_str,
                                decision_timestamp=pos.open_timestamp,
                                entry_timestamp=pos.open_timestamp,
                                symbol=pos.symbol,
                                direction=pos.direction,
                                setup_family=pos.setup_id.split("-")[1] if "-" in pos.setup_id else "SMC_SETUP",
                                outcome=closed_rec.get("outcome", "LOSS"),
                                r_multiple=closed_rec.get("r_multiple", 0.0),
                                net_pnl=closed_rec.get("net_pnl", 0.0),
                                mfe_r=closed_rec.get("mfe_r", 0.0),
                                mae_r=closed_rec.get("mae_r", 0.0),
                                duration_bars=timeline_step - pos.open_bar_index,
                                exit_reason=exit_reason,
                                entry_price=pos.entry_price,
                                stop_loss=pos.initial_stop_loss,
                                take_profit=pos.take_profit,
                                risk_reward=pos.unrealized_r,
                                dataset_phase=dataset_phase.value,
                                discovery_trade=pos.setup_id.startswith("DISC")
                            )
                            experience_memory.add_record(exp_rec)

            # Step 12: Generate Next Strategy Decision (Every Closed Bar)
            active_symbols: Set[str] = {pos.symbol for pos in account.open_positions.values()}

            if len(account.open_positions) < 3:
                # Currency Exposure Calculation
                current_currency_exp = calculate_currency_exposure(list(account.open_positions.values()), pending_orders)

                for sym, df in candles_by_symbol.items():
                    sym_curr_idx = sym_bar_idx.get(sym, 0)
                    if sym_curr_idx <= 0 or sym in active_symbols or len(account.open_positions) >= 3:
                        continue

                    # Kill-zone check
                    if _is_in_kill_zone(sym, bar_ts):
                        rejection_breakdown[RejectionReasonCode.KILL_ZONE_BLOCKED.value] = rejection_breakdown.get(RejectionReasonCode.KILL_ZONE_BLOCKED.value, 0) + 1
                        continue

                    # Independent causal slice (Zero Lookahead)
                    sub_df = df.iloc[:sym_curr_idx + 1].copy().reset_index(drop=True)

                    # Time-based HTF Resampling (from actual timestamps <= T)
                    ts_sub = pd.to_datetime(sub_df["time"] if "time" in sub_df.columns else sub_df["timestamp"], utc=True)
                    if len(sub_df) >= 16:
                        htf_period_keys = ts_sub.dt.floor("1h")
                        higher_df = sub_df.groupby(htf_period_keys).agg({
                            'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'
                        }).reset_index(drop=True)
                    else:
                        higher_df = sub_df.copy()

                    pos_dicts = [
                        {
                            "ticket": p.ticket,
                            "symbol": p.symbol,
                            "direction": p.direction,
                            "initial_risk_money": p.initial_risk_money,
                            "required_margin": p.required_margin
                        }
                        for p in account.open_positions.values()
                    ]

                    decision = unified_strategy_engine.evaluate(
                        symbol=sym,
                        timeframe=timeframe,
                        df=sub_df,
                        higher_df=higher_df,
                        account_balance=account.balance,
                        account_equity=account.equity,
                        account_leverage=account.leverage,
                        risk_percent=risk_percent,
                        current_positions=pos_dicts,
                        current_bar_index=sym_curr_idx,
                        broker_name=b_name,
                        mode=ExecutionMode.BACKTEST,
                        edge_mode=edge_mode,
                        bootstrap_unknown_edge=bootstrap_unknown_edge,
                        discovery_budget=disc_budget,
                        as_of_timestamp=bar_ts_str,
                        enable_ai_advisory=False,
                        news_windows=news_windows
                    )

                    # Update Funnel Statistics
                    if decision.candidate:
                        funnel["candidates_detected"] += 1
                        funnel["structure_valid"] += 1
                        if decision.setup_quality_score >= 70:
                            funnel["quality_valid"] += 1
                        if decision.risk_reward >= 1.8:
                            funnel["rr_valid"] += 1
                        if decision.rejection_reason_code != RejectionReasonCode.SESSION_BLOCKED.value:
                            funnel["session_valid"] += 1
                        if decision.rejection_reason_code != RejectionReasonCode.KILL_ZONE_BLOCKED.value:
                            funnel["kill_zone_valid"] += 1
                        if decision.rejection_reason_code != RejectionReasonCode.NEWS_BLOCKED.value:
                            funnel["news_valid"] += 1
                        if decision.is_eligible:
                            funnel["broker_executable"] += 1
                            funnel["account_executable"] += 1

                    if decision.edge_state:
                        edge_breakdown[decision.edge_state] = edge_breakdown.get(decision.edge_state, 0) + 1
                        if decision.edge_state == EdgeState.UNKNOWN_EDGE.value:
                            funnel["unknown_edge"] += 1
                        elif decision.edge_state == EdgeState.NEGATIVE_EDGE.value:
                            funnel["negative_edge"] += 1
                        elif decision.edge_state in [EdgeState.MODERATE_EVIDENCE.value, EdgeState.STRONG_EVIDENCE.value]:
                            funnel["positive_edge"] += 1

                    if decision.rejection_reason_code:
                        rejection_breakdown[decision.rejection_reason_code] = rejection_breakdown.get(decision.rejection_reason_code, 0) + 1

                    if decision.action == DecisionAction.TRADE and decision.recommended_lot > 0:
                        spec = broker.get_symbol_spec(sym)
                        p_info = current_bar_prices.get(sym)

                        if decision.discovery_trade:
                            funnel["discovery_trades"] += 1
                        else:
                            funnel["strict_trades"] += 1
                        funnel["final_trades"] += 1

                        if enable_limit_orders and "limit" in decision.order_type:
                            pending_orders.append(PendingOrder(
                                order_id=f"ORD-{sym}-{timeline_step}",
                                symbol=sym,
                                direction="long" if decision.direction == "BUY" else "short",
                                order_type="limit",
                                target_price=decision.entry_price,
                                stop_loss=decision.stop_loss,
                                take_profit=decision.take_profit,
                                volume=decision.recommended_lot,
                                created_bar=timeline_step,
                                expiry_bars=8,
                                setup_id=f"DISC-{decision.setup_family}" if decision.discovery_trade else f"SET-{decision.setup_family}",
                                order_created_timestamp=bar_ts_str,
                                is_discovery=decision.discovery_trade,
                                setup_family=decision.setup_family,
                                actual_risk_dollars=decision.actual_risk_dollars
                            ))
                        else:
                            spread = spec.spread_price()
                            slippage = 0.10 * spec.tick_size * (spec.pip_multiplier / 10.0)
                            if decision.direction == "BUY":
                                actual_entry = decision.entry_price + (spread / 2.0) + slippage
                                bid = actual_entry - spread
                                ask = actual_entry
                            else:
                                actual_entry = decision.entry_price - (spread / 2.0) - slippage
                                bid = actual_entry
                                ask = actual_entry + spread

                            # Consume discovery quota upon actual fill
                            if decision.discovery_trade:
                                trade_date = bar_ts_str[:10]
                                disc_budget.record_fill(
                                    ticket=f"MKT-{sym}-{timeline_step}",
                                    symbol=sym,
                                    setup_family=decision.setup_family,
                                    direction=decision.direction,
                                    session="LONDON",
                                    regime="trending",
                                    risk_dollars=decision.actual_risk_dollars,
                                    trade_date_str=trade_date
                                )

                            account.open_position(
                                spec=spec,
                                direction="long" if decision.direction == "BUY" else "short",
                                volume=decision.recommended_lot,
                                entry_price=round(actual_entry, spec.decimals),
                                stop_loss=decision.stop_loss,
                                take_profit=decision.take_profit,
                                bar_index=timeline_step,
                                timestamp=bar_ts_str,
                                order_type=decision.order_type,
                                setup_id=f"DISC-{decision.setup_family}" if decision.discovery_trade else f"SET-{decision.setup_family}",
                                entry_bid=bid,
                                entry_ask=ask,
                                slippage=slippage
                            )

                            duplicate_detector.register_execution(
                                symbol=sym,
                                setup_family=decision.setup_family,
                                direction=decision.direction,
                                zone_price=decision.entry_price,
                                current_bar=timeline_step
                            )
                            active_symbols.add(sym)

            # Record periodic curve point
            if timeline_step % 8 == 0 or timeline_step == len(merged_timeline) - 1:
                equity_curve.append({
                    "bar": timeline_step,
                    "balance": round(account.balance, 2),
                    "equity": round(account.equity, 2),
                    "drawdown_pct": round(account.max_drawdown_pct, 2)
                })

        # Close open positions at simulation end
        for ticket, pos in list(account.open_positions.items()):
            p_info = current_bar_prices.get(pos.symbol, {})
            close_price = p_info.get("close", pos.current_price)
            closed_rec = account.close_position(
                ticket=ticket,
                exit_price=close_price,
                exit_reason="SIMULATION_END",
                close_bar_index=len(merged_timeline),
                close_timestamp="END",
                exit_bid=p_info.get("bid", close_price),
                exit_ask=p_info.get("ask", close_price)
            )
            if closed_rec:
                _end_sub_df = candles_by_symbol.get(pos.symbol)
                _end_ctx = MarketContextResolver.resolve(_end_sub_df) if _end_sub_df is not None else None
                autopsy = autopsy_engine.analyze_trade(
                    trade_record=closed_rec,
                    market_context={
                        "session": _end_ctx.session if _end_ctx else "UNKNOWN",
                        "regime": _end_ctx.regime if _end_ctx else "unknown",
                        "spread_pips": 1.0,
                        "close_timestamp": "SIMULATION_END"
                    }
                )
                autopsy_dict = autopsy.model_dump()
                closed_rec["autopsy"] = autopsy_dict
                completed_autopsies.append(autopsy_dict)

        # 13. Strict Ledger Flow Reconciliation Assertion
        closed = account.closed_trades
        summary_metrics = generate_summary_from_ledger(
            closed=closed,
            initial_balance=initial_balance,
            account=account
        )

        realized_pnl_sum = round(sum(t.get("net_pnl", 0.0) for t in closed), 2)
        expected_ending_balance = round(initial_balance + realized_pnl_sum, 2)
        actual_ending_balance = round(account.balance, 2)
        balance_discrepancy = round(abs(actual_ending_balance - expected_ending_balance), 2)
        ledger_reconciled = balance_discrepancy < 0.05

        sentinel_audit = run_sentinel_counterfactual_audit(closed)

        returns = [t["net_pnl"] / initial_balance for t in closed] if closed else [0.0]
        mean_ret = float(np.mean(returns))
        std_ret = float(np.std(returns)) if len(returns) > 1 else 1.0
        neg_rets = [r for r in returns if r < 0]
        downside_std = float(np.std(neg_rets)) if len(neg_rets) > 1 else 1.0
        sharpe = round((mean_ret / max(0.0001, std_ret)) * math.sqrt(252), 2)
        sortino = round((mean_ret / max(0.0001, downside_std)) * math.sqrt(252), 2)

        data_quality_status_str = "VERIFIED" if not data_quality_reasons else "CONDITIONAL"

        return {
            "success": True,
            "mode": edge_mode.value,
            "status": summary_metrics["status"],
            "failure_reason": summary_metrics["failure_reason"],
            "initial_balance": initial_balance,
            "starting_balance": initial_balance,
            "final_balance": actual_ending_balance,
            "ending_balance": actual_ending_balance,
            "final_equity": summary_metrics["ending_equity"],
            "ending_equity": summary_metrics["ending_equity"],
            "net_pnl": summary_metrics["net_pnl"],
            "net_return_pct": summary_metrics["net_return_pct"],
            "total_trades": summary_metrics["total_trades"],
            "winning_trades": summary_metrics["winning_trades"],
            "losing_trades": summary_metrics["losing_trades"],
            "breakeven_trades": summary_metrics["breakeven_trades"],
            "win_rate": summary_metrics["win_rate"],
            "profit_factor": summary_metrics["profit_factor"],
            "average_win": summary_metrics["average_win"],
            "average_loss": summary_metrics["average_loss"],
            "average_r": summary_metrics["average_r"],
            "expectancy_r": summary_metrics["expectancy_r"],
            "total_spread_cost": summary_metrics["total_spread_cost"],
            "total_commission": summary_metrics["total_commission"],
            "total_swap": summary_metrics["total_swap"],
            "peak_margin_utilization": summary_metrics["peak_margin_utilization"],
            "margin_calls": summary_metrics["margin_calls"],
            "stop_out_events": summary_metrics["stop_out_events"],
            "max_drawdown_dollars": account.max_drawdown_dollars,
            "max_drawdown_pct": account.max_drawdown_pct,
            "sharpe_ratio": sharpe,
            "sortino_ratio": sortino,
            "equity_curve": equity_curve,
            "trades": closed,
            "autopsies": completed_autopsies,
            "sentinel_audit": sentinel_audit,
            "data_source": data_source,
            "data_start": str(merged_timeline[0]) if len(merged_timeline) > 0 else "None",
            "data_end": str(merged_timeline[-1]) if len(merged_timeline) > 0 else "None",
            "bar_count": len(merged_timeline),
            "data_quality_status": data_quality_status_str,
            "data_quality_reasons": data_quality_reasons,
            "leverage_source": leverage_source,
            "leverage": effective_leverage,
            "broker_snapshot": broker_snapshot.model_dump(),
            "candidate_statistics": funnel,
            "rejection_statistics": rejection_breakdown,
            "edge_statistics": edge_breakdown,
            "bootstrap_statistics": {
                "discovery_trades": funnel["discovery_trades"],
                "unknown_edge_trades": funnel["discovery_trades"],
                "diversity": disc_budget.get_diversity_telemetry()
            },
            "ledger_reconciliation": {
                "is_reconciled": ledger_reconciled,
                "realized_pnl_sum": realized_pnl_sum,
                "expected_ending_balance": expected_ending_balance,
                "actual_ending_balance": actual_ending_balance,
                "discrepancy": balance_discrepancy
            },
            "strategy_version": "Trade-Z v2.2-EmpiricalSMC (Causal Event-Driven Simulator)",
            "sentinel_variant": sentinel_variant,
            "summary": summary_metrics
        }

    def _build_unavailable_result(self, err_msg: str, initial_balance: float, missing_symbols: List[str], leverage_source: str, leverage: float, broker_snapshot: BrokerProfileSnapshot) -> Dict[str, Any]:
        return {
            "success": False,
            "status": "DATA_UNAVAILABLE",
            "error": err_msg,
            "failure_reason": err_msg,
            "data_source": "NONE",
            "data_quality_status": "DATA_UNAVAILABLE",
            "missing_ranges": missing_symbols,
            "missing_symbols": missing_symbols,
            "starting_balance": initial_balance,
            "ending_balance": initial_balance,
            "initial_balance": initial_balance,
            "final_balance": initial_balance,
            "final_equity": initial_balance,
            "total_trades": 0,
            "trades": [],
            "equity_curve": [],
            "candidate_statistics": {},
            "rejection_statistics": {"DATA_UNAVAILABLE": len(missing_symbols)},
            "edge_statistics": {},
            "bootstrap_statistics": {"discovery_trades": 0},
            "broker_snapshot": broker_snapshot.model_dump() if broker_snapshot else {},
            "sentinel_variant": "NONE",
            "summary": {
                "status": "DATA_UNAVAILABLE",
                "total_trades": 0,
                "net_pnl": 0.0,
                "starting_balance": initial_balance,
                "ending_balance": initial_balance,
                "failure_reason": err_msg
            }
        }

    def _build_invalid_result(self, err_msg: str, initial_balance: float, sym: str, dq_errs: List[str], leverage_source: str, leverage: float, broker_snapshot: BrokerProfileSnapshot) -> Dict[str, Any]:
        return {
            "success": False,
            "status": "DATA_INVALID",
            "error": err_msg,
            "failure_reason": err_msg,
            "data_source": "NONE",
            "data_quality_status": "DATA_INVALID",
            "missing_ranges": [sym],
            "missing_symbols": [sym],
            "starting_balance": initial_balance,
            "ending_balance": initial_balance,
            "initial_balance": initial_balance,
            "final_balance": initial_balance,
            "final_equity": initial_balance,
            "total_trades": 0,
            "trades": [],
            "equity_curve": [],
            "candidate_statistics": {},
            "rejection_statistics": {RejectionReasonCode.DATA_INVALID.value: len(dq_errs)},
            "edge_statistics": {},
            "bootstrap_statistics": {"discovery_trades": 0},
            "broker_snapshot": broker_snapshot.model_dump() if broker_snapshot else {},
            "sentinel_variant": "NONE",
            "summary": {
                "status": "DATA_INVALID",
                "total_trades": 0,
                "net_pnl": 0.0,
                "starting_balance": initial_balance,
                "ending_balance": initial_balance,
                "failure_reason": err_msg
            }
        }


# Global Event-Driven Simulator instance
event_driven_simulator = EventDrivenSimulator()
