"""
Virtual MT5 Account Simulator:
Simulates an authentic MetaTrader 5 account environment with full margin economics,
floating P/L, margin level calculation, margin call alerts, realistic spread/commission/swap,
and strict stop-out liquidation.
Accurately models small-account ($20 - $250) behavior vs institutional capital.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.services.broker_profiles import BrokerProfile, SymbolSpec, EXNESS_PROFILE


class SimulatedPosition(BaseModel):
    ticket: int
    setup_id: str = ""
    symbol: str
    direction: str  # long | short
    order_type: str  # market | buy limit | sell limit | buy stop | sell stop
    volume: float
    entry_price: float
    current_price: float
    initial_stop_loss: float = 0.0
    stop_loss: float
    take_profit: float
    required_margin: float
    commission: float = 0.0
    swap: float = 0.0
    slippage: float = 0.0
    entry_bid: float = 0.0
    entry_ask: float = 0.0
    entry_spread: float = 0.0
    entry_spread_cost: float = 0.0
    balance_before: float = 0.0
    equity_before: float = 0.0
    margin_before: float = 0.0
    floating_pnl: float = 0.0
    unrealized_r: float = 0.0
    initial_sl_dist: float = 0.0
    initial_risk_money: float = 1.0
    risk_unit: float = 1.0
    mfe_price: float = 0.0
    mae_price: float = 0.0
    mfe_r: float = 0.0
    mae_r: float = 0.0
    mfe_r_before_be: float = 0.0
    mae_r_before_be: float = 0.0
    time_to_be_bars: int = 0
    open_bar_index: int
    open_timestamp: str
    is_breakeven_set: bool = False
    is_partial_taken: bool = False


class VirtualMT5Account:
    """
    Virtual MetaTrader 5 account tracker implementing realistic broker balance,
    equity, margin utilization, and stop-out rules.
    """

    def __init__(
        self,
        initial_balance: float = 1000.0,
        broker_profile: Optional[BrokerProfile] = None,
        custom_leverage: Optional[float] = None
    ):
        self.broker = broker_profile or EXNESS_PROFILE
        self.leverage = custom_leverage or self.broker.default_leverage
        self.initial_balance = round(float(initial_balance), 2)
        self.balance = self.initial_balance
        self.equity = self.initial_balance
        self.used_margin = 0.0
        self.free_margin = self.initial_balance
        self.margin_level = 0.0  # 0% when no open positions
        self.peak_equity = self.initial_balance
        self.peak_balance = self.initial_balance
        self.max_drawdown_dollars = 0.0
        self.max_drawdown_pct = 0.0
        self.max_floating_drawdown_dollars = 0.0
        self.max_floating_drawdown_pct = 0.0
        self.max_closed_drawdown_dollars = 0.0
        self.max_closed_drawdown_pct = 0.0

        # Margin & Execution Statistics
        self.peak_margin_utilization = 0.0
        self.margin_calls_count = 0
        self.stop_out_events_count = 0
        self.total_spread_cost = 0.0
        self.total_commission = 0.0
        self.total_swap = 0.0

        self.is_failed = False
        self.failure_reason: Optional[str] = None
        self.stop_out_triggered = False

        self.ticket_counter = 100001
        self.open_positions: Dict[int, SimulatedPosition] = {}
        self.closed_trades: List[Dict[str, Any]] = []

    def calculate_margin(self, spec: SymbolSpec, volume: float, price: float) -> float:
        """
        Computes required margin in USD based on contract size and account leverage.
        Formula: (volume * contract_size * price) / leverage
        """
        base_notional = volume * spec.contract_size * price
        return round(base_notional / max(1.0, self.leverage), 2)

    def can_open_position(
        self,
        spec: SymbolSpec,
        volume: float,
        price: float,
        direction: str = "long",
        stop_loss: float = 0.0,
        take_profit: float = 0.0
    ) -> tuple[bool, str, float]:
        """
        Verifies whether account has sufficient free margin and valid order geometry.
        """
        if isinstance(spec, str):
            spec = self.broker.get_symbol_spec(spec)

        if self.is_failed:
            return False, "ACCOUNT_FAILED: Account has been liquidated.", 0.0

        # Validate order geometry
        if direction.lower() == "long":
            if stop_loss >= price or take_profit <= price:
                return False, f"INVALID_ORDER_GEOMETRY: Buy SL ({stop_loss}) must be < Entry ({price}) < TP ({take_profit})", 0.0
        elif direction.lower() == "short":
            if stop_loss <= price or take_profit >= price:
                return False, f"INVALID_ORDER_GEOMETRY: Sell TP ({take_profit}) must be < Entry ({price}) < SL ({stop_loss})", 0.0

        req_margin = self.calculate_margin(spec, volume, price)
        if req_margin > self.free_margin:
            return (
                False,
                f"MARGIN_INSUFFICIENT: Required margin ${req_margin:.2f} exceeds free margin ${self.free_margin:.2f} (Account: ${self.equity:.2f}).",
                req_margin
            )

        # Check post-order margin level sanity
        new_used = self.used_margin + req_margin
        post_margin_level = (self.equity / new_used * 100.0) if new_used > 0 else 999.0
        if post_margin_level <= self.broker.margin_call_level:
            return (
                False,
                f"MARGIN_CALL_PREVENTION: Trade would depress margin level to {post_margin_level:.1f}%, below broker call level ({self.broker.margin_call_level}%).",
                req_margin
            )

        return True, "APPROVED", req_margin

    def open_position(
        self,
        spec: Any = None,
        direction: str = "long",
        volume: float = 0.01,
        entry_price: float = 0.0,
        stop_loss: float = 0.0,
        take_profit: float = 0.0,
        bar_index: int = 0,
        timestamp: str = "",
        order_type: str = "market",
        setup_id: str = "",
        entry_bid: float = 0.0,
        entry_ask: float = 0.0,
        slippage: float = 0.0,
        symbol: Optional[str] = None,
        open_bar_index: Optional[int] = None
    ) -> Optional[SimulatedPosition]:
        """
        Opens a new simulated MT5 position with authoritative tracking.
        """
        target = spec or symbol
        if isinstance(target, str):
            resolved_spec = self.broker.get_symbol_spec(target)
        else:
            resolved_spec = target

        actual_bar_index = open_bar_index if open_bar_index is not None else bar_index

        can_open, reason, req_margin = self.can_open_position(
            resolved_spec, volume, entry_price, direction, stop_loss, take_profit
        )
        if not can_open:
            return None

        ticket = self.ticket_counter
        self.ticket_counter += 1

        balance_before = self.balance
        equity_before = self.equity
        margin_before = self.used_margin

        commission = round(resolved_spec.commission_per_lot * volume, 2)
        self.balance = round(self.balance - commission, 2)
        self.equity = round(self.equity - commission, 2)
        self.total_commission = round(self.total_commission + commission, 2)

        self.used_margin = round(self.used_margin + req_margin, 2)
        self.free_margin = max(0.0, round(self.equity - self.used_margin, 2))
        self.margin_level = round((self.equity / self.used_margin * 100.0), 2) if self.used_margin > 0 else 0.0

        # Update peak margin utilization
        current_util = (self.used_margin / self.equity * 100.0) if self.equity > 0 else 100.0
        if current_util > self.peak_margin_utilization:
            self.peak_margin_utilization = round(current_util, 2)

        initial_sl_dist = abs(entry_price - stop_loss)
        tick_units = (initial_sl_dist / resolved_spec.tick_size) if resolved_spec.tick_size > 0 else 0.0
        initial_risk_money = max(0.01, round(tick_units * resolved_spec.tick_value * volume, 2))

        spread_pts = abs(entry_ask - entry_bid) if (entry_ask > 0 and entry_bid > 0) else (resolved_spec.typical_spread_pips * resolved_spec.tick_size * resolved_spec.pip_multiplier)
        spread_ticks = spread_pts / resolved_spec.tick_size if resolved_spec.tick_size > 0 else 0.0
        entry_spread_cost = round(spread_ticks * resolved_spec.tick_value * volume, 2)
        self.total_spread_cost = round(self.total_spread_cost + entry_spread_cost, 2)

        pos = SimulatedPosition(
            ticket=ticket,
            setup_id=setup_id or f"SETUP-{resolved_spec.symbol}-{ticket}",
            symbol=resolved_spec.symbol,
            direction=direction.lower(),
            order_type=order_type,
            volume=volume,
            entry_price=entry_price,
            current_price=entry_price,
            initial_stop_loss=stop_loss,
            stop_loss=stop_loss,
            take_profit=take_profit,
            required_margin=req_margin,
            commission=commission,
            swap=0.0,
            slippage=slippage,
            entry_bid=entry_bid or entry_price,
            entry_ask=entry_ask or entry_price,
            entry_spread=round(spread_pts, resolved_spec.decimals),
            entry_spread_cost=entry_spread_cost,
            balance_before=balance_before,
            equity_before=equity_before,
            margin_before=margin_before,
            floating_pnl=0.0,
            unrealized_r=0.0,
            initial_sl_dist=initial_sl_dist,
            initial_risk_money=initial_risk_money,
            risk_unit=initial_risk_money,
            mfe_price=entry_price,
            mae_price=entry_price,
            mfe_r=0.0,
            mae_r=0.0,
            open_bar_index=bar_index,
            open_timestamp=timestamp
        )

        self.open_positions[ticket] = pos
        return pos

    def update_bar(self, current_prices: Dict[str, Dict[str, float]], bar_index: int) -> List[int]:
        """
        Updates floating P/L, excursions, overnight swaps, and margin metrics on every bar.
        Checks for stop-out (liquidation).
        """
        if self.is_failed:
            return []

        total_floating = 0.0

        for ticket, pos in list(self.open_positions.items()):
            price_info = current_prices.get(pos.symbol)
            if not price_info:
                continue

            bid = price_info.get("bid", price_info.get("close", pos.current_price))
            ask = price_info.get("ask", price_info.get("close", pos.current_price))
            high = price_info.get("high", max(bid, ask))
            low = price_info.get("low", min(bid, ask))

            pos.current_price = bid if pos.direction == "long" else ask
            spec = self.broker.get_symbol_spec(pos.symbol)

            # Accumulate overnight swap on daily boundaries (every 96 15m bars)
            if bar_index > pos.open_bar_index and (bar_index - pos.open_bar_index) % 96 == 0:
                swap_pts = spec.swap_long_points if pos.direction == "long" else spec.swap_short_points
                swap_val = round((swap_pts * spec.tick_size / max(0.0001, spec.tick_size)) * spec.tick_value * pos.volume, 2)
                pos.swap = round(pos.swap + swap_val, 2)
                self.total_swap = round(self.total_swap + swap_val, 2)

            # Calculate floating PnL
            if pos.direction == "long":
                points = (bid - pos.entry_price) / spec.tick_size if spec.tick_size > 0 else 0
                pos.floating_pnl = round(points * spec.tick_value * pos.volume, 2)
                mfe_delta = high - pos.entry_price
                mae_delta = pos.entry_price - low
                pos.mfe_price = max(pos.mfe_price, high)
                pos.mae_price = min(pos.mae_price, low)
            else:
                points = (pos.entry_price - ask) / spec.tick_size if spec.tick_size > 0 else 0
                pos.floating_pnl = round(points * spec.tick_value * pos.volume, 2)
                mfe_delta = pos.entry_price - low
                mae_delta = high - pos.entry_price
                pos.mfe_price = min(pos.mfe_price, low) if pos.mfe_price > 0 else low
                pos.mae_price = max(pos.mae_price, high)

            sl_dist = pos.initial_sl_dist if pos.initial_sl_dist > 0 else 0.0001
            pos.unrealized_r = round(pos.floating_pnl / max(0.01, pos.initial_risk_money), 2)
            pos.mfe_r = max(pos.mfe_r, round(mfe_delta / sl_dist, 2))
            pos.mae_r = max(pos.mae_r, round(mae_delta / sl_dist, 2))

            if not pos.is_breakeven_set:
                pos.mfe_r_before_be = pos.mfe_r
                pos.mae_r_before_be = pos.mae_r
            else:
                if pos.time_to_be_bars == 0:
                    pos.time_to_be_bars = max(1, bar_index - pos.open_bar_index)

            total_floating += pos.floating_pnl

        # Update account-level equity
        self.equity = round(self.balance + total_floating, 2)
        self.free_margin = max(0.0, round(self.equity - self.used_margin, 2))
        self.margin_level = round((self.equity / self.used_margin * 100.0), 2) if self.used_margin > 0 else 0.0

        # Track peak margin utilization
        if self.used_margin > 0:
            current_util = (self.used_margin / self.equity * 100.0) if self.equity > 0 else 100.0
            if current_util > self.peak_margin_utilization:
                self.peak_margin_utilization = round(current_util, 2)

            if self.margin_level <= self.broker.margin_call_level:
                self.margin_calls_count += 1

        if self.equity > self.peak_equity:
            self.peak_equity = self.equity

        dd_dollars = self.peak_equity - self.equity
        dd_pct = (dd_dollars / self.peak_equity * 100.0) if self.peak_equity > 0 else 0.0
        if dd_pct > self.max_drawdown_pct:
            self.max_drawdown_pct = round(dd_pct, 2)
            self.max_drawdown_dollars = round(dd_dollars, 2)
            self.max_floating_drawdown_dollars = round(dd_dollars, 2)
            self.max_floating_drawdown_pct = round(dd_pct, 2)

        # Hard Broker Stop-Out Check
        liquidated_tickets: List[int] = []
        if (self.used_margin > 0 and self.margin_level <= self.broker.stop_out_level) or (self.equity <= 0.0):
            self.stop_out_triggered = True
            self.stop_out_events_count += 1
            self.is_failed = True
            self.failure_reason = (
                f"STOP_OUT_LIQUIDATION: Equity dropped to ${self.equity:.2f} (Margin Level: {self.margin_level:.1f}%), "
                f"triggering broker liquidation stop-out ({self.broker.stop_out_level}%)."
            )
            for ticket, pos in list(self.open_positions.items()):
                self.close_position(
                    ticket=ticket,
                    exit_price=pos.current_price,
                    exit_reason="MARGIN_STOP_OUT",
                    close_bar_index=bar_index,
                    close_timestamp="LIQUIDATION"
                )
                liquidated_tickets.append(ticket)

        return liquidated_tickets

    def close_position(
        self,
        ticket: int,
        exit_price: float,
        exit_reason: str,
        close_bar_index: int,
        close_timestamp: str,
        exit_bid: float = 0.0,
        exit_ask: float = 0.0,
        intrabar_resolution_method: str = "OHLC_UNAMBIGUOUS"
    ) -> Optional[Dict[str, Any]]:
        """
        Closes an open simulated position, realizes P/L, frees margin, and logs record.
        Enforces strict mathematical outcome reconciliation.
        """
        pos = self.open_positions.pop(ticket, None)
        if not pos:
            return None

        spec = self.broker.get_symbol_spec(pos.symbol)
        if pos.direction == "long":
            points = (exit_price - pos.entry_price) / spec.tick_size if spec.tick_size > 0 else 0
        else:
            points = (pos.entry_price - exit_price) / spec.tick_size if spec.tick_size > 0 else 0

        gross_pnl = round(points * spec.tick_value * pos.volume, 2)
        net_pnl = round(gross_pnl - pos.commission + pos.swap, 2)

        # Update balance and margins
        self.balance = round(self.balance + net_pnl, 2)
        if self.balance > self.peak_balance:
            self.peak_balance = self.balance
        closed_dd_dollars = self.peak_balance - self.balance
        closed_dd_pct = (closed_dd_dollars / self.peak_balance * 100.0) if self.peak_balance > 0 else 0.0
        if closed_dd_dollars > self.max_closed_drawdown_dollars:
            self.max_closed_drawdown_dollars = round(closed_dd_dollars, 2)
            self.max_closed_drawdown_pct = round(closed_dd_pct, 2)

        self.used_margin = max(0.0, round(self.used_margin - pos.required_margin, 2))
        self.equity = round(self.balance + sum(p.floating_pnl for p in self.open_positions.values()), 2)
        self.free_margin = max(0.0, round(self.equity - self.used_margin, 2))
        self.margin_level = round((self.equity / self.used_margin * 100.0), 2) if self.used_margin > 0 else 0.0

        if self.equity > self.peak_equity:
            self.peak_equity = self.equity

        initial_sl = pos.initial_stop_loss if pos.initial_stop_loss > 0 else pos.stop_loss
        risk_money = max(0.01, pos.initial_risk_money)
        r_multiple = round(net_pnl / risk_money, 2)

        pip_mult = spec.pip_multiplier if spec.pip_multiplier > 0 else 10.0
        pnl_pips = round(points / spec.pip_multiplier, 1) if spec.pip_multiplier > 0 else round(points, 1)
        mfe_pips = round(abs(pos.mfe_price - pos.entry_price) * pip_mult, 1)
        mae_pips = round(abs(pos.mae_price - pos.entry_price) * pip_mult, 1)

        # ── AUTHORITATIVE OUTCOME AND EXIT REASON RECONCILIATION ──
        if net_pnl > 0.01:
            outcome = "WIN"
            # In profit: exit reason CANNOT be STOP_LOSS
            if exit_reason in ["STOP_LOSS", ""]:
                exit_reason = "TRAILING_STOP" if pos.is_breakeven_set else "TAKE_PROFIT"
        elif abs(net_pnl) <= 0.01 or exit_reason == "BREAKEVEN":
            outcome = "BREAKEVEN"
            exit_reason = "BREAKEVEN"
        else:
            outcome = "LOSS"
            # In loss: exit reason CANNOT be TAKE_PROFIT
            if exit_reason in ["TAKE_PROFIT", ""]:
                exit_reason = "STOP_LOSS"

        exit_b = exit_bid or exit_price
        exit_a = exit_ask or exit_price
        exit_spread = round(abs(exit_a - exit_b), spec.decimals)

        # 28 Authoritative Schema Fields (Bug 14)
        record = {
            "trade_id": pos.ticket,
            "ticket": pos.ticket,
            "id": pos.ticket,
            "setup_id": pos.setup_id or f"SETUP-{pos.symbol}-{pos.ticket}",
            "timestamp": pos.open_timestamp,
            "close_timestamp": close_timestamp,
            "symbol": pos.symbol,
            "pair": pos.symbol,
            "direction": "BUY" if pos.direction == "long" else "SELL",
            "volume": pos.volume,
            "lot": pos.volume,
            "entry": pos.entry_price,
            "entry_price": pos.entry_price,
            "sl": initial_sl,
            "stop_loss": initial_sl,
            "initial_stop_loss": initial_sl,
            "current_stop_loss": pos.stop_loss,
            "tp": pos.take_profit,
            "take_profit": pos.take_profit,
            "initial_risk_money": risk_money,
            "initial_risk_r": 1.0,
            "gross_pnl": gross_pnl,
            "commission": pos.commission,
            "swap": pos.swap,
            "spread": pos.entry_spread,
            "spread_cost": pos.entry_spread_cost,
            "entry_bid": pos.entry_bid,
            "entry_ask": pos.entry_ask,
            "entry_spread": pos.entry_spread,
            "exit_bid": exit_b,
            "exit_ask": exit_a,
            "exit_spread": exit_spread,
            "slippage": pos.slippage,
            "net_pnl": net_pnl,
            "pnl_dollars": net_pnl,
            "r_multiple": r_multiple,
            "pnl_r": r_multiple,
            "pnl_pips": pnl_pips,
            "mfe": pos.mfe_price,
            "mae": pos.mae_price,
            "mfe_r": pos.mfe_r,
            "mae_r": pos.mae_r,
            "mfe_pips": mfe_pips,
            "mae_pips": mae_pips,
            "exit_reason": exit_reason,
            "intrabar_resolution_method": intrabar_resolution_method,
            "outcome": outcome,
            "balance_before": pos.balance_before,
            "equity_before": pos.equity_before,
            "balance_after": self.balance,
            "equity_after": self.equity,
            "margin_before": pos.margin_before,
            "margin_after": self.used_margin,
            "required_margin": pos.required_margin,
            "open_bar_index": pos.open_bar_index,
            "close_bar_index": close_bar_index,
            "duration_bars": close_bar_index - pos.open_bar_index,
            "mfe_r_before_be": pos.mfe_r_before_be,
            "mae_r_before_be": pos.mae_r_before_be,
            "time_to_be_bars": pos.time_to_be_bars
        }

        self.closed_trades.append(record)
        return record

    def get_state(self) -> Dict[str, Any]:
        """Returns complete snapshot of account metrics."""
        return {
            "initial_balance": self.initial_balance,
            "balance": round(self.balance, 2),
            "equity": round(self.equity, 2),
            "used_margin": round(self.used_margin, 2),
            "free_margin": round(self.free_margin, 2),
            "margin_level": round(self.margin_level, 2),
            "peak_margin_utilization": round(self.peak_margin_utilization, 2),
            "margin_calls_count": self.margin_calls_count,
            "stop_out_events_count": self.stop_out_events_count,
            "total_spread_cost": round(self.total_spread_cost, 2),
            "total_commission": round(self.total_commission, 2),
            "total_swap": round(self.total_swap, 2),
            "leverage": self.leverage,
            "peak_equity": round(self.peak_equity, 2),
            "max_drawdown_dollars": round(self.max_drawdown_dollars, 2),
            "max_drawdown_pct": round(self.max_drawdown_pct, 2),
            "open_positions_count": len(self.open_positions),
            "closed_trades_count": len(self.closed_trades),
            "is_failed": self.is_failed,
            "failure_reason": self.failure_reason,
            "stop_out_triggered": self.stop_out_triggered
        }
