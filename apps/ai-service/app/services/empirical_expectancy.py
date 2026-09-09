"""
Trade-Z Empirical Expectancy Engine:
Calculates mathematically sound expectancy, statistical distributions, and deterministic
bootstrap confidence intervals directly from validated historical trade outcomes.
Eliminates uncalibrated score-based win probability assumptions (e.g. setup_score -> p_win)
and enforces multi-dimensional evidence thresholds and point-in-time causality.
"""

from typing import List, Dict, Any, Optional
import math
import hashlib
import numpy as np
from pydantic import BaseModel, Field, computed_field
from app.services.edge_policy import EdgeState


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


def calculate_deterministic_bootstrap_ci(
    values: List[float],
    seed_key: str = "default",
    n_bootstrap: int = 1000,
    confidence: float = 0.95
) -> Dict[str, float]:
    """
    Computes a deterministic non-parametric bootstrap confidence interval for the mean.
    Derives seed deterministically from seed_key so identical inputs yield bit-for-bit identical CIs.
    """
    if not values or len(values) < 2:
        val = values[0] if values else 0.0
        return {"lower": round(val, 3), "upper": round(val, 3)}

    seed_int = int(hashlib.sha256(seed_key.encode()).hexdigest()[:8], 16)
    rng = np.random.RandomState(seed_int)

    arr = np.array(values, dtype=float)
    n = len(arr)
    # Generate bootstrap sample means
    indices = rng.randint(0, n, size=(n_bootstrap, n))
    bootstrap_means = np.mean(arr[indices], axis=1)

    alpha = 1.0 - confidence
    lower_pct = (alpha / 2.0) * 100.0
    upper_pct = (1.0 - alpha / 2.0) * 100.0

    lower = float(np.percentile(bootstrap_means, lower_pct))
    upper = float(np.percentile(bootstrap_means, upper_pct))

    return {
        "lower": round(lower, 3),
        "upper": round(upper, 3)
    }


class EmpiricalExpectancyResult(BaseModel):
    sample_count: int = 0
    win_count: int = 0
    loss_count: int = 0
    breakeven_count: int = 0
    empirical_win_probability: Optional[float] = None
    empirical_loss_probability: Optional[float] = None
    empirical_BE_probability: Optional[float] = None
    win_rate: float = 0.0               # percentage 0 - 100
    loss_rate: float = 0.0              # percentage 0 - 100
    breakeven_rate: float = 0.0         # percentage 0 - 100
    average_win_r: float = 0.0          # average positive R
    average_loss_r: float = 0.0         # average negative R magnitude (positive float)
    median_r: float = 0.0
    std_dev_r: float = 0.0
    profit_factor: Optional[float] = None
    expectancy_r: Optional[float] = None           # None for UNKNOWN_EDGE
    cost_adjusted_expectancy_r: Optional[float] = None  # None for UNKNOWN_EDGE
    average_mfe_r: float = 0.0
    average_mae_r: float = 0.0
    average_duration_bars: float = 0.0
    evidence_tier: str = SampleEvidenceTier.INSUFFICIENT
    evidence_source: str = "EXACT_SYMBOL_SETUP_SESSION_REGIME"
    statistical_status: str = "INSUFFICIENT_STATISTICAL_EVIDENCE"
    has_statistical_edge: bool = False
    recommended_action: str = "WAIT"    # TRADE | WAIT | NO_TRADE
    shrinkage_factor: float = 1.0
    confidence_interval: Dict[str, float] = Field(default_factory=lambda: {"lower": 0.0, "upper": 0.0})
    analytic_confidence_interval: Dict[str, float] = Field(default_factory=lambda: {"lower": 0.0, "upper": 0.0})
    bootstrap_confidence_interval: Dict[str, float] = Field(default_factory=lambda: {"lower": 0.0, "upper": 0.0})
    edge_state: EdgeState = EdgeState.UNKNOWN_EDGE
    stability_score: float = 1.0
    regime_count: int = 0
    session_count: int = 0
    recent_expectancy: Optional[float] = None
    historical_expectancy: Optional[float] = None
    breakdown_metadata: Dict[str, Any] = Field(default_factory=dict)

    @computed_field
    @property
    def empirical_ev_r(self) -> float:
        """Backward compatibility property returning float 0.0 if EV is None."""
        return float(self.cost_adjusted_expectancy_r) if self.cost_adjusted_expectancy_r is not None else 0.0

    @computed_field
    @property
    def sample_size(self) -> int:
        return self.sample_count


class EmpiricalExpectancyEngine:
    """
    Computes rigorous empirical expectancy from historical trade records.
    Never converts setup score to win probability.
    Enforces multi-dimensional EdgeState evaluation with deterministic bootstrap verification.
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
        extra_metadata: Optional[Dict[str, Any]] = None,
        as_of_timestamp: Optional[str] = None
    ) -> EmpiricalExpectancyResult:
        """
        Calculates empirical expectancy directly from completed trade records or experience memory.
        If sample_size < 50, strictly returns UNKNOWN_EDGE with expectancy_r = None (never fake 0.0).
        NEGATIVE_EDGE requires sample_size >= 50, cost_adjusted_expectancy_r < 0, AND bootstrap upper CI < 0.
        """
        evidence_source = "EXACT_SYMBOL_SETUP_SESSION_REGIME"
        if trades is None and (symbol or setup_family):
            try:
                from app.services.experience_memory import experience_memory
                # 1. Exact: Symbol + Setup + Session + Regime with as_of_timestamp filter
                exps = experience_memory.query_experiences(
                    symbol=symbol,
                    setup_family=setup_family,
                    session=session,
                    regime=regime,
                    as_of_timestamp=as_of_timestamp
                )
                evidence_source = "EXACT_SYMBOL_SETUP_SESSION_REGIME"

                # 2. Broad: Symbol + Setup + Regime
                if len(exps) < 20:
                    broad_exps = experience_memory.query_experiences(
                        symbol=symbol,
                        setup_family=setup_family,
                        session="ALL",
                        regime=regime,
                        as_of_timestamp=as_of_timestamp
                    )
                    if len(broad_exps) >= 20:
                        exps = broad_exps
                        evidence_source = "SYMBOL_SETUP_REGIME"

                # 3. Asset Class: Asset class + Setup + Regime
                if len(exps) < 20:
                    from app.services.broker_profiles import get_broker_profile
                    spec = get_broker_profile("exness").get_symbol_spec(symbol or "")
                    asset_class = spec.asset_class
                    asset_symbols = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"] if asset_class == "forex" else [symbol]
                    asset_exps = []
                    for asym in asset_symbols:
                        asset_exps.extend(experience_memory.query_experiences(
                            symbol=asym,
                            setup_family=setup_family,
                            session="ALL",
                            regime=regime,
                            as_of_timestamp=as_of_timestamp
                        ))
                    if len(asset_exps) >= 20:
                        exps = asset_exps
                        evidence_source = "ASSET_CLASS_SETUP_REGIME"

                # 4. Global: Setup family across all instruments
                if len(exps) < 20:
                    global_exps = experience_memory.query_experiences(
                        symbol="ALL",
                        setup_family=setup_family,
                        session="ALL",
                        regime="ALL",
                        as_of_timestamp=as_of_timestamp
                    )
                    if len(global_exps) >= 20:
                        exps = global_exps
                        evidence_source = "GLOBAL_SETUP_FAMILY"

                if exps:
                    trades = [e.model_dump() for e in exps]
            except Exception:
                trades = None

        meta = {
            "symbol": symbol or "UNKNOWN",
            "setup_family": setup_family or "ALL",
            "session": session or "ALL",
            "regime": regime or "ALL",
            "evidence_source": evidence_source,
            **(extra_metadata or {})
        }

        # Cold-Start / Insufficient Evidence Condition (< 50 trades)
        if not trades or len(trades) < cls.THRESHOLD_INSUFFICIENT:
            sample_count = len(trades) if trades else 0
            return EmpiricalExpectancyResult(
                sample_count=sample_count,
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
                profit_factor=None,
                expectancy_r=None,           # CRITICAL: Strictly None, never 0.0
                cost_adjusted_expectancy_r=None,  # CRITICAL: Strictly None
                evidence_tier=SampleEvidenceTier.INSUFFICIENT,
                evidence_source=evidence_source,
                statistical_status="INSUFFICIENT_STATISTICAL_EVIDENCE",
                has_statistical_edge=False,
                recommended_action="WAIT",
                shrinkage_factor=0.0,
                confidence_interval={"lower": 0.0, "upper": 0.0},
                analytic_confidence_interval={"lower": 0.0, "upper": 0.0},
                bootstrap_confidence_interval={"lower": 0.0, "upper": 0.0},
                edge_state=EdgeState.UNKNOWN_EDGE,
                breakdown_metadata=meta
            )

        sample_count = len(trades)
        tier = cls.determine_evidence_tier(sample_count)

        r_values = []
        mfes = []
        maes = []
        durations = []
        regimes_seen = set()
        sessions_seen = set()

        wins = []
        losses = []
        breakevens = []

        for t in trades:
            r = float(t.get("r_multiple", t.get("realized_r", 0.0)))
            r_values.append(r)
            mfes.append(float(t.get("mfe_r", 0.0)))
            maes.append(float(t.get("mae_r", 0.0)))
            durations.append(float(t.get("duration_bars", t.get("bars_held", 0.0))))

            reg = t.get("market_regime") or t.get("regime")
            if reg:
                regimes_seen.add(str(reg).upper())
            ses = t.get("session")
            if ses:
                sessions_seen.add(str(ses).upper())

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

        raw_expectancy_r = (p_win * avg_win_r) - (p_loss * avg_loss_r)

        # Apply Bayesian shrinkage discount when sample size is weak
        shrinkage = 1.0
        if tier == SampleEvidenceTier.WEAK:
            shrinkage = 0.70  # 30% discount for low sample size
        elif tier == SampleEvidenceTier.MODERATE:
            shrinkage = 0.90  # 10% discount for moderate sample size

        discounted_expectancy = raw_expectancy_r * shrinkage
        total_costs_r = spread_cost_r + slippage_r + commission_r
        cost_adjusted_expectancy_r = discounted_expectancy - total_costs_r

        # Deterministic Bootstrap Confidence Interval of net R
        seed_key = f"{symbol or 'SYM'}:{setup_family or 'FAM'}:{sample_count}"
        boot_ci = calculate_deterministic_bootstrap_ci(r_values, seed_key=seed_key, n_bootstrap=1000)

        # Analytic 95% Confidence Interval for mean R
        std_err = std_dev_r / math.sqrt(sample_count) if sample_count > 1 else 0.0
        analytic_lower = round(raw_expectancy_r - (1.96 * std_err), 3)
        analytic_upper = round(raw_expectancy_r + (1.96 * std_err), 3)
        analytic_ci = {"lower": analytic_lower, "upper": analytic_upper}

        # Multi-Dimensional EdgeState Evaluation
        # 1. Negative Edge requires sample_size >= 50 AND cost_adjusted_expectancy_r < 0 AND upper CI < 0
        if cost_adjusted_expectancy_r < 0.0 and boot_ci["upper"] < 0.0 and analytic_upper < 0.0:
            edge_state = EdgeState.NEGATIVE_EDGE
            has_edge = False
            rec_action = "NO_TRADE"
            stat_status = "CONFIRMED_NEGATIVE_EDGE"
        # 2. If confidence interval crosses zero, classify as WEAK_EVIDENCE (uncertain statistical edge)
        elif boot_ci["lower"] <= 0.0 <= boot_ci["upper"]:
            edge_state = EdgeState.WEAK_EVIDENCE
            has_edge = False
            rec_action = "NO_TRADE"
            stat_status = "UNCERTAIN_CONFIDENCE_INTERVAL_CROSSES_ZERO"
        # 3. Lower CI strictly > 0: positive evidence
        elif boot_ci["lower"] > 0.0:
            if (
                sample_count >= cls.THRESHOLD_WEAK
                and cost_adjusted_expectancy_r >= cls.MIN_EXPECTANCY_R
                and profit_factor >= 1.25
                and len(regimes_seen) >= 2
            ):
                edge_state = EdgeState.STRONG_EVIDENCE
                has_edge = True
                rec_action = "TRADE"
                stat_status = "VALID_STRONG_EMPIRICAL_EVIDENCE"
            elif cost_adjusted_expectancy_r >= cls.MIN_EXPECTANCY_R and profit_factor >= 1.25:
                edge_state = EdgeState.MODERATE_EVIDENCE
                has_edge = True
                rec_action = "TRADE"
                stat_status = "VALID_MODERATE_EMPIRICAL_EVIDENCE"
            else:
                edge_state = EdgeState.WEAK_EVIDENCE
                has_edge = False
                rec_action = "NO_TRADE"
                stat_status = "POSITIVE_BUT_BELOW_PRODUCTION_THRESHOLDS"
        else:
            edge_state = EdgeState.WEAK_EVIDENCE
            has_edge = False
            rec_action = "NO_TRADE"
            stat_status = "WEAK_EMPIRICAL_EVIDENCE"

        # Stability Score: ratio of recent (last 20) EV to overall EV
        recent_ev = None
        historical_ev = round(raw_expectancy_r, 2)
        stability = 1.0
        if len(r_values) >= 30:
            recent_trades = r_values[-20:]
            recent_ev = round(float(np.mean(recent_trades)), 2)
            if historical_ev != 0:
                stability = round(max(0.0, min(2.0, recent_ev / max(0.01, abs(historical_ev)))), 2)

        conf_interval = calculate_wilson_confidence_interval(win_count, sample_count)

        return EmpiricalExpectancyResult(
            sample_count=sample_count,
            win_count=win_count,
            loss_count=loss_count,
            breakeven_count=be_count,
            empirical_win_probability=round(p_win, 4),
            empirical_loss_probability=round(p_loss, 4),
            empirical_BE_probability=round(p_be, 4),
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
            average_mfe_r=round(float(np.mean(mfes)) if mfes else 0.0, 2),
            average_mae_r=round(float(np.mean(maes)) if maes else 0.0, 2),
            average_duration_bars=round(float(np.mean(durations)) if durations else 0.0, 1),
            evidence_tier=tier,
            evidence_source=evidence_source,
            statistical_status=stat_status,
            has_statistical_edge=has_edge,
            recommended_action=rec_action,
            shrinkage_factor=shrinkage,
            confidence_interval=conf_interval,
            analytic_confidence_interval=analytic_ci,
            bootstrap_confidence_interval=boot_ci,
            edge_state=edge_state,
            stability_score=stability,
            regime_count=len(regimes_seen),
            session_count=len(sessions_seen),
            recent_expectancy=recent_ev,
            historical_expectancy=historical_ev,
            breakdown_metadata=meta
        )


# Global empirical expectancy engine instance
empirical_expectancy_engine = EmpiricalExpectancyEngine()
