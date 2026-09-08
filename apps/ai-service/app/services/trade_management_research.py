"""
Trade-Z Trade Management Research Engine
Evaluates Break-Even (BE) rules, Partial Take-Profit policies, and Runner management
across historical trade paths.

Quantifies the empirical trade-off:
Does moving to Break-Even protect capital, or does it prematurely stop out runners
that subsequently reach full Target Profit (TP)?
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class BEPolicy(str, Enum):
    NO_BE = "NO_BE"
    BE_AT_0_5R = "BE_AT_0_5R"
    BE_AT_1_0R = "BE_AT_1_0R"
    BE_STRUCTURAL = "BE_STRUCTURAL"


class PartialPolicy(str, Enum):
    NO_PARTIAL = "NO_PARTIAL"
    PARTIAL_25_AT_1R = "PARTIAL_25_AT_1R"
    PARTIAL_50_AT_1R = "PARTIAL_50_AT_1R"
    PARTIAL_75_AT_1R = "PARTIAL_75_AT_1R"


@dataclass
class TradePathSample:
    """
    Represents the forward price path of a trade.
    """
    trade_id: str
    symbol: str
    target_r: float  # Planned TP (e.g. +2.5R, +3.0R)
    mfe_r: float  # Maximum Favorable Excursion in R (e.g. +1.8R)
    mae_r: float  # Maximum Adverse Excursion in R (e.g. -0.4R)
    first_reached_1r: bool  # Did price reach +1.0R before hitting -1.0R?
    first_reached_0_5r: bool  # Did price reach +0.5R before hitting -1.0R?
    structural_bos_formed: bool  # Did price form structural confirmation swing?
    hit_tp_eventually: bool  # Did price eventually reach planned TP?
    pulled_back_to_entry_after_1r: bool  # After reaching +1R, did price pull back to entry (0.0R)?
    pulled_back_to_entry_after_0_5r: bool  # After reaching +0.5R, did price pull back to entry?


@dataclass
class PolicyEvaluationResult:
    be_policy: str
    partial_policy: str
    total_trades: int
    total_net_r: float
    win_rate: float
    profit_factor: float
    avg_r: float
    premature_be_stopouts: int  # Trades stopped at 0.0R that would have hit TP
    avg_mfe_captured_pct: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "be_policy": self.be_policy,
            "partial_policy": self.partial_policy,
            "total_trades": self.total_trades,
            "total_net_r": round(self.total_net_r, 2),
            "win_rate": round(self.win_rate * 100, 1),
            "profit_factor": round(self.profit_factor, 2),
            "avg_r": round(self.avg_r, 2),
            "premature_be_stopouts": self.premature_be_stopouts,
            "avg_mfe_captured_pct": round(self.avg_mfe_captured_pct * 100, 1),
        }


class TradeManagementResearcher:
    """
    Simulates all combinations of BE and Partial policies across a set of trade paths.
    """

    @staticmethod
    def evaluate_all_combinations(
        trade_paths: List[TradePathSample],
    ) -> Dict[str, Any]:
        """
        Runs full matrix evaluation across all BE and Partial policies.
        """
        if not trade_paths:
            return {
                "total_trades": 0,
                "best_policy": None,
                "all_policies": [],
            }

        be_policies = [
            BEPolicy.NO_BE,
            BEPolicy.BE_AT_0_5R,
            BEPolicy.BE_AT_1_0R,
            BEPolicy.BE_STRUCTURAL,
        ]

        partial_policies = [
            PartialPolicy.NO_PARTIAL,
            PartialPolicy.PARTIAL_25_AT_1R,
            PartialPolicy.PARTIAL_50_AT_1R,
            PartialPolicy.PARTIAL_75_AT_1R,
        ]

        results: List[PolicyEvaluationResult] = []

        for be in be_policies:
            for part in partial_policies:
                res = TradeManagementResearcher._simulate_policy(
                    trade_paths=trade_paths,
                    be_policy=be,
                    partial_policy=part,
                )
                results.append(res)

        # Sort by total net R descending
        sorted_results = sorted(results, key=lambda x: x.total_net_r, reverse=True)
        best = sorted_results[0].to_dict() if sorted_results else None

        return {
            "total_trades_analyzed": len(trade_paths),
            "best_performing_policy": best,
            "matrix_comparison": [r.to_dict() for r in sorted_results],
        }

    @staticmethod
    def _simulate_policy(
        trade_paths: List[TradePathSample],
        be_policy: BEPolicy,
        partial_policy: PartialPolicy,
    ) -> PolicyEvaluationResult:
        total_r = 0.0
        gross_profit_r = 0.0
        gross_loss_r = 0.0
        wins = 0
        premature_stops = 0
        mfe_captures: List[float] = []

        for path in trade_paths:
            realized_r, premature = TradeManagementResearcher._simulate_single_trade(
                path, be_policy, partial_policy
            )
            total_r += realized_r

            if realized_r > 0.05:
                wins += 1
                gross_profit_r += realized_r
            elif realized_r < -0.05:
                gross_loss_r += abs(realized_r)

            if premature:
                premature_stops += 1

            if path.mfe_r > 0:
                capture = max(0.0, min(1.0, realized_r / path.mfe_r))
                mfe_captures.append(capture)
            else:
                mfe_captures.append(0.0)

        n = len(trade_paths)
        win_rate = (wins / n) if n > 0 else 0.0
        profit_factor = (gross_profit_r / gross_loss_r) if gross_loss_r > 0 else (999.0 if gross_profit_r > 0 else 1.0)
        avg_r = (total_r / n) if n > 0 else 0.0
        avg_mfe = (sum(mfe_captures) / len(mfe_captures)) if mfe_captures else 0.0

        return PolicyEvaluationResult(
            be_policy=be_policy.value,
            partial_policy=partial_policy.value,
            total_trades=n,
            total_net_r=total_r,
            win_rate=win_rate,
            profit_factor=profit_factor,
            avg_r=avg_r,
            premature_be_stopouts=premature_stops,
            avg_mfe_captured_pct=avg_mfe,
        )

    @staticmethod
    def _simulate_single_trade(
        path: TradePathSample,
        be_policy: BEPolicy,
        partial_policy: PartialPolicy,
    ) -> (float, bool):
        """
        Calculates realized R and whether the trade suffered a premature BE stopout.
        """
        # Determine partial ratio and remaining runner ratio
        if partial_policy == PartialPolicy.NO_PARTIAL:
            p_ratio = 0.0
            r_ratio = 1.0
        elif partial_policy == PartialPolicy.PARTIAL_25_AT_1R:
            p_ratio = 0.25
            r_ratio = 0.75
        elif partial_policy == PartialPolicy.PARTIAL_50_AT_1R:
            p_ratio = 0.50
            r_ratio = 0.50
        elif partial_policy == PartialPolicy.PARTIAL_75_AT_1R:
            p_ratio = 0.75
            r_ratio = 0.25
        else:
            p_ratio = 0.0
            r_ratio = 1.0

        # Check if trade reached -1.0R (full SL) without ever triggering BE or Partials
        if not path.first_reached_0_5r and not path.first_reached_1r:
            # Full loss
            return -1.0, False

        # Check Partial Take Profit trigger (+1.0R)
        partial_realized_r = 0.0
        has_taken_partial = False
        if p_ratio > 0 and path.first_reached_1r:
            partial_realized_r = p_ratio * 1.0  # 1R on partial size
            has_taken_partial = True

        # Now determine what happens to the remaining position (r_ratio)
        premature_stop = False
        runner_realized_r = 0.0

        # Check BE trigger:
        be_active = False
        if be_policy == BEPolicy.BE_AT_0_5R and path.first_reached_0_5r:
            be_active = True
        elif be_policy == BEPolicy.BE_AT_1_0R and path.first_reached_1r:
            be_active = True
        elif be_policy == BEPolicy.BE_STRUCTURAL and path.structural_bos_formed:
            be_active = True

        # Evaluate if runner gets stopped at BE or hits TP or hits original SL
        if be_active:
            # If BE is active and price pulled back to entry
            pulled_back = (
                path.pulled_back_to_entry_after_0_5r if be_policy == BEPolicy.BE_AT_0_5R
                else path.pulled_back_to_entry_after_1r
            )
            if pulled_back:
                # Stopped at 0.0R on runner
                runner_realized_r = 0.0
                if path.hit_tp_eventually:
                    premature_stop = True
            elif path.hit_tp_eventually:
                runner_realized_r = r_ratio * path.target_r
            else:
                # Did not hit TP, didn't pull back to 0, ended at MFE or exit
                runner_realized_r = r_ratio * max(0.0, path.mfe_r)
        else:
            # No BE active
            if path.hit_tp_eventually:
                runner_realized_r = r_ratio * path.target_r
            else:
                # Slid back into full SL (-1.0R)
                runner_realized_r = r_ratio * -1.0

        total_realized = partial_realized_r + runner_realized_r
        return total_realized, premature_stop
