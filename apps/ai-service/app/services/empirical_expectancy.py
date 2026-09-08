"""
Trade-Z Empirical Expectancy Engine:
Calculates mathematically sound expectancy and statistical distributions directly from
validated historical trade outcomes. Eliminates uncalibrated score-based win probability
assumptions (e.g. setup_score -> p_win) and enforces sample size evidence thresholds.
"""

from typing import List, Dict, Any, Optional
import math
import numpy as np
from pydantic import BaseModel, Field, computed_field


class SampleEvidenceTier(str):
    INSUFFICIENT = "INSUFFICIENT_EVIDENCE"  # < 50 trades
    WEAK = "WEAK_EVIDENCE"                  # 50 - 199 trades
    MODERATE = "MODERATE_EVIDENCE"          # 200 - 499 trades
    STRONG = "STRONG_EVIDENCE"              # 500+ trades


def calculate_wilson_confidence_interval(successes: int, trials: int, confidence: float = 0.95) -> Dict[str, float]:
    """Calculates Wilson score interval for binomial proportion."""
    if trials == 0:
        return {"lower": 0.0, "upper": 0.0}
    z = 1.95996  # 95% confidence
    p = successes / trials
    denom = 1.0 + (z**2) / trials
    center = (p + (z**2) / (2 * trials)) / denom
    margin = (z * math.sqrt((p * (1 - p) / trials) + (z**2) / (4 * (trials**2)))) / denom
    return {
        "lower": round(max(0.0, center - margin) * 100.0, 2),
        "upper": round(min(1.0, center + margin) * 100.0, 2)
    }


class EmpiricalExpectancyResult(BaseModel):
    sample_count: int = 0
    win_count: int = 0
    loss_count: int = 0
    breakeven_count: int = 0
    empirical_win_probability: Optional[float] = None     # None / UNKNOWN if insufficient evidence
    empirical_loss_probability: Optional[float] = None
    empirical_BE_probability: Optional[float] = None
    win_rate: float = 0.0               # percentage 0 - 100
    loss_rate: float = 0.0              # percentage 0 - 100
    breakeven_rate: float = 0.0         # percentage 0 - 100
    average_win_r: float = 0.0          # average positive R
    average_loss_r: float = 0.0         # average negative R magnitude (positive float)
    median_r: float = 0.0
    std_dev_r: float = 0.0
    profit_factor: float = 1.0
    expectancy_r: float = 0.0           # (P_win * avg_win_R) - (P_loss * avg_loss_R)
    cost_adjusted_expectancy_r: float = 0.0  # expectancy after realistic transaction friction
    average_mfe_r: float = 0.0
    average_mae_r: float = 0.0
    average_duration_bars: float = 0.0
    evidence_tier: str = SampleEvidenceTier.INSUFFICIENT
    statistical_status: str = "INSUFFICIENT_STATISTICAL_EVIDENCE"
    has_statistical_edge: bool = False
    recommended_action: str = "WAIT"    # TRADE | WAIT | NO_TRADE
    shrinkage_factor: float = 1.0       # Conservative discount applied for small samples
    confidence_interval: Dict[str, float] = Field(default_factory=lambda: {"lower": 0.0, "upper": 0.0})
    breakdown_metadata: Dict[str, Any] = Field(default_factory=dict)

    @computed_field
    @property
    def empirical_ev_r(self) -> float:
        return self.cost_adjusted_expectancy_r

    @computed_field
    @property
    def sample_size(self) -> int:
        return self.sample_count


class EmpiricalExpectancyEngine:
    """
    Computes rigorous empirical expectancy from historical trade records.
    Never converts setup score to win probability.
    """

    # Configurable sample thresholds
    THRESHOLD_INSUFFICIENT: int = 50
    THRESHOLD_WEAK: int = 200
    THRESHOLD_MODERATE: int = 500

    # Minimum statistical edge required to recommend execution
    MIN_EXPECTANCY_R: float = 0.20

    @classmethod
    def determine_evidence_tier(cls, sample_count: int) -> str:
        if sample_count < cls.THRESHOLD_INSUFFICIENT:
            return SampleEvidenceTier.INSUFFICIENT
        elif sample_count < cls.THRESHOLD_WEAK:
            return SampleEvidenceTier.WEAK
        elif sample_count < cls.THRESHOLD_MODERATE:
            return SampleEvidenceTier.MODERATE
        else:
            return SampleEvidenceTier.STRONG

    @classmethod
    def calculate_expectancy(
        cls,
        trades: Optional[List[Dict[str, Any]]] = None,
        symbol: Optional[str] = None,
        setup_family: Optional[str] = None,
        session: Optional[str] = None,
        regime: Optional[str] = None,
        spread_cost_r: float = 0.05,
        slippage_r: float = 0.02,
        commission_r: float = 0.0,
        extra_metadata: Optional[Dict[str, Any]] = None
    ) -> EmpiricalExpectancyResult:
        """
        Calculates empirical expectancy directly from completed trade records or experience memory.
        If no trades or insufficient evidence exists, returns UNKNOWN probability and marks
        INSUFFICIENT_STATISTICAL_EVIDENCE without fabricating prior win rates or fake EV.
        """
        if trades is None and (symbol or setup_family):
            try:
                from app.services.experience_memory import experience_memory
                exps = experience_memory.query_experiences(
                    symbol=symbol,
                    setup_family=setup_family,
                    session=session,
                    regime=regime
                )
                if exps:
                    trades = [e.model_dump() for e in exps]
            except Exception:
                trades = None

        meta = {
            "symbol": symbol or "UNKNOWN",
            "setup_family": setup_family or "ALL",
            "session": session or "ALL",
            "regime": regime or "ALL",
            **(extra_metadata or {})
        }

        if not trades:
            # Strictly return INSUFFICIENT_STATISTICAL_EVIDENCE with UNKNOWN probability
            return EmpiricalExpectancyResult(
                sample_count=0,
                win_count=0,
                loss_count=0,
                breakeven_count=0,
                empirical_win_probability=None,
                empirical_loss_probability=None,
                empirical_BE_probability=None,
                win_rate=0.0,
                loss_rate=0.0,
                breakeven_rate=0.0,
                average_win_r=0.0,
                average_loss_r=0.0,
                profit_factor=1.0,
                expectancy_r=0.0,
                cost_adjusted_expectancy_r=0.0,
                evidence_tier=SampleEvidenceTier.INSUFFICIENT,
                statistical_status="INSUFFICIENT_STATISTICAL_EVIDENCE",
                has_statistical_edge=False,
                recommended_action="WAIT",
                shrinkage_factor=0.0,
                confidence_interval={"lower": 0.0, "upper": 0.0},
                breakdown_metadata=meta
            )

        sample_count = len(trades)
        tier = cls.determine_evidence_tier(sample_count)

        r_values = []
        mfes = []
        maes = []
        durations = []

        wins = []
        losses = []
        breakevens = []

        for t in trades:
            r = float(t.get("r_multiple", t.get("realized_r", 0.0)))
            r_values.append(r)
            mfes.append(float(t.get("mfe_r", 0.0)))
            maes.append(float(t.get("mae_r", 0.0)))
            durations.append(float(t.get("duration_bars", t.get("bars_held", 0.0))))

            if r > 0.05:
                wins.append(r)
            elif r < -0.05:
                losses.append(r)
            else:
                breakevens.append(r)

        win_count = len(wins)
        loss_count = len(losses)
        be_count = len(breakevens)

        p_win = win_count / sample_count
        p_loss = loss_count / sample_count
        p_be = be_count / sample_count

        avg_win_r = float(np.mean(wins)) if wins else 0.0
        avg_loss_r = abs(float(np.mean(losses))) if losses else 1.0

        median_r = float(np.median(r_values))
        std_dev_r = float(np.std(r_values)) if len(r_values) > 1 else 0.0

        gross_profit = sum(wins)
        gross_loss = abs(sum(losses))
        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 1.0)

        # Authoritative Empirical Expectancy Formula:
        # Expectancy = (P_win * Avg_Win_R) - (P_loss * Avg_Loss_R)
        # Breakevens contribute 0R (p_be * 0 = 0)
        raw_expectancy_r = (p_win * avg_win_r) - (p_loss * avg_loss_r)

        # Apply Bayesian shrinkage discount when sample size is weak
        shrinkage = 1.0
        if tier == SampleEvidenceTier.INSUFFICIENT:
            shrinkage = 0.0  # Zero out edge if evidence is insufficient
        elif tier == SampleEvidenceTier.WEAK:
            shrinkage = 0.70  # 30% discount for low sample size
        elif tier == SampleEvidenceTier.MODERATE:
            shrinkage = 0.90  # 10% discount for moderate sample size

        discounted_expectancy = raw_expectancy_r * shrinkage

        # Cost-Adjusted Expectancy (subtracting spread, slippage, commission in R)
        total_costs_r = spread_cost_r + slippage_r + commission_r
        cost_adjusted_expectancy_r = discounted_expectancy - total_costs_r

        avg_mfe = float(np.mean(mfes)) if mfes else 0.0
        avg_mae = float(np.mean(maes)) if maes else 0.0
        avg_duration = float(np.mean(durations)) if durations else 0.0

        has_edge = (
            tier in [SampleEvidenceTier.WEAK, SampleEvidenceTier.MODERATE, SampleEvidenceTier.STRONG]
            and cost_adjusted_expectancy_r >= cls.MIN_EXPECTANCY_R
            and profit_factor >= 1.25
        )

        if tier == SampleEvidenceTier.INSUFFICIENT:
            rec_action = "WAIT"
            stat_status = "INSUFFICIENT_STATISTICAL_EVIDENCE"
            emp_win_prob = None
            emp_loss_prob = None
            emp_be_prob = None
        elif has_edge:
            rec_action = "TRADE"
            stat_status = "VALID_EMPIRICAL_EVIDENCE"
            emp_win_prob = round(p_win, 4)
            emp_loss_prob = round(p_loss, 4)
            emp_be_prob = round(p_be, 4)
        else:
            rec_action = "NO_TRADE"
            stat_status = "VALID_EMPIRICAL_EVIDENCE"
            emp_win_prob = round(p_win, 4)
            emp_loss_prob = round(p_loss, 4)
            emp_be_prob = round(p_be, 4)

        conf_interval = calculate_wilson_confidence_interval(win_count, sample_count)

        return EmpiricalExpectancyResult(
            sample_count=sample_count,
            win_count=win_count,
            loss_count=loss_count,
            breakeven_count=be_count,
            empirical_win_probability=emp_win_prob,
            empirical_loss_probability=emp_loss_prob,
            empirical_BE_probability=emp_be_prob,
            win_rate=round(p_win * 100.0, 1),
            loss_rate=round(p_loss * 100.0, 1),
            breakeven_rate=round(p_be * 100.0, 1),
            average_win_r=round(avg_win_r, 2),
            average_loss_r=round(avg_loss_r, 2),
            median_r=round(median_r, 2),
            std_dev_r=round(std_dev_r, 2),
            profit_factor=profit_factor,
            expectancy_r=round(raw_expectancy_r, 2),
            cost_adjusted_expectancy_r=round(cost_adjusted_expectancy_r, 2),
            average_mfe_r=round(avg_mfe, 2),
            average_mae_r=round(avg_mae, 2),
            average_duration_bars=round(avg_duration, 1),
            evidence_tier=tier,
            statistical_status=stat_status,
            has_statistical_edge=has_edge,
            recommended_action=rec_action,
            shrinkage_factor=shrinkage,
            confidence_interval=conf_interval,
            breakdown_metadata=meta
        )


# Global empirical expectancy engine instance
empirical_expectancy_engine = EmpiricalExpectancyEngine()
