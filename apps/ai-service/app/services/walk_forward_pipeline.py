"""
Trade-Z Walk-Forward Pipeline & Chronological Validation Engine:
Enforces strict time-series integrity for AI training, validation, and Out-Of-Sample (OOS) testing.
Prevents lookahead bias and data snooping by forbidding random shuffling of financial time-series.
Implements walk-forward rolling window validation and strategy/model versioning.
"""

from typing import List, Dict, Any, Optional, Tuple
import math
import numpy as np
from pydantic import BaseModel, Field
from app.services.empirical_expectancy import EmpiricalExpectancyEngine, EmpiricalExpectancyResult


class StrategyVersionInfo(BaseModel):
    version_name: str = "Trade-Z v2.2-EmpiricalSMC"
    strategy_version: str = "Trade-Z v2.2-EmpiricalSMC"
    feature_version: str = "feat_v2.2"
    model_version: str = "calibrated_ranker_v2.2"
    parameter_version: str = "param_v2.2"
    dataset_version: str = "chronological_v2"
    deterministic_layer_authoritative: bool = True


class WalkForwardSplit(BaseModel):
    train_set: List[Any] = Field(default_factory=list)
    val_set: List[Any] = Field(default_factory=list)
    oos_set: List[Any] = Field(default_factory=list)


class MarketStateRecord(BaseModel):
    """
    Complete state record combining structural features with forward targets.
    """
    record_id: str
    timestamp: str
    symbol: str
    timeframe: str = "15m"
    bar_index: int

    # Features (available at timestamp T strictly without lookahead)
    features: Dict[str, Any] = Field(default_factory=dict)
    # e.g.:
    # setup_family, session, market_regime, volatility_regime, htf_trend,
    # spread_pips, atr, confluence_score, risk_reward, ote_depth,
    # distance_to_liquidity, account_equity, initial_risk_money

    # Targets (realized forward path after execution)
    targets: Dict[str, Any] = Field(default_factory=dict)
    # e.g.:
    # outcome, r_multiple, mfe_r, mae_r, exit_reason, duration_bars, cost_adjusted_r


class SplitEvaluationMetrics(BaseModel):
    sample_size: int
    win_rate: float
    profit_factor: float
    expectancy_r: float
    cost_adjusted_expectancy_r: float
    average_mfe_r: float
    average_mae_r: float
    sharpe_ratio: float = 0.0
    status: str = "VALIDATED"


class WalkForwardWindowResult(BaseModel):
    window_index: int
    train_range: str
    val_range: str
    oos_range: str
    train_metrics: SplitEvaluationMetrics
    val_metrics: SplitEvaluationMetrics
    oos_metrics: SplitEvaluationMetrics
    degradation_pct: float             # Expectancy drop from Train to OOS
    passed_oos_validation: bool
    version_info: StrategyVersionInfo


class WalkForwardPipeline:
    """
    Chronological data splitting, feature/target packaging, and walk-forward validation.
    """

    DEFAULT_VERSION = StrategyVersionInfo()

    @staticmethod
    def partition_chronological(
        records: List[MarketStateRecord],
        train_pct: float = 0.60,
        val_pct: float = 0.20,
        oos_pct: float = 0.20
    ) -> Tuple[List[MarketStateRecord], List[MarketStateRecord], List[MarketStateRecord]]:
        """
        Partitions records strictly in chronological sequence (order preserved).
        Never randomly shuffles time-series data.
        """
        # Ensure chronological sorting by bar_index or timestamp
        sorted_recs = sorted(records, key=lambda r: (r.bar_index, r.timestamp))
        n = len(sorted_recs)

        if n == 0:
            return [], [], []

        train_end = int(n * train_pct)
        val_end = int(n * (train_pct + val_pct))

        train_set = sorted_recs[:train_end]
        val_set = sorted_recs[train_end:val_end]
        oos_set = sorted_recs[val_end:]

        return train_set, val_set, oos_set

    @staticmethod
    def evaluate_records(records: List[MarketStateRecord]) -> SplitEvaluationMetrics:
        """Computes statistical expectancy for a slice of market state records."""
        if not records:
            return SplitEvaluationMetrics(
                sample_size=0,
                win_rate=0.0,
                profit_factor=0.0,
                expectancy_r=0.0,
                cost_adjusted_expectancy_r=0.0,
                average_mfe_r=0.0,
                average_mae_r=0.0,
                status="EMPTY_DATASET"
            )

        trade_dicts = []
        for r in records:
            tgt = r.targets
            trade_dicts.append({
                "r_multiple": tgt.get("r_multiple", 0.0),
                "mfe_r": tgt.get("mfe_r", 0.0),
                "mae_r": tgt.get("mae_r", 0.0),
                "duration_bars": tgt.get("duration_bars", 0)
            })

        exp = EmpiricalExpectancyEngine.calculate_expectancy(trade_dicts)

        # Sharpe estimate based on R series
        r_series = [t["r_multiple"] for t in trade_dicts]
        std_r = float(np.std(r_series)) if len(r_series) > 1 else 1.0
        sharpe = round((exp.expectancy_r / max(0.01, std_r)) * math.sqrt(252), 2)

        return SplitEvaluationMetrics(
            sample_size=exp.sample_count,
            win_rate=exp.win_rate,
            profit_factor=exp.profit_factor,
            expectancy_r=exp.expectancy_r,
            cost_adjusted_expectancy_r=exp.cost_adjusted_expectancy_r,
            average_mfe_r=exp.average_mfe_r,
            average_mae_r=exp.average_mae_r,
            sharpe_ratio=sharpe,
            status="PASSED" if exp.cost_adjusted_expectancy_r > 0.15 else "MARGINAL"
        )

    @classmethod
    def run_walk_forward_evaluation(
        cls,
        records: List[MarketStateRecord],
        version_info: Optional[StrategyVersionInfo] = None
    ) -> WalkForwardWindowResult:
        """
        Executes chronological Train -> Validation -> Out-Of-Sample evaluation
        and validates whether strategy edge persists out-of-sample without curve-fitting.
        """
        ver = version_info or cls.DEFAULT_VERSION
        train_set, val_set, oos_set = cls.partition_chronological(records)

        train_metrics = cls.evaluate_records(train_set)
        val_metrics = cls.evaluate_records(val_set)
        oos_metrics = cls.evaluate_records(oos_set)

        # Calculate out-of-sample degradation
        # Degradation = (Train EV - OOS EV) / max(0.1, Train EV) * 100
        train_ev = max(0.01, train_metrics.expectancy_r)
        oos_ev = oos_metrics.expectancy_r
        deg = round(((train_ev - oos_ev) / train_ev) * 100.0, 1)

        # OOS Pass criteria:
        # 1. OOS Cost-adjusted EV must remain positive (>= 0.10R)
        # 2. OOS Profit factor >= 1.20
        # 3. Degradation must not exceed 50%
        passed = (
            oos_metrics.cost_adjusted_expectancy_r >= 0.10
            and oos_metrics.profit_factor >= 1.20
            and deg < 50.0
            and oos_metrics.sample_size >= 10
        )

        train_range = f"Bars {train_set[0].bar_index}-{train_set[-1].bar_index}" if train_set else "N/A"
        val_range = f"Bars {val_set[0].bar_index}-{val_set[-1].bar_index}" if val_set else "N/A"
        oos_range = f"Bars {oos_set[0].bar_index}-{oos_set[-1].bar_index}" if oos_set else "N/A"

        return WalkForwardWindowResult(
            window_index=1,
            train_range=train_range,
            val_range=val_range,
            oos_range=oos_range,
            train_metrics=train_metrics,
            val_metrics=val_metrics,
            oos_metrics=oos_metrics,
            degradation_pct=deg,
            passed_oos_validation=passed,
            version_info=ver
        )

    def chronological_split(
        self,
        records: List[Any],
        train_pct: float = 0.60,
        val_pct: float = 0.20,
        oos_pct: float = 0.20
    ) -> WalkForwardSplit:
        """
        Chronological partition of records preserving time series order.
        """
        n = len(records)
        train_end = int(n * train_pct)
        val_end = int(n * (train_pct + val_pct))
        return WalkForwardSplit(
            train_set=records[:train_end],
            val_set=records[train_end:val_end],
            oos_set=records[val_end:]
        )

    def get_strategy_version_info(self) -> StrategyVersionInfo:
        return self.DEFAULT_VERSION


# Global pipeline instance
walk_forward_pipeline = WalkForwardPipeline()
