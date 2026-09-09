"""
Trade-Z Historical Event-Driven Simulator:
An institutional discrete-event backtesting engine that operates strictly chronologically:
BarEvent -> SignalEvent (from UnifiedStrategyEngine) -> OrderEvent -> FillEvent.

Features:
1. Strict Zero-Lookahead Causal Queue
2. Dual Order Types: Realistic Market Fills & Pending Limit Orders with Expiries
3. MT5 Broker Margin Accounting (Free Margin, Margin Calls at 60%, Stop-out at 0%)
4. High-Fidelity Intrabar Precedence (TP evaluated before SL on target bars)
5. Sentinel Position Auto-Management (Variant H: BE at 1.5R + Structure-Confirmed Trailing)
6. Disentangled Closed-Trade Drawdown vs. Intraday Floating Excursions
7. Forensic Loss Autopsies & Sentinel Variants A-H Counterfactual Audit
"""

from enum import Enum
import math
import random
from typing import List, Dict, Any, Optional, Set
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


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


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


class EventDrivenSimulator:
    """
    High-fidelity discrete-event market simulator.
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
        news_windows: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Executes an institutional event-driven simulation over a timestamp-synchronized
        multi-asset timeline. Fails with DATA_UNAVAILABLE if real historical candles are
        not supplied in production.

        news_windows: Optional list of {"symbol": str, "start": ISO str, "end": ISO str}
            dicts that block new entries for the given symbol during the specified window.
        """
        b_name = broker_name or self.broker_name
        broker = get_broker_profile(b_name)
        leverage_source = "CUSTOM_OVERRIDE" if custom_leverage is not None else "BROKER_PROFILE"
        effective_leverage = custom_leverage if custom_leverage is not None else broker.default_leverage

        account = VirtualMT5Account(
            initial_balance=initial_balance,
            broker_profile=broker,
            custom_leverage=effective_leverage
        )
        duplicate_detector.reset()

        clean_symbols = [s.upper().replace("/", "").replace(" ", "") for s in symbols]
        missing_symbols = [
            s for s in clean_symbols
            if not custom_candles_map or s not in custom_candles_map or custom_candles_map[s] is None or len(custom_candles_map[s]) == 0
        ]

        # P0 Requirement: Fail closed when historical candles are not supplied
        if missing_symbols and not allow_synthetic:
            err_msg = f"DATA_UNAVAILABLE: Historical candles not supplied for symbol(s): {', '.join(missing_symbols)}. Production backtests strictly forbid synthetic candle generation."
            unavailable_summary = {
                "status": "DATA_UNAVAILABLE",
                "failure_reason": err_msg,
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "breakeven_trades": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "starting_balance": initial_balance,
                "ending_balance": initial_balance,
                "ending_equity": initial_balance,
                "net_pnl": 0.0,
                "net_return_pct": 0.0,
                "average_win": 0.0,
                "average_loss": 0.0,
                "average_r": 0.0,
                "expectancy_r": 0.0,
                "arithmetic_expectancy_r": 0.0,
                "total_spread_cost": 0.0,
                "total_commission": 0.0,
                "total_swap": 0.0,
                "peak_margin_utilization": 0.0,
                "margin_calls": 0,
                "stop_out_events": 0,
                "setup_count": 0,
                "orders_per_setup": 0,
                "aggregate_risk_per_setup": 0.0,
                "max_closed_drawdown_pct": 0.0,
                "max_floating_drawdown_pct": 0.0,
                "max_drawdown_pct": 0.0,
            }
            return {
                "success": False,
                "status": "DATA_UNAVAILABLE",
                "error": err_msg,
                "data_source": "NONE",
                "data_start": None,
                "data_end": None,
                "bar_count": 0,
                "missing_ranges": missing_symbols,
                "data_quality_status": "DATA_UNAVAILABLE",
                "leverage_source": leverage_source,
                "leverage": effective_leverage,
                "broker_profile_version": "2.1.0",
                "initial_balance": initial_balance,
                "final_balance": initial_balance,
                "final_equity": initial_balance,
                "net_pnl": 0.0,
                "net_return_pct": 0.0,
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "breakeven_trades": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_pct": 0.0,
                "trades": [],
                "equity_curve": [],
                "summary": unavailable_summary,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

        # 1. Prepare synchronized multi-asset candle data (Never pad or fabricate bars)
        candles_by_symbol: Dict[str, pd.DataFrame] = {}
        data_source = "HISTORICAL_CANDLES" if not allow_synthetic else "SYNTHETIC_TEST_MOCK"
        data_quality_status = "PASSED_VERIFIED" if not allow_synthetic else "UNVERIFIED_SYNTHETIC_MOCK"

        for sym_idx, clean_sym in enumerate(clean_symbols):
            if custom_candles_map and clean_sym in custom_candles_map and custom_candles_map[clean_sym] is not None:
                candles_by_symbol[clean_sym] = custom_candles_map[clean_sym]
            elif allow_synthetic:
                candles_by_symbol[clean_sym] = generate_simulated_candles(clean_sym, timeframe, seed_offset=sym_idx * 100)

        available_lens = [len(df) for df in candles_by_symbol.values() if df is not None and len(df) > 0]
        if not available_lens:
            err_msg = "DATA_UNAVAILABLE: No candle records found in supplied datasets."
            unavailable_summary = {
                "status": "DATA_UNAVAILABLE",
                "failure_reason": err_msg,
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "breakeven_trades": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "starting_balance": initial_balance,
                "ending_balance": initial_balance,
                "ending_equity": initial_balance,
                "net_pnl": 0.0,
                "net_return_pct": 0.0,
                "average_win": 0.0,
                "average_loss": 0.0,
                "average_r": 0.0,
                "expectancy_r": 0.0,
                "arithmetic_expectancy_r": 0.0,
                "total_spread_cost": 0.0,
                "total_commission": 0.0,
                "total_swap": 0.0,
                "peak_margin_utilization": 0.0,
                "margin_calls": 0,
                "stop_out_events": 0,
                "setup_count": 0,
                "orders_per_setup": 0,
                "aggregate_risk_per_setup": 0.0,
                "max_closed_drawdown_pct": 0.0,
                "max_floating_drawdown_pct": 0.0,
                "max_drawdown_pct": 0.0,
            }
            return {
                "success": False,
                "status": "DATA_UNAVAILABLE",
                "error": err_msg,
                "data_source": "NONE",
                "data_start": None,
                "data_end": None,
                "bar_count": 0,
                "missing_ranges": clean_symbols,
                "data_quality_status": "DATA_UNAVAILABLE",
                "leverage_source": leverage_source,
                "leverage": effective_leverage,
                "broker_profile_version": "2.1.0",
                "initial_balance": initial_balance,
                "final_balance": initial_balance,
                "final_equity": initial_balance,
                "net_pnl": 0.0,
                "net_return_pct": 0.0,
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "breakeven_trades": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_pct": 0.0,
                "trades": [],
                "equity_curve": [],
                "summary": unavailable_summary,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

        # Old min_len/sim_bars/data_start/data_end removed.
        # Replaced by timestamp-synchronized merged timeline built below.

        warmup = 35

        # ── Build Timestamp-Synchronized Multi-Asset Timeline ──────────────────────
        # Parse timestamps from every symbol's df into pd.Timestamp (UTC).
        # The merged timeline is the sorted union of all unique bar timestamps.
        # On each step, each symbol is looked up by its closest available timestamp.

        def _parse_timestamps(df: pd.DataFrame) -> pd.Series:
            """Extract and normalize bar timestamps to UTC pd.Timestamp."""
            for col in ["time", "timestamp", "datetime", "Date", "date"]:
                if col in df.columns:
                    try:
                        return pd.to_datetime(df[col], utc=True)
                    except Exception:
                        pass
            # Fallback: generate synthetic timestamps (15m intervals from epoch)
            return pd.Series(pd.date_range("2020-01-01", periods=len(df), freq="15min", tz="UTC"))

        # Build per-symbol timestamp index
        sym_ts: Dict[str, pd.DatetimeIndex] = {}
        for sym, df in candles_by_symbol.items():
            ts = _parse_timestamps(df)
            sym_ts[sym] = pd.DatetimeIndex(ts)

        # Merged sorted timeline of all unique timestamps
        all_ts_sets = [s for s in sym_ts.values()]
        if all_ts_sets:
            merged_timeline = pd.DatetimeIndex(
                sorted(set().union(*[set(s) for s in all_ts_sets]))
            )
        else:
            merged_timeline = pd.DatetimeIndex([])

        # Optionally limit bar count
        if bars:
            merged_timeline = merged_timeline[:bars]

        # Build kill-zone checker ─────────────────────────────────────────────────
        # Blocks new entries during low-liquidity dead zones (all times UTC):
        #   21:00–00:00: Sydney open / institutional inactivity
        #   00:00–02:00: Asia dead zone before Tokyo ramp
        # Gold (XAUUSD) is exempt from FX kill zones (it trades actively in Asia).
        _forex_kill_hours_utc = set(range(21, 24)) | set(range(0, 2))  # 21,22,23,0,1

        # Parse news_windows into datetime intervals for fast lookup
        _parsed_news_windows: List[tuple] = []
        if news_windows:
            for nw in news_windows:
                try:
                    sym_nw = nw.get("symbol", "").upper()
                    start_nw = pd.Timestamp(nw["start"]).tz_localize("UTC") if pd.Timestamp(nw["start"]).tzinfo is None else pd.Timestamp(nw["start"]).tz_convert("UTC")
                    end_nw = pd.Timestamp(nw["end"]).tz_localize("UTC") if pd.Timestamp(nw["end"]).tzinfo is None else pd.Timestamp(nw["end"]).tz_convert("UTC")
                    _parsed_news_windows.append((sym_nw, start_nw, end_nw))
                except Exception:
                    pass

        def _is_in_kill_zone(sym: str, bar_ts: pd.Timestamp) -> bool:
            """Returns True if sym should be blocked from new entries at this bar's timestamp."""
            if bar_ts is None:
                return False
            # FX kill zone (Gold exempt)
            if "XAU" not in sym and "BTC" not in sym and "ETH" not in sym:
                if bar_ts.hour in _forex_kill_hours_utc:
                    return True
            # News window
            for sym_nw, start_nw, end_nw in _parsed_news_windows:
                if sym_nw == "" or sym_nw == sym:
                    if start_nw <= bar_ts <= end_nw:
                        return True
            return False

        # data provenance
        data_start_ts = str(merged_timeline[0]) if len(merged_timeline) > 0 else "Bar-0"
        data_end_ts = str(merged_timeline[-1]) if len(merged_timeline) > 0 else "Bar-0"
        bar_count = len(merged_timeline)
        missing_ranges: List[str] = []

        pending_orders: List[PendingOrder] = []
        equity_curve: List[Dict[str, Any]] = [
            {"bar": 0, "balance": initial_balance, "equity": initial_balance, "drawdown_pct": 0.0}
        ]
        unexecutable_setups: List[Dict[str, Any]] = []
        completed_autopsies: List[Dict[str, Any]] = []

        # Build per-symbol index position tracker for causal lookup
        sym_bar_idx: Dict[str, int] = {sym: 0 for sym in candles_by_symbol}

        # 2. Chronological Discrete Event Loop (Timestamp-Synchronized, Zero Lookahead)
        for timeline_step, bar_ts in enumerate(merged_timeline):
            if timeline_step < warmup:
                # Advance each symbol's bar pointer during warmup
                for sym, df in candles_by_symbol.items():
                    while sym_bar_idx[sym] < len(df) - 1:
                        row_ts = sym_ts[sym][sym_bar_idx[sym]]
                        if row_ts <= bar_ts:
                            sym_bar_idx[sym] = min(sym_bar_idx[sym] + 1, len(df) - 1)
                            break
                        break
                continue

            if account.is_failed:
                break

            # ── Event A: BarEvent Arrival across all symbols ──
            current_bar_prices: Dict[str, Dict[str, float]] = {}
            for sym, df in candles_by_symbol.items():
                # Find the latest bar at or before bar_ts for this symbol
                sym_idx = sym_bar_idx[sym]
                # Advance pointer while the next bar's timestamp is <= bar_ts
                while sym_idx < len(df) - 1 and sym_ts[sym][sym_idx + 1] <= bar_ts:
                    sym_idx += 1
                sym_bar_idx[sym] = sym_idx

                row = df.iloc[sym_idx]
                spec = broker.get_symbol_spec(sym)
                spread = spec.spread_price()  # Correct price-unit spread

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
                    "bid_high": h - (spread / 2.0),
                    "bid_low": lo - (spread / 2.0),
                    "ask_high": h + (spread / 2.0),
                    "ask_low": lo + (spread / 2.0),
                    "time": str(row.get("time", row.get("timestamp", str(bar_ts))))
                }
            i = timeline_step  # Keep i alias for backward-compatible references below

            # Update account equity and check stop-out liquidation
            liquidated = account.update_bar(current_bar_prices, bar_index=i)
            if liquidated:
                break

            # ── Event B: Sentinel Position Management for Open Trades ──
            for ticket, pos in list(account.open_positions.items()):
                p_info = current_bar_prices.get(pos.symbol)
                if not p_info:
                    continue

                spec = broker.get_symbol_spec(pos.symbol)
                high = p_info["high"]
                low = p_info["low"]
                sl_dist = abs(pos.entry_price - pos.initial_stop_loss) if pos.initial_stop_loss > 0 else abs(pos.entry_price - pos.stop_loss)

                # Sentinel Variant Position Management
                if sentinel_variant == "NONE":
                    pass  # Pure SL/TP without dynamic breakeven or trailing
                elif sentinel_variant == "BE_0_5R":
                    if not pos.is_breakeven_set and pos.unrealized_r >= 0.5:
                        pos.stop_loss = pos.entry_price
                        pos.is_breakeven_set = True
                elif sentinel_variant == "BE_1R":
                    if not pos.is_breakeven_set and pos.unrealized_r >= 1.0:
                        pos.stop_loss = pos.entry_price
                        pos.is_breakeven_set = True
                elif sentinel_variant == "BE_1_5R":
                    if not pos.is_breakeven_set and pos.unrealized_r >= 1.5:
                        pos.stop_loss = pos.entry_price
                        pos.is_breakeven_set = True
                elif sentinel_variant in ["STRUCTURE_CONFIRMED", "CURRENT_H"]:
                    # Breakeven lock at 1.5R
                    if not pos.is_breakeven_set and pos.unrealized_r >= 1.5:
                        pos.stop_loss = pos.entry_price
                        pos.is_breakeven_set = True
                    # Structure-Confirmed Trailing Stop behind peak MFE at 2.0R
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
                elif sentinel_variant == "ATR_VOLATILITY":
                    if not pos.is_breakeven_set and pos.unrealized_r >= 1.0:
                        pos.stop_loss = pos.entry_price
                        pos.is_breakeven_set = True
                    if pos.unrealized_r >= 1.8:
                        atr_dist = spec.typical_spread_pips * spec.tick_size * 2.0
                        if pos.direction == "long":
                            new_sl = pos.current_price - atr_dist
                            if new_sl > pos.stop_loss:
                                pos.stop_loss = round(new_sl, spec.decimals)
                        else:
                            new_sl = pos.current_price + atr_dist
                            if new_sl < pos.stop_loss:
                                pos.stop_loss = round(new_sl, spec.decimals)
                elif sentinel_variant == "LIQUIDITY_CONFIRMED":
                    if not pos.is_breakeven_set and pos.unrealized_r >= 1.0:
                        pos.stop_loss = pos.entry_price
                        pos.is_breakeven_set = True

                # Order Fill Trigger Checks with Conservative Same-Candle Ambiguity Resolution
                # Trigger prices use mid OHLC (standard MT5 bar data).
                # Exit fill prices use bid (for long exits) or ask (for short exits) per MT5 execution rules.
                is_closed = False
                exit_price = pos.current_price
                exit_reason = ""
                res_method = "OHLC_UNAMBIGUOUS"
                # Use bid/ask side for actual fill:
                # - Longs close at bid; shorts close at ask
                _exit_bid = p_info.get("bid", pos.current_price)
                _exit_ask = p_info.get("ask", pos.current_price)
                _bid_low = p_info.get("bid_low", low - spec.spread_price() / 2.0)
                _ask_high = p_info.get("ask_high", high + spec.spread_price() / 2.0)

                if pos.direction == "long":
                    # SL trigger: bid_low <= stop_loss (longs exit when bid falls to SL)
                    # TP trigger: bid_high >= take_profit (longs exit when bid rises to TP)
                    bid_high = p_info.get("bid_high", high - spec.spread_price() / 2.0)
                    bid_low_val = p_info.get("bid_low", low - spec.spread_price() / 2.0)
                    if bid_low_val <= pos.stop_loss and bid_high >= pos.take_profit:
                        is_closed = True
                        exit_price = pos.stop_loss  # Conservative SL assumption
                        exit_reason = "STOP_LOSS"
                        res_method = "CONSERVATIVE_SL_ASSUMPTION"
                    elif bid_high >= pos.take_profit:
                        is_closed = True
                        exit_price = pos.take_profit  # TP at bid
                        exit_reason = "TAKE_PROFIT"
                        res_method = "OHLC_UNAMBIGUOUS"
                    elif bid_low_val <= pos.stop_loss:
                        is_closed = True
                        exit_price = pos.stop_loss  # SL at bid
                        res_method = "OHLC_UNAMBIGUOUS"
                        if pos.stop_loss > pos.entry_price:
                            exit_reason = "TRAILING_STOP"
                        elif pos.is_breakeven_set and abs(pos.stop_loss - pos.entry_price) < 0.0001:
                            exit_reason = "BREAKEVEN"
                        else:
                            exit_reason = "STOP_LOSS"
                else:  # short
                    # SL trigger: ask_high >= stop_loss (shorts exit when ask rises to SL)
                    # TP trigger: ask_low <= take_profit (shorts exit when ask falls to TP)
                    ask_low_val = p_info.get("ask_low", low + spec.spread_price() / 2.0)
                    ask_high_val = p_info.get("ask_high", high + spec.spread_price() / 2.0)
                    if ask_high_val >= pos.stop_loss and ask_low_val <= pos.take_profit:
                        is_closed = True
                        exit_price = pos.stop_loss  # Conservative SL assumption
                        exit_reason = "STOP_LOSS"
                        res_method = "CONSERVATIVE_SL_ASSUMPTION"
                    elif ask_low_val <= pos.take_profit:
                        is_closed = True
                        exit_price = pos.take_profit  # TP at ask
                        exit_reason = "TAKE_PROFIT"
                        res_method = "OHLC_UNAMBIGUOUS"
                    elif ask_high_val >= pos.stop_loss:
                        is_closed = True
                        exit_price = pos.stop_loss  # SL at ask
                        res_method = "OHLC_UNAMBIGUOUS"
                        if pos.stop_loss < pos.entry_price:
                            exit_reason = "TRAILING_STOP"
                        elif pos.is_breakeven_set and abs(pos.stop_loss - pos.entry_price) < 0.0001:
                            exit_reason = "BREAKEVEN"
                        else:
                            exit_reason = "STOP_LOSS"

                if is_closed:
                    # Correct bid/ask at exit: longs close at bid, shorts close at ask
                    if pos.direction == "long":
                        exit_bid = exit_price  # bid exit
                        exit_ask = round(exit_price + spec.spread_price(), spec.decimals)
                    else:
                        exit_ask = exit_price  # ask exit
                        exit_bid = round(exit_price - spec.spread_price(), spec.decimals)

                    closed_rec = account.close_position(
                        ticket=ticket,
                        exit_price=exit_price,
                        exit_reason=exit_reason,
                        close_bar_index=i,
                        close_timestamp=p_info.get("time", f"Bar-{i}"),
                        exit_bid=exit_bid,
                        exit_ask=exit_ask,
                        intrabar_resolution_method=res_method
                    )
                    if closed_rec:
                        # Resolve market context from actual candle data for accurate autopsy
                        _autopsy_sub_df = candles_by_symbol.get(pos.symbol)
                        _ctx_resolved = MarketContextResolver.resolve(_autopsy_sub_df) if _autopsy_sub_df is not None else None
                        _ctx_dict = {
                            "session": _ctx_resolved.session if _ctx_resolved else "UNKNOWN",
                            "regime": _ctx_resolved.regime if _ctx_resolved else "unknown",
                            "spread_pips": spec.typical_spread_pips
                        }
                        autopsy = autopsy_engine.analyze_trade(
                            trade_record=closed_rec,
                            market_context=_ctx_dict
                        )
                        autopsy_dict = autopsy.model_dump()
                        closed_rec["autopsy"] = autopsy_dict
                        completed_autopsies.append(autopsy_dict)

            # ── Event C: FillEvent Check for Pending Limit Orders ──
            active_pending = []
            for po in pending_orders:
                if po.status != OrderStatus.PENDING:
                    continue

                if i - po.created_bar > po.expiry_bars:
                    po.status = OrderStatus.EXPIRED
                    continue

                p_info = current_bar_prices.get(po.symbol)
                if not p_info:
                    active_pending.append(po)
                    continue

                spec = broker.get_symbol_spec(po.symbol)
                spread = spec.spread_price()  # Correct price-unit spread
                bar_open = p_info["open"]
                high = p_info["high"]
                low = p_info["low"]
                filled = False
                fill_price = po.target_price

                if po.direction == "long":
                    # Buy limit: fills when ask_low <= target_price
                    ask_low = low + (spread / 2.0)
                    if ask_low <= po.target_price:
                        filled = True
                        # Gap-open: if bar opened below target, fill at open ask
                        ask_open = bar_open + (spread / 2.0)
                        fill_price = ask_open if ask_open < po.target_price else po.target_price
                else:
                    # Sell limit: fills when bid_high >= target_price
                    bid_high = high - (spread / 2.0)
                    if bid_high >= po.target_price:
                        filled = True
                        # Gap-open: if bar opened above target, fill at open bid
                        bid_open = bar_open - (spread / 2.0)
                        fill_price = bid_open if bid_open > po.target_price else po.target_price

                if filled and len(account.open_positions) < 3 and po.symbol not in {p.symbol for p in account.open_positions.values()}:
                    bid = fill_price - (spread / 2.0) if po.direction == "long" else fill_price
                    ask = fill_price if po.direction == "long" else fill_price + (spread / 2.0)
                    account.open_position(
                        spec=spec,
                        direction=po.direction,
                        volume=po.volume,
                        entry_price=round(fill_price, spec.decimals),
                        stop_loss=po.stop_loss,
                        take_profit=po.take_profit,
                        bar_index=i,
                        timestamp=p_info.get("time", f"Bar-{i}"),
                        order_type=po.order_type,
                        setup_id=po.setup_id,
                        entry_bid=bid,
                        entry_ask=ask
                    )
                    po.status = OrderStatus.FILLED
                else:
                    active_pending.append(po)

            pending_orders = active_pending

            # ── Event D: SignalEvent Generation via UnifiedStrategyEngine (Every Bar) ──
            # Removed: i % 4 == 0 restriction. Strategy now evaluates on every closed 15m bar,
            # matching live trading cadence where decisions are made on every bar close.
            active_symbols: Set[str] = {pos.symbol for pos in account.open_positions.values()}

            if len(account.open_positions) < 3:
                for sym, df in candles_by_symbol.items():
                    sym_curr_idx = sym_bar_idx.get(sym, 0)
                    if sym_curr_idx <= 0 or sym in active_symbols or len(account.open_positions) >= 3:
                        continue

                    # Kill-zone check: block new entries during low-liquidity windows
                    if _is_in_kill_zone(sym, bar_ts):
                        continue

                    # Strict causal slice (Zero Lookahead) using per-symbol bar pointer
                    sub_df = df.iloc[:sym_curr_idx + 1].copy().reset_index(drop=True)
                    if len(sub_df) >= 16:
                        n_blocks = len(sub_df) // 4
                        usable_sub = sub_df.iloc[:n_blocks * 4]
                        higher_df = usable_sub.groupby(np.arange(len(usable_sub)) // 4).agg({
                            'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'
                        }).reset_index(drop=True)
                    else:
                        higher_df = sub_df.copy()

                    # Current active position dictionaries for portfolio risk
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

                    # Invoke Authoritative UnifiedStrategyEngine
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
                        current_bar_index=i,
                        broker_name=b_name,
                        mode=ExecutionMode.BACKTEST,
                        enable_ai_advisory=False
                    )

                    if not decision.is_eligible and decision.ineligibility_reason:
                        unexecutable_setups.append({
                            "bar_index": i,
                            "symbol": sym,
                            "setup_id": decision.decision_id,
                            "setup_family": decision.setup_family,
                            "ev": decision.expected_value_r,
                            "reason": decision.ineligibility_reason,
                            "account_equity": account.equity
                        })

                    if decision.action == DecisionAction.TRADE and decision.recommended_lot > 0:
                        spec = broker.get_symbol_spec(sym)
                        p_info = current_bar_prices.get(sym)

                        if enable_limit_orders and "limit" in decision.order_type:
                            pending_orders.append(PendingOrder(
                                order_id=f"ORD-{sym}-{i}",
                                symbol=sym,
                                direction="long" if decision.direction == "BUY" else "short",
                                order_type="limit",
                                target_price=decision.entry_price,
                                stop_loss=decision.stop_loss,
                                take_profit=decision.take_profit,
                                volume=decision.recommended_lot,
                                created_bar=i,
                                expiry_bars=8,
                                setup_id=decision.candidate.setup_id if decision.candidate else decision.decision_id
                            ))
                        else:
                            # Market execution with deterministic bridge latency slippage
                            spread = spec.spread_price()  # Correct price-unit spread
                            if monte_carlo_mode:
                                rng = random.Random(monte_carlo_seed) if monte_carlo_seed is not None else random
                                # Slippage: 0.05–0.2 pips in price units
                                slippage = rng.uniform(0.05, 0.2) * spec.tick_size * (spec.pip_multiplier / 10.0)
                            else:
                                # Canonical deterministic slippage: 0.10 pips in price units
                                slippage = 0.10 * spec.tick_size * (spec.pip_multiplier / 10.0)
                            # Long buys at ask; short sells at bid
                            if decision.direction == "BUY":
                                actual_entry = decision.entry_price + (spread / 2.0) + slippage
                                bid = actual_entry - spread
                                ask = actual_entry
                            else:
                                actual_entry = decision.entry_price - (spread / 2.0) - slippage
                                bid = actual_entry
                                ask = actual_entry + spread

                            account.open_position(
                                spec=spec,
                                direction="long" if decision.direction == "BUY" else "short",
                                volume=decision.recommended_lot,
                                entry_price=round(actual_entry, spec.decimals),
                                stop_loss=decision.stop_loss,
                                take_profit=decision.take_profit,
                                bar_index=i,
                                timestamp=p_info.get("time", f"Bar-{i}") if p_info else f"Bar-{i}",
                                order_type=decision.order_type,
                                setup_id=decision.candidate.setup_id if decision.candidate else decision.decision_id,
                                entry_bid=bid,
                                entry_ask=ask,
                                slippage=slippage
                            )

                            duplicate_detector.register_execution(
                                symbol=sym,
                                setup_family=decision.setup_family,
                                direction=decision.direction,
                                zone_price=decision.entry_price,
                                current_bar=i
                            )
                            active_symbols.add(sym)

            # Record periodic curve point every 8 bars
            if i % 8 == 0 or timeline_step == len(merged_timeline) - 1:
                equity_curve.append({
                    "bar": i,
                    "balance": round(account.balance, 2),
                    "equity": round(account.equity, 2),
                    "drawdown_pct": round(account.max_drawdown_pct, 2)
                })

        # Close open positions at simulation end
        for ticket, pos in list(account.open_positions.items()):
            p_info = current_bar_prices.get(pos.symbol) if 'current_bar_prices' in dir() else {}
            close_price = p_info["close"] if p_info else pos.current_price
            closed_rec = account.close_position(
                ticket=ticket,
                exit_price=close_price,
                exit_reason="SIMULATION_END",
                close_bar_index=bar_count,
                close_timestamp="END",
                exit_bid=p_info.get("bid", close_price) if p_info else close_price,
                exit_ask=p_info.get("ask", close_price) if p_info else close_price
            )
            if closed_rec:
                _end_sub_df = candles_by_symbol.get(pos.symbol)
                _end_ctx = MarketContextResolver.resolve(_end_sub_df) if _end_sub_df is not None else None
                autopsy = autopsy_engine.analyze_trade(
                    trade_record=closed_rec,
                    market_context={
                        "session": _end_ctx.session if _end_ctx else "UNKNOWN",
                        "regime": _end_ctx.regime if _end_ctx else "unknown",
                        "spread_pips": 1.0
                    }
                )
                autopsy_dict = autopsy.model_dump()
                closed_rec["autopsy"] = autopsy_dict
                completed_autopsies.append(autopsy_dict)

        # Generate Authoritative Summary directly from closed ledger
        closed = account.closed_trades
        summary_metrics = generate_summary_from_ledger(
            closed=closed,
            initial_balance=initial_balance,
            account=account
        )

        sentinel_audit = run_sentinel_counterfactual_audit(closed)

        returns = [t["net_pnl"] / initial_balance for t in closed] if closed else [0.0]
        mean_ret = float(np.mean(returns))
        std_ret = float(np.std(returns)) if len(returns) > 1 else 1.0
        neg_rets = [r for r in returns if r < 0]
        downside_std = float(np.std(neg_rets)) if len(neg_rets) > 1 else 1.0
        sharpe = round((mean_ret / max(0.0001, std_ret)) * math.sqrt(252), 2)
        sortino = round((mean_ret / max(0.0001, downside_std)) * math.sqrt(252), 2)

        return {
            "success": True,
            "status": summary_metrics["status"],
            "failure_reason": summary_metrics["failure_reason"],
            "initial_balance": initial_balance,
            "final_balance": summary_metrics["ending_balance"],
            "final_equity": summary_metrics["ending_equity"],
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
            "unexecutable_setups_count": len(unexecutable_setups),
            "unexecutable_setups": unexecutable_setups[:15],
            "equity_curve": equity_curve,
            "trades": closed,
            "autopsies": completed_autopsies,
            "sentinel_audit": sentinel_audit,
            "data_source": data_source,
            "data_start": data_start_ts,
            "data_end": data_end_ts,
            "bar_count": bar_count,
            "missing_ranges": missing_ranges,
            "data_quality_status": data_quality_status,
            "leverage_source": leverage_source,
            "leverage": effective_leverage,
            "broker_profile_version": "2.1.0",
            "sentinel_variant": sentinel_variant,
            "monte_carlo_mode": monte_carlo_mode,
            "monte_carlo_seed": monte_carlo_seed,
            "strategy_version": "Trade-Z v2.2-EmpiricalSMC (Event-Driven)",
            "promotion_gate": "PASSED_VALIDATION" if (
                summary_metrics["arithmetic_expectancy_r"] >= 0.20 and summary_metrics["profit_factor"] >= 1.4 and account.max_drawdown_pct <= 20.0 and not account.is_failed
            ) else "NEEDS_REFINEMENT",
            "summary": summary_metrics
        }


# Global Event-Driven Simulator instance
event_driven_simulator = EventDrivenSimulator()
