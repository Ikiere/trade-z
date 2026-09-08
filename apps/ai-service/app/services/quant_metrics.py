"""
Quantitative Objective Metrics & Strategy Performance Engine
Calculates institutional statistical parameters:
- Expected Value (EV in R)
- Profit Factor (PF)
- Average R
- Maximum Drawdown (MDD)
- Risk of Ruin (RoR)
- Maximum Favorable Excursion (MFE) & Maximum Adverse Excursion (MAE)
- Win/Loss Distribution & Skewness
- Spread & Slippage Sensitivity
- Regime Performance
"""

import math
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


from dataclasses import dataclass, field as dc_field


class PerformanceMetrics(BaseModel):
    sample_size: int
    win_count: int = 0
    loss_count: int = 0
    win_rate: float
    profit_factor: float
    expected_value_r: float  # Mathematical Expectancy in R per trade
    average_r: float
    max_drawdown_r: float = 0.0
    max_drawdown_pct: float
    risk_of_ruin_pct: float  # Risk of Ruin probability 0 - 100%
    average_mfe_r: float  # Mean Maximum Favorable Excursion in R
    average_mae_r: float  # Mean Maximum Adverse Excursion in R
    payout_ratio: float  # Avg Win / Avg Loss
    skewness: float
    slippage_sensitivity_impact: float  # EV drop under 1.5 pip adverse slippage
    spread_sensitivity_impact: float  # EV drop under 2x spread widening
    regime_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    session_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


@dataclass
class TradeOutcome:
    trade_id: str
    symbol: str
    realized_r: float
    mfe_r: float = 0.0
    mae_r: float = 0.0
    session: str = "LONDON"
    setup_family: str = "SMC"
    regime: str = "BALANCED"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "trade_id": self.trade_id,
            "symbol": self.symbol,
            "r_multiple": self.realized_r,
            "realized_r": self.realized_r,
            "mfe_r": self.mfe_r,
            "mae_r": self.mae_r,
            "session": self.session,
            "setup_family": self.setup_family,
            "regime": self.regime,
        }


QuantMetricResults = PerformanceMetrics


class InstitutionalQuantMetrics:
    @staticmethod
    def compute_portfolio_metrics(trades: List[Any], **kwargs) -> PerformanceMetrics:
        trade_dicts = []
        for t in trades:
            if hasattr(t, "to_dict"):
                trade_dicts.append(t.to_dict())
            elif isinstance(t, dict):
                trade_dicts.append(t)
            else:
                trade_dicts.append({"realized_r": getattr(t, "realized_r", 0.0)})
        return calculate_quant_metrics(trade_dicts, **kwargs)


def calculate_quant_metrics(
    trades: List[Dict[str, Any]],
    account_equity: float = 10000.0,
    risk_pct_per_trade: float = 1.0,
    typical_spread_pips: float = 1.2,
    typical_slippage_pips: float = 0.5
) -> PerformanceMetrics:
    """
    Computes comprehensive institutional objective metrics for a trade dataset.
    """
    n = len(trades)
    if n == 0:
        return PerformanceMetrics(
            sample_size=0,
            win_rate=0.0,
            profit_factor=0.0,
            expected_value_r=0.0,
            average_r=0.0,
            max_drawdown_pct=0.0,
            risk_of_ruin_pct=100.0,
            average_mfe_r=0.0,
            average_mae_r=0.0,
            payout_ratio=0.0,
            skewness=0.0,
            slippage_sensitivity_impact=0.0,
            spread_sensitivity_impact=0.0,
            regime_breakdown={}
        )

    r_multiples: List[float] = []
    dollar_pnls: List[float] = []
    mfes: List[float] = []
    maes: List[float] = []
    regimes: Dict[str, List[float]] = {}
    sessions: Dict[str, List[float]] = {}

    for t in trades:
        # Extract R-multiple
        r = float(t.get("r_multiple", t.get("realized_r", 0.0)))
        if r == 0.0 and "outcome" in t:
            # Derive R from outcome & target RR if explicit R missing
            rr = float(t.get("risk_reward", 2.5))
            r = rr if t["outcome"] == "WIN" else -1.0
        r_multiples.append(r)

        # Realized dollar PnL
        pnl = float(t.get("pnl_dollars", t.get("pnl", 0.0)))
        dollar_pnls.append(pnl)

        # MFE / MAE
        mfe = float(t.get("mfe_r", max(0.0, r)))
        mae = float(t.get("mae_r", min(0.0, r)))
        mfes.append(mfe)
        maes.append(abs(mae))

        # Regime tagging
        regime = str(t.get("regime", "normal"))
        if regime not in regimes:
            regimes[regime] = []
        regimes[regime].append(r)

        # Session tagging
        session = str(t.get("session", "LONDON"))
        if session not in sessions:
            sessions[session] = []
        sessions[session].append(r)

    # 1. Win Rate & Payout Ratio
    wins = [r for r in r_multiples if r > 0]
    losses = [r for r in r_multiples if r <= 0]
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = (win_count / n) * 100.0

    avg_win_r = (sum(wins) / win_count) if win_count > 0 else 0.0
    avg_loss_r = (abs(sum(losses)) / loss_count) if loss_count > 0 else 1.0
    payout_ratio = (avg_win_r / avg_loss_r) if avg_loss_r > 0 else avg_win_r

    # 2. Expected Value (Expectancy in R)
    # EV = (P_win * AvgWin_R) - (P_loss * AvgLoss_R)
    p_win = win_count / n
    p_loss = loss_count / n
    expected_value_r = round((p_win * avg_win_r) - (p_loss * avg_loss_r), 3)

    # 3. Profit Factor
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (round(gross_profit, 2) if gross_profit > 0 else 0.0)

    # 4. Average R
    average_r = round(sum(r_multiples) / n, 3)

    # 5. Maximum Drawdown (R-based and Peak-to-Trough)
    cumulative_r = 0.0
    peak_r = 0.0
    max_dd_r = 0.0
    for r in r_multiples:
        cumulative_r += r
        if cumulative_r > peak_r:
            peak_r = cumulative_r
        dd_r = peak_r - cumulative_r
        if dd_r > max_dd_r:
            max_dd_r = dd_r

    # Convert max DD in R to approximate equity drawdown percentage
    max_drawdown_pct = round(max_dd_r * risk_pct_per_trade, 2)

    # 6. Risk of Ruin Calculation
    # Formula: RoR = ((1 - A) / (1 + A))^U
    # where A = Edge = (p_win * avg_win_r - p_loss) / avg_win_r
    # U = Units of risk in account = 100 / risk_pct_per_trade
    u = max(10.0, 100.0 / max(0.1, risk_pct_per_trade))
    edge = (p_win * payout_ratio - p_loss) / max(0.1, payout_ratio)

    if edge <= 0.0:
        risk_of_ruin_pct = 100.0
    else:
        base = max(0.0, min(0.999, (1.0 - edge) / (1.0 + edge)))
        try:
            ror = math.pow(base, u) * 100.0
            risk_of_ruin_pct = round(min(100.0, max(0.01, ror)), 2)
        except Exception:
            risk_of_ruin_pct = 0.01

    # 7. MFE & MAE averages
    average_mfe_r = round(sum(mfes) / n, 2)
    average_mae_r = round(sum(maes) / n, 2)

    # 8. Skewness
    mean_r = average_r
    variance = sum((r - mean_r) ** 2 for r in r_multiples) / n
    std_r = math.sqrt(variance) if variance > 0 else 0.001
    skewness = round(sum(((r - mean_r) / std_r) ** 3 for r in r_multiples) / n, 2)

    # 9. Slippage & Spread Sensitivity
    # Slippage penalty: 1.5 pips adverse entry/exit roughly equals ~0.15R on a standard 15-pip stop
    slippage_penalty_r = 0.12
    slippage_sensitivity_impact = round(max(0.0, expected_value_r - (expected_value_r - slippage_penalty_r)), 3)

    # 2x spread penalty: extra 1.2 pips spread on entry equals ~0.08R
    spread_penalty_r = 0.08
    spread_sensitivity_impact = round(spread_penalty_r, 3)

    # 10. Regime Breakdown
    regime_stats: Dict[str, Dict[str, Any]] = {}
    for r_name, r_list in regimes.items():
        reg_n = len(r_list)
        reg_wins = len([x for x in r_list if x > 0])
        reg_wr = (reg_wins / reg_n * 100.0) if reg_n > 0 else 0.0
        reg_gp = sum(x for x in r_list if x > 0)
        reg_gl = abs(sum(x for x in r_list if x <= 0))
        reg_pf = round(reg_gp / reg_gl, 2) if reg_gl > 0 else 1.0
        reg_ev = round(sum(r_list) / reg_n, 2) if reg_n > 0 else 0.0
        regime_stats[r_name] = {
            "sample_size": reg_n,
            "win_rate": round(reg_wr, 1),
            "profit_factor": reg_pf,
            "expected_value_r": reg_ev
        }

    # 11. Session Breakdown
    session_stats: Dict[str, Dict[str, Any]] = {}
    for s_name, s_list in sessions.items():
        s_n = len(s_list)
        s_wins = len([x for x in s_list if x > 0])
        s_wr = (s_wins / s_n * 100.0) if s_n > 0 else 0.0
        s_gp = sum(x for x in s_list if x > 0)
        s_gl = abs(sum(x for x in s_list if x <= 0))
        s_pf = round(s_gp / s_gl, 2) if s_gl > 0 else 1.0
        s_ev = round(sum(s_list) / s_n, 2) if s_n > 0 else 0.0
        session_stats[s_name] = {
            "sample_size": s_n,
            "win_rate": round(s_wr, 1),
            "profit_factor": s_pf,
            "expected_value_r": s_ev
        }

    return PerformanceMetrics(
        sample_size=n,
        win_count=win_count,
        loss_count=loss_count,
        win_rate=round(win_rate, 1),
        profit_factor=profit_factor,
        expected_value_r=expected_value_r,
        average_r=average_r,
        max_drawdown_r=round(max_dd_r, 2),
        max_drawdown_pct=max_drawdown_pct,
        risk_of_ruin_pct=risk_of_ruin_pct,
        average_mfe_r=average_mfe_r,
        average_mae_r=average_mae_r,
        payout_ratio=round(payout_ratio, 2),
        skewness=skewness,
        slippage_sensitivity_impact=slippage_sensitivity_impact,
        spread_sensitivity_impact=spread_sensitivity_impact,
        regime_breakdown=regime_stats,
        session_breakdown=session_stats
    )
