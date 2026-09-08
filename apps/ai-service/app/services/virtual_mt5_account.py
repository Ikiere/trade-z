"""
Virtual MT5 Account Simulator:
Simulates a real MetaTrader 5 account environment with full margin economics,
floating P/L, margin level calculation, margin call alerts, and strict stop-out liquidation.
Accurately models small-account ($20 - $250) behavior vs institutional capital.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.services.broker_profiles import BrokerProfile, SymbolSpec, EXNESS_PROFILE


class SimulatedPosition(BaseModel):
    ticket: int
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
    commission: float
    swap: float = 0.0
    floating_pnl: float = 0.0
    unrealized_r: float = 0.0
    initial_sl_dist: float = 0.0
    risk_unit: float = 1.0
    mfe_price: float = 0.0
    mae_price: float = 0.0
    mfe_r: float = 0.0
    mae_r: float = 0.0
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
        self.max_drawdown_dollars = 0.0
        self.max_drawdown_pct = 0.0

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

    def can_open_position(self, spec: SymbolSpec, volume: float, price: float) -> tuple[bool, str, float]:
        """
        Verifies whether account has sufficient free margin to open the position.
        """
        if self.is_failed:
            return False, "ACCOUNT_FAILED: Account has been liquidated.", 0.0

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
        spec: SymbolSpec,
        direction: str,
        volume: float,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        bar_index: int,
        timestamp: str,
        order_type: str = "market"
    ) -> Optional[SimulatedPosition]:
        """
        Opens a new simulated MT5 position.
        """
        can_open, reason, req_margin = self.can_open_position(spec, volume, entry_price)
        if not can_open:
            return None

        ticket = self.ticket_counter
        self.ticket_counter += 1

        commission = spec.commission_per_lot * volume
        self.balance -= commission
        self.equity -= commission
        self.used_margin += req_margin
        self.free_margin = max(0.0, self.equity - self.used_margin)
        self.margin_level = (self.equity / self.used_margin * 100.0) if self.used_margin > 0 else 0.0

        initial_sl_dist = abs(entry_price - stop_loss)
        risk_unit = (initial_sl_dist / spec.tick_size) * spec.tick_value * volume if (initial_sl_dist > 0 and spec.tick_size > 0) else 1.0

        pos = SimulatedPosition(
            ticket=ticket,
            symbol=spec.symbol,
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
            floating_pnl=0.0,
            unrealized_r=0.0,
            initial_sl_dist=initial_sl_dist,
            risk_unit=risk_unit,
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
        Updates floating P/L and margin metrics on every new market bar.
        Checks for stop-out (liquidation).
        Returns tickets closed by liquidation/stop-out.
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
            sl_dist = pos.initial_sl_dist if pos.initial_sl_dist > 0 else max(0.0001, abs(pos.entry_price - pos.stop_loss))
            risk_unit = pos.risk_unit if pos.risk_unit > 0 else 1.0

            # Calculate floating PnL
            if pos.direction == "long":
                points = (bid - pos.entry_price) / spec.tick_size if spec.tick_size > 0 else 0
                pos.floating_pnl = points * spec.tick_value * pos.volume
                # MFE / MAE
                mfe_delta = high - pos.entry_price
                mae_delta = pos.entry_price - low
                pos.mfe_price = max(pos.mfe_price, high)
                pos.mae_price = min(pos.mae_price, low)
            else:
                points = (pos.entry_price - ask) / spec.tick_size if spec.tick_size > 0 else 0
                pos.floating_pnl = points * spec.tick_value * pos.volume
                mfe_delta = pos.entry_price - low
                mae_delta = high - pos.entry_price
                pos.mfe_price = min(pos.mfe_price, low) if pos.mfe_price > 0 else low
                pos.mae_price = max(pos.mae_price, high)

            pos.unrealized_r = round(pos.floating_pnl / risk_unit, 2) if risk_unit > 0 else 0.0
            if sl_dist > 0:
                pos.mfe_r = max(pos.mfe_r, round(mfe_delta / sl_dist, 2))
                pos.mae_r = max(pos.mae_r, round(mae_delta / sl_dist, 2))

            total_floating += pos.floating_pnl

        # Update account-level equity
        self.equity = round(self.balance + total_floating, 2)
        self.free_margin = max(0.0, self.equity - self.used_margin)
        self.margin_level = (self.equity / self.used_margin * 100.0) if self.used_margin > 0 else 0.0

        if self.equity > self.peak_equity:
            self.peak_equity = self.equity

        dd_dollars = self.peak_equity - self.equity
        dd_pct = (dd_dollars / self.peak_equity * 100.0) if self.peak_equity > 0 else 0.0
        if dd_dollars > self.max_drawdown_dollars:
            self.max_drawdown_dollars = round(dd_dollars, 2)
            self.max_drawdown_pct = round(dd_pct, 2)

        # ── HARD BROKER STOP-OUT CHECK ──
        # If margin level <= broker stop out level (e.g. 0% Exness or 50% standard), or equity <= 0:
        liquidated_tickets: List[int] = []
        if (self.used_margin > 0 and self.margin_level <= self.broker.stop_out_level) or (self.equity <= 0.0):
            self.stop_out_triggered = True
            self.is_failed = True
            self.failure_reason = (
                f"STOP_OUT_LIQUIDATION: Equity dropped to ${self.equity:.2f} (Margin Level: {self.margin_level:.1f}%), "
                f"triggering broker liquidation stop-out ({self.broker.stop_out_level}%)."
            )
            # Liquidate all open positions immediately at current market price
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
        close_timestamp: str
    ) -> Optional[Dict[str, Any]]:
        """
        Closes an open simulated position, realizes P/L, frees margin, and logs record.
        """
        pos = self.open_positions.pop(ticket, None)
        if not pos:
            return None

        spec = self.broker.get_symbol_spec(pos.symbol)
        if pos.direction == "long":
            points = (exit_price - pos.entry_price) / spec.tick_size if spec.tick_size > 0 else 0
        else:
            points = (pos.entry_price - exit_price) / spec.tick_size if spec.tick_size > 0 else 0

        gross_pnl = points * spec.tick_value * pos.volume
        net_pnl = round(gross_pnl - pos.commission + pos.swap, 2)

        self.balance = round(self.balance + net_pnl, 2)
        self.used_margin = max(0.0, round(self.used_margin - pos.required_margin, 2))
        self.equity = round(self.balance + sum(p.floating_pnl for p in self.open_positions.values()), 2)
        self.free_margin = max(0.0, self.equity - self.used_margin)
        self.margin_level = (self.equity / self.used_margin * 100.0) if self.used_margin > 0 else 0.0

        if self.equity > self.peak_equity:
            self.peak_equity = self.equity

        initial_sl = pos.initial_stop_loss if pos.initial_stop_loss > 0 else pos.stop_loss
        sl_dist = pos.initial_sl_dist if pos.initial_sl_dist > 0 else max(0.0001, abs(pos.entry_price - initial_sl))
        risk_unit = pos.risk_unit if pos.risk_unit > 0 else ((sl_dist / spec.tick_size) * spec.tick_value * pos.volume if (sl_dist > 0 and spec.tick_size > 0) else 1.0)
        r_multiple = round(net_pnl / risk_unit, 2) if risk_unit > 0 else 0.0

        pip_mult = spec.pip_multiplier if spec.pip_multiplier > 0 else (100.0 if "JPY" in pos.symbol else 10000.0)
        pnl_pips = round(points / spec.pip_multiplier, 1) if spec.pip_multiplier > 0 else round(points, 1)
        mfe_pips = round(abs(pos.mfe_price - pos.entry_price) * pip_mult, 1)
        mae_pips = round(abs(pos.mae_price - pos.entry_price) * pip_mult, 1)

        outcome = "WIN" if net_pnl > 0 else ("BREAKEVEN" if net_pnl == 0 else "LOSS")

        record = {
            "id": pos.ticket,
            "ticket": pos.ticket,
            "symbol": pos.symbol,
            "pair": pos.symbol,
            "direction": "BUY" if pos.direction == "long" else "SELL",
            "volume": pos.volume,
            "lot": pos.volume,
            "entry_price": pos.entry_price,
            "exit_price": exit_price,
            "stop_loss": initial_sl,
            "initial_stop_loss": initial_sl,
            "current_stop_loss": pos.stop_loss,
            "take_profit": pos.take_profit,
            "net_pnl": net_pnl,
            "pnl_dollars": net_pnl,
            "r_multiple": r_multiple,
            "pnl_r": r_multiple,
            "pnl_pips": pnl_pips,
            "outcome": outcome,
            "exit_reason": exit_reason,
            "mfe_r": pos.mfe_r,
            "mae_r": pos.mae_r,
            "mfe_pips": mfe_pips,
            "mae_pips": mae_pips,
            "open_bar_index": pos.open_bar_index,
            "close_bar_index": close_bar_index,
            "duration_bars": close_bar_index - pos.open_bar_index,
            "balance_after": self.balance,
            "equity_after": self.equity,
            "required_margin": pos.required_margin
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
