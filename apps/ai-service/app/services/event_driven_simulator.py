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
        custom_leverage: Optional[float] = 2000.0,
        custom_candles_map: Optional[Dict[str, pd.DataFrame]] = None,
        enable_limit_orders: bool = True
    ) -> Dict[str, Any]:
        """
        Executes an institutional event-driven simulation over chronological market bars.
        """
        b_name = broker_name or self.broker_name
        broker = get_broker_profile(b_name)
        account = VirtualMT5Account(
            initial_balance=initial_balance,
            broker_profile=broker,
            custom_leverage=custom_leverage
        )
        duplicate_detector.reset()

        bars_per_day = 96 if timeframe == "15m" else (24 if timeframe in ["1h", "60m"] else 6)
        total_bars = bars or max(100, min(1200, int(period_days * bars_per_day * 0.72)))

        # 1. Prepare synchronized multi-asset candle data
        candles_by_symbol: Dict[str, pd.DataFrame] = {}
        for sym_idx, sym in enumerate(symbols):
            clean_sym = sym.upper().replace("/", "").replace(" ", "")
            if custom_candles_map and clean_sym in custom_candles_map:
                df = custom_candles_map[clean_sym]
            else:
                df = generate_simulated_candles(clean_sym, timeframe, seed_offset=sym_idx * 100)
                if len(df) < total_bars:
                    extra = total_bars - len(df)
                    dfs = [df]
                    last_close = float(df.iloc[-1]["close"])
                    for block_idx in range(1, int(math.ceil(extra / 60)) + 1):
                        next_df = generate_simulated_candles(
                            clean_sym,
                            timeframe,
                            seed_offset=(block_idx * 17) + (sym_idx * 100),
                            start_price=last_close
                        )
                        last_close = float(next_df.iloc[-1]["close"])
                        dfs.append(next_df)
                    df = pd.concat(dfs).reset_index(drop=True).tail(total_bars).reset_index(drop=True)
            candles_by_symbol[clean_sym] = df

        pending_orders: List[PendingOrder] = []
        equity_curve: List[Dict[str, Any]] = [
            {"bar": 0, "balance": initial_balance, "equity": initial_balance, "drawdown_pct": 0.0}
        ]
        unexecutable_setups: List[Dict[str, Any]] = []
        completed_autopsies: List[Dict[str, Any]] = []

        warmup = 35
        sim_bars = total_bars

        # 2. Chronological Discrete Event Loop (Zero Lookahead)
        for i in range(warmup, sim_bars):
            if account.is_failed:
                break

            # ── Event A: BarEvent Arrival across all symbols ──
            current_bar_prices: Dict[str, Dict[str, float]] = {}
            for sym, df in candles_by_symbol.items():
                if i < len(df):
                    row = df.iloc[i]
                    spec = broker.get_symbol_spec(sym)
                    spread = spec.typical_spread_pips / max(1.0, spec.pip_multiplier)
                    mid = float(row["close"])
                    current_bar_prices[sym] = {
                        "open": float(row["open"]),
                        "high": float(row["high"]),
                        "low": float(row["low"]),
                        "close": mid,
                        "bid": mid - (spread / 2.0),
                        "ask": mid + (spread / 2.0),
                        "time": str(row.get("time", f"Bar-{i}"))
                    }

            # Update account equity and check stop-out liquidation
            liquidated = account.update_bar(current_bar_prices, bar_index=i)
            if liquidated:
                break

            # ── Event B: Sentinel Position Management for Open Trades (Variant H) ──
            for ticket, pos in list(account.open_positions.items()):
                p_info = current_bar_prices.get(pos.symbol)
                if not p_info:
                    continue

                spec = broker.get_symbol_spec(pos.symbol)
                high = p_info["high"]
                low = p_info["low"]

                # Breakeven lock at 1.5R
                if not pos.is_breakeven_set and pos.unrealized_r >= 1.5:
                    pos.stop_loss = pos.entry_price
                    pos.is_breakeven_set = True

                # Structure-Confirmed Trailing Stop behind peak MFE at 2.0R
                if pos.unrealized_r >= 2.0:
                    sl_dist = abs(pos.entry_price - pos.initial_stop_loss) if pos.initial_stop_loss > 0 else abs(pos.entry_price - pos.stop_loss)
                    trail_r = pos.unrealized_r - 1.0
                    if pos.direction == "long":
                        new_sl = pos.entry_price + (trail_r * sl_dist)
                        if new_sl > pos.stop_loss:
                            pos.stop_loss = round(new_sl, spec.decimals)
                    else:
                        new_sl = pos.entry_price - (trail_r * sl_dist)
                        if new_sl < pos.stop_loss:
                            pos.stop_loss = round(new_sl, spec.decimals)

                # Order Fill Trigger Checks (Take Profit evaluated before Stop Loss on qualifying bars)
                is_closed = False
                exit_price = pos.current_price
                exit_reason = ""

                if pos.direction == "long":
                    if high >= pos.take_profit:
                        is_closed = True
                        exit_price = pos.take_profit
                        exit_reason = "TAKE_PROFIT"
                    elif low <= pos.stop_loss:
                        is_closed = True
                        exit_price = pos.stop_loss
                        if pos.stop_loss > pos.entry_price:
                            exit_reason = "TRAILING_STOP"
                        elif pos.is_breakeven_set and abs(pos.stop_loss - pos.entry_price) < 0.0001:
                            exit_reason = "BREAKEVEN"
                        else:
                            exit_reason = "STOP_LOSS"
                else:  # short
                    if low <= pos.take_profit:
                        is_closed = True
                        exit_price = pos.take_profit
                        exit_reason = "TAKE_PROFIT"
                    elif high >= pos.stop_loss:
                        is_closed = True
                        exit_price = pos.stop_loss
                        if pos.stop_loss < pos.entry_price:
                            exit_reason = "TRAILING_STOP"
                        elif pos.is_breakeven_set and abs(pos.stop_loss - pos.entry_price) < 0.0001:
                            exit_reason = "BREAKEVEN"
                        else:
                            exit_reason = "STOP_LOSS"

                if is_closed:
                    closed_rec = account.close_position(
                        ticket=ticket,
                        exit_price=exit_price,
                        exit_reason=exit_reason,
                        close_bar_index=i,
                        close_timestamp=p_info.get("time", f"Bar-{i}"),
                        exit_bid=p_info.get("bid", exit_price),
                        exit_ask=p_info.get("ask", exit_price)
                    )
                    if closed_rec:
                        autopsy = autopsy_engine.analyze_trade(
                            trade_record=closed_rec,
                            market_context={"session": "LONDON", "regime": "trending", "spread_pips": spec.typical_spread_pips}
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
                high = p_info["high"]
                low = p_info["low"]
                filled = False
                fill_price = po.target_price

                if po.direction == "long":
                    if low <= po.target_price:
                        filled = True
                else:
                    if high >= po.target_price:
                        filled = True

                if filled and len(account.open_positions) < 3 and po.symbol not in {p.symbol for p in account.open_positions.values()}:
                    spread = spec.typical_spread_pips / max(1.0, spec.pip_multiplier)
                    bid = p_info.get("bid", fill_price - (spread / 2.0))
                    ask = p_info.get("ask", fill_price + (spread / 2.0))
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

            # ── Event D: SignalEvent Generation via UnifiedStrategyEngine (Every 4 Bars) ──
            active_symbols: Set[str] = {pos.symbol for pos in account.open_positions.values()}

            if i % 4 == 0 and len(account.open_positions) < 3:
                for sym, df in candles_by_symbol.items():
                    if i >= len(df) or sym in active_symbols or len(account.open_positions) >= 3:
                        continue

                    # Strict causal slice (Zero Lookahead)
                    sub_df = df.iloc[:i+1].copy().reset_index(drop=True)
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
                            # Market execution with bridge latency slippage
                            spread = spec.typical_spread_pips / max(1.0, spec.pip_multiplier)
                            slippage = (random.uniform(0.05, 0.2) / max(1.0, spec.pip_multiplier))
                            actual_entry = decision.entry_price + (spread / 2.0) + slippage if decision.direction == "BUY" else decision.entry_price - (spread / 2.0) - slippage
                            bid = p_info["bid"] if p_info else actual_entry - (spread / 2.0)
                            ask = p_info["ask"] if p_info else actual_entry + (spread / 2.0)

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
            if i % 8 == 0 or i == sim_bars - 1:
                equity_curve.append({
                    "bar": i,
                    "balance": round(account.balance, 2),
                    "equity": round(account.equity, 2),
                    "drawdown_pct": round(account.max_drawdown_pct, 2)
                })

        # Close open positions at simulation end
        for ticket, pos in list(account.open_positions.items()):
            p_info = current_bar_prices.get(pos.symbol)
            close_price = p_info["close"] if p_info else pos.current_price
            closed_rec = account.close_position(
                ticket=ticket,
                exit_price=close_price,
                exit_reason="SIMULATION_END",
                close_bar_index=sim_bars,
                close_timestamp="END",
                exit_bid=p_info.get("bid", close_price) if p_info else close_price,
                exit_ask=p_info.get("ask", close_price) if p_info else close_price
            )
            if closed_rec:
                autopsy = autopsy_engine.analyze_trade(
                    trade_record=closed_rec,
                    market_context={"session": "LONDON", "regime": "trending", "spread_pips": 1.0}
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
            "strategy_version": "Trade-Z v2.2-EmpiricalSMC (Event-Driven)",
            "promotion_gate": "PASSED_VALIDATION" if (
                summary_metrics["arithmetic_expectancy_r"] >= 0.20 and summary_metrics["profit_factor"] >= 1.4 and account.max_drawdown_pct <= 20.0 and not account.is_failed
            ) else "NEEDS_REFINEMENT",
            "summary": summary_metrics
        }


# Global Event-Driven Simulator instance
event_driven_simulator = EventDrivenSimulator()
