"""
Trade-Z Portfolio Risk & Correlation Engine:
Maintains portfolio-level risk awareness across multi-asset positions.
Tracks:
- Total open risk ($ and %)
- Currency exposure (USD, EUR, GBP, JPY, XAU, BTC)
- Directional currency correlation (e.g. Long EURUSD + Long GBPUSD both short USD)
- Maximum margin utilization ceiling
- Aggregate risk budget
Prevents treating correlated trades as independent events.
"""

from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field


class PositionExposure(BaseModel):
    ticket: int = 0
    symbol: str = ""
    direction: str = "long"  # "long" or "short"
    base_currency: str = ""
    quote_currency: str = ""
    risk_money: float = 1.0
    risk_percent: float = 1.0
    required_margin: float = 0.0


class PortfolioRiskStatus(BaseModel):
    is_safe: bool
    total_open_risk_dollars: float
    total_open_risk_pct: float
    open_positions_count: int
    currency_exposures: Dict[str, float]  # Currency -> net exposure dollars
    peak_currency_exposure_pct: float
    margin_utilization_pct: float
    free_margin_dollars: float
    risk_violations: List[str] = Field(default_factory=list)


class PortfolioRiskEngine:
    """
    Evaluates new trade candidates against portfolio-level correlation and risk limits.
    """

    def __init__(
        self,
        max_portfolio_risk_pct: float = 3.0,       # Max total open risk across all positions
        max_correlated_currency_pct: float = 2.0,   # Max net exposure to any single currency (e.g. USD)
        max_margin_utilization_pct: float = 40.0,   # Max used margin / equity
        max_simultaneous_positions: int = 3
    ):
        self.max_portfolio_risk_pct = max_portfolio_risk_pct
        self.max_correlated_currency_pct = max_correlated_currency_pct
        self.max_margin_utilization_pct = max_margin_utilization_pct
        self.max_simultaneous_positions = max_simultaneous_positions

    def parse_currencies(self, symbol: str) -> Tuple[str, str]:
        sym = symbol.upper().replace("/", "").replace(" ", "")
        if "XAU" in sym or "GOLD" in sym:
            return "XAU", "USD"
        elif "BTC" in sym:
            return "BTC", "USD"
        elif len(sym) == 6:
            return sym[:3], sym[3:]
        else:
            return sym, "USD"

    def evaluate_new_position(
        self,
        equity: float,
        used_margin: float,
        existing_positions: List[Dict[str, Any]],
        new_symbol: str,
        new_direction: str,
        new_risk_dollars: float,
        new_required_margin: float
    ) -> Tuple[bool, str, PortfolioRiskStatus]:
        """
        Determines whether adding the new position satisfies portfolio correlation and exposure limits.
        """
        if equity <= 0:
            return False, "PORTFOLIO_REJECT: Equity is zero or negative.", self._empty_status()

        violations = []

        # 1. Position Count Limit
        if len(existing_positions) >= self.max_simultaneous_positions:
            violations.append(
                f"MAX_POSITIONS_REACHED: Currently {len(existing_positions)} open positions (limit {self.max_simultaneous_positions})."
            )

        # 2. Total Open Risk Limit
        current_risk_dollars = sum(float(p.get("initial_risk_money", p.get("risk_money", 0.0))) for p in existing_positions)
        projected_risk_dollars = current_risk_dollars + new_risk_dollars
        projected_risk_pct = (projected_risk_dollars / equity) * 100.0

        if projected_risk_pct > self.max_portfolio_risk_pct:
            violations.append(
                f"PORTFOLIO_RISK_LIMIT_EXCEEDED: Projected open risk {projected_risk_pct:.2f}% exceeds max {self.max_portfolio_risk_pct:.2f}%."
            )

        # 3. Margin Utilization Limit
        projected_used_margin = used_margin + new_required_margin
        projected_margin_util = (projected_used_margin / equity) * 100.0

        if projected_margin_util > self.max_margin_utilization_pct:
            violations.append(
                f"MARGIN_UTILIZATION_LIMIT: Projected margin utilization {projected_margin_util:.1f}% exceeds max {self.max_margin_utilization_pct:.1f}%."
            )

        # 4. Currency Correlation Exposure
        # Tracks net directional exposure per currency
        currency_net: Dict[str, float] = {}

        def add_exposure(sym: str, dir_str: str, risk_d: float):
            base, quote = self.parse_currencies(sym)
            is_long = dir_str.lower() in ["long", "buy"]
            # Long EURUSD = +EUR, -USD. Short EURUSD = -EUR, +USD.
            currency_net[base] = currency_net.get(base, 0.0) + (risk_d if is_long else -risk_d)
            currency_net[quote] = currency_net.get(quote, 0.0) + (-risk_d if is_long else risk_d)

        for p in existing_positions:
            add_exposure(p.get("symbol", ""), p.get("direction", "long"), float(p.get("initial_risk_money", 1.0)))

        # Add proposed candidate
        add_exposure(new_symbol, new_direction, new_risk_dollars)

        # Check single currency concentration (especially USD)
        peak_curr_pct = 0.0
        for curr, net_d in currency_net.items():
            curr_pct = (abs(net_d) / equity) * 100.0
            if curr_pct > peak_curr_pct:
                peak_curr_pct = curr_pct

            if curr_pct > self.max_correlated_currency_pct:
                violations.append(
                    f"CORRELATED_EXPOSURE_LIMIT: Net {curr} exposure ({curr_pct:.2f}%) exceeds correlated limit ({self.max_correlated_currency_pct:.2f}%). "
                    f"e.g. Simultaneous EURUSD and GBPUSD directional trades compound USD risk."
                )

        status = PortfolioRiskStatus(
            is_safe=len(violations) == 0,
            total_open_risk_dollars=round(projected_risk_dollars, 2),
            total_open_risk_pct=round(projected_risk_pct, 2),
            open_positions_count=len(existing_positions) + 1,
            currency_exposures={k: round(v, 2) for k, v in currency_net.items()},
            peak_currency_exposure_pct=round(peak_curr_pct, 2),
            margin_utilization_pct=round(projected_margin_util, 2),
            free_margin_dollars=round(max(0.0, equity - projected_used_margin), 2),
            risk_violations=violations
        )

        if violations:
            return False, "; ".join(violations), status

        return True, "APPROVED", status

    def evaluate_new_trade(
        self,
        current_positions: Any,
        candidate_symbol: str,
        candidate_direction: str,
        risk_amount: float,
        required_margin: float,
        account_equity: float,
        used_margin: float = 0.0
    ) -> Tuple[bool, str]:
        pos_list = [p if isinstance(p, dict) else (p.model_dump() if hasattr(p, "model_dump") else p.__dict__) for p in current_positions]
        is_safe, reason, _ = self.evaluate_new_position(
            equity=account_equity,
            used_margin=used_margin,
            existing_positions=pos_list,
            new_symbol=candidate_symbol,
            new_direction=candidate_direction,
            new_risk_dollars=risk_amount,
            new_required_margin=required_margin
        )
        return is_safe, reason

    def _empty_status(self) -> PortfolioRiskStatus:
        return PortfolioRiskStatus(
            is_safe=False,
            total_open_risk_dollars=0.0,
            total_open_risk_pct=0.0,
            open_positions_count=0,
            currency_exposures={},
            peak_currency_exposure_pct=0.0,
            margin_utilization_pct=0.0,
            free_margin_dollars=0.0,
            risk_violations=["EQUITY_INVALID"]
        )


PortfolioPosition = PositionExposure

# Global instance
portfolio_risk_engine = PortfolioRiskEngine()
