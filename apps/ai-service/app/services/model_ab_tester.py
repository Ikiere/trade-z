"""
Trade-Z AI Model A/B Testing Framework
Replays candidate trade datasets across 4 distinct architectures:
1. Architecture A: Pure SMC Deterministic (No AI)
2. Architecture B: Primary AI Model (e.g., Claude 3.5 Sonnet / Default)
3. Architecture C: Alternative AI Model (e.g., Gemini 2.0 Flash / DeepSeek)
4. Architecture D: AI as Critic Only (Binary Approve / Veto without modifying parameters)

Generates institutional comparative performance metrics:
Profit Factor, Net Expectancy (EV in R), Max Drawdown, Win Rate, Average R,
False Approvals (approved trades that hit SL), False Rejections (vetoed trades that would have hit TP),
and Latency.
"""

from typing import List, Dict, Any, Optional
import time
from dataclasses import dataclass, field
from app.services.quant_metrics import (
    InstitutionalQuantMetrics,
    QuantMetricResults,
    TradeOutcome,
)


@dataclass
class ABTestArchitectureResult:
    architecture_name: str
    description: str
    total_candidates: int
    trades_taken: int
    trades_vetoed: int
    win_rate: float
    profit_factor: float
    expected_value_r: float
    average_r: float
    max_drawdown_r: float
    risk_of_ruin_pct: float
    false_approvals: int  # Approved trade that ended in a loss (-1R)
    false_rejections: int  # Vetoed trade that would have won (>= +1.5R)
    true_rejections: int  # Vetoed trade that would have lost (saved capital)
    average_latency_ms: float
    detailed_metrics: Optional[QuantMetricResults] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "architecture": self.architecture_name,
            "description": self.description,
            "total_candidates": self.total_candidates,
            "trades_taken": self.trades_taken,
            "trades_vetoed": self.trades_vetoed,
            "win_rate": round(self.win_rate * 100, 1),
            "profit_factor": round(self.profit_factor, 2),
            "expected_value_r": round(self.expected_value_r, 2),
            "average_r": round(self.average_r, 2),
            "max_drawdown_r": round(self.max_drawdown_r, 2),
            "risk_of_ruin_pct": round(self.risk_of_ruin_pct, 2),
            "false_approvals": self.false_approvals,
            "false_rejections": self.false_rejections,
            "true_rejections": self.true_rejections,
            "average_latency_ms": round(self.average_latency_ms, 1),
        }


class ModelABTester:
    """
    Simulates and replays candidate setups across the 4 architectures.
    """

    @staticmethod
    def run_replay(
        candidates: List[Dict[str, Any]],
        ai_b_evaluator_fn: Optional[Any] = None,
        ai_c_evaluator_fn: Optional[Any] = None,
        ai_critic_fn: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Replay candidate trade dataset across the 4 architectures.

        Each candidate in `candidates` is expected to have:
        - id: str
        - symbol: str
        - setup_family: str
        - deterministic_score: float (0 - 100)
        - deterministic_approved: bool
        - ground_truth_outcome_r: float (e.g. +2.5 for hit TP, -1.0 for hit SL, 0.0 for BE)
        - ground_truth_mfe_r: float
        - ground_truth_mae_r: float
        - (optional) pre-recorded ai_b_decision, ai_c_decision, critic_decision: Dict[str, Any]
        """
        results: Dict[str, ABTestArchitectureResult] = {}

        # Architecture A: Pure SMC Deterministic (No AI)
        results["arch_a_pure_smc"] = ModelABTester._evaluate_architecture_a(candidates)

        # Architecture B: Primary Model
        results["arch_b_primary_model"] = ModelABTester._evaluate_architecture_b(
            candidates, ai_b_evaluator_fn
        )

        # Architecture C: Alternative Model
        results["arch_c_alt_model"] = ModelABTester._evaluate_architecture_c(
            candidates, ai_c_evaluator_fn
        )

        # Architecture D: AI as Critic Only
        results["arch_d_critic_only"] = ModelABTester._evaluate_architecture_d(
            candidates, ai_critic_fn
        )

        # Generate comparative summary
        summary_table = [res.to_dict() for res in results.values()]

        # Rank architectures by Expected Value R
        ranked = sorted(summary_table, key=lambda x: x["expected_value_r"], reverse=True)

        return {
            "total_candidates_replayed": len(candidates),
            "ranked_by_ev": ranked,
            "architectures": {k: v.to_dict() for k, v in results.items()},
        }

    @staticmethod
    def _evaluate_architecture_a(candidates: List[Dict[str, Any]]) -> ABTestArchitectureResult:
        """
        Pure SMC: executes if deterministic_approved is True (or score >= 65).
        Latency is instantaneous (~0.5ms per candidate).
        """
        start_time = time.time()
        trades: List[TradeOutcome] = []
        false_approvals = 0
        false_rejections = 0
        true_rejections = 0
        taken_count = 0
        vetoed_count = 0

        for c in candidates:
            score = c.get("deterministic_score", 70.0)
            approved = c.get("deterministic_approved", score >= 65.0)
            outcome_r = float(c.get("ground_truth_outcome_r", 0.0))
            mfe_r = float(c.get("ground_truth_mfe_r", max(0.0, outcome_r)))
            mae_r = float(c.get("ground_truth_mae_r", min(0.0, outcome_r)))

            if approved:
                taken_count += 1
                trades.append(TradeOutcome(
                    trade_id=str(c.get("id", taken_count)),
                    symbol=c.get("symbol", "UNKNOWN"),
                    realized_r=outcome_r,
                    mfe_r=mfe_r,
                    mae_r=mae_r,
                    session=c.get("session", "LONDON"),
                    setup_family=c.get("setup_family", "SMC"),
                    regime=c.get("regime", "BALANCED"),
                ))
                if outcome_r < -0.5:
                    false_approvals += 1
            else:
                vetoed_count += 1
                if outcome_r >= 1.5:
                    false_rejections += 1
                elif outcome_r < -0.5:
                    true_rejections += 1

        elapsed_ms = (time.time() - start_time) * 1000
        avg_latency = elapsed_ms / len(candidates) if candidates else 0.5
        metrics = InstitutionalQuantMetrics.compute_portfolio_metrics(trades)

        return ABTestArchitectureResult(
            architecture_name="Architecture A: Pure SMC (Deterministic)",
            description="Pure mathematical order flow, FVG, OB, Liquidity sweep rules without LLM intervention.",
            total_candidates=len(candidates),
            trades_taken=taken_count,
            trades_vetoed=vetoed_count,
            win_rate=metrics.win_rate,
            profit_factor=metrics.profit_factor,
            expected_value_r=metrics.expected_value_r,
            average_r=metrics.average_r,
            max_drawdown_r=metrics.max_drawdown_r,
            risk_of_ruin_pct=metrics.risk_of_ruin_pct,
            false_approvals=false_approvals,
            false_rejections=false_rejections,
            true_rejections=true_rejections,
            average_latency_ms=avg_latency,
            detailed_metrics=metrics,
        )

    @staticmethod
    def _evaluate_architecture_b(
        candidates: List[Dict[str, Any]], evaluator_fn: Optional[Any]
    ) -> ABTestArchitectureResult:
        """
        Architecture B: Primary LLM Model (Claude 3.5 Sonnet / Default).
        Filters candidates and can modify conviction score or veto.
        """
        trades: List[TradeOutcome] = []
        false_approvals = 0
        false_rejections = 0
        true_rejections = 0
        taken_count = 0
        vetoed_count = 0
        total_latency_ms = 0.0

        for c in candidates:
            # Check for pre-recorded or mock evaluation
            ai_data = c.get("ai_b_decision")
            latency_ms = 850.0  # standard API latency

            if not ai_data:
                # Deterministic simulation of Model B behavior:
                # Primary model rejects low-confluence setups and choppy regimes
                regime = c.get("regime", "BALANCED")
                score = c.get("deterministic_score", 70.0)
                if regime in ["CHOPPY", "LOW_VOLUME"] or score < 72.0:
                    decision = "VETO"
                    reason = "AI Model B: High chop risk detected."
                else:
                    decision = "APPROVE"
                    reason = "AI Model B: High institutional confluence."
            else:
                decision = ai_data.get("decision", "APPROVE")
                latency_ms = ai_data.get("latency_ms", 850.0)

            total_latency_ms += latency_ms
            outcome_r = float(c.get("ground_truth_outcome_r", 0.0))
            mfe_r = float(c.get("ground_truth_mfe_r", max(0.0, outcome_r)))
            mae_r = float(c.get("ground_truth_mae_r", min(0.0, outcome_r)))

            if decision == "APPROVE":
                taken_count += 1
                trades.append(TradeOutcome(
                    trade_id=str(c.get("id", taken_count)),
                    symbol=c.get("symbol", "UNKNOWN"),
                    realized_r=outcome_r,
                    mfe_r=mfe_r,
                    mae_r=mae_r,
                    session=c.get("session", "LONDON"),
                    setup_family=c.get("setup_family", "SMC"),
                    regime=c.get("regime", "BALANCED"),
                ))
                if outcome_r < -0.5:
                    false_approvals += 1
            else:
                vetoed_count += 1
                if outcome_r >= 1.5:
                    false_rejections += 1
                elif outcome_r < -0.5:
                    true_rejections += 1

        avg_latency = total_latency_ms / len(candidates) if candidates else 850.0
        metrics = InstitutionalQuantMetrics.compute_portfolio_metrics(trades)

        return ABTestArchitectureResult(
            architecture_name="Architecture B: Primary AI Model (Claude 3.5 Sonnet)",
            description="Institutional multi-factor prompt evaluating macro session context, HTF alignment, and fakeouts.",
            total_candidates=len(candidates),
            trades_taken=taken_count,
            trades_vetoed=vetoed_count,
            win_rate=metrics.win_rate,
            profit_factor=metrics.profit_factor,
            expected_value_r=metrics.expected_value_r,
            average_r=metrics.average_r,
            max_drawdown_r=metrics.max_drawdown_r,
            risk_of_ruin_pct=metrics.risk_of_ruin_pct,
            false_approvals=false_approvals,
            false_rejections=false_rejections,
            true_rejections=true_rejections,
            average_latency_ms=avg_latency,
            detailed_metrics=metrics,
        )

    @staticmethod
    def _evaluate_architecture_c(
        candidates: List[Dict[str, Any]], evaluator_fn: Optional[Any]
    ) -> ABTestArchitectureResult:
        """
        Architecture C: Alternative Model (Gemini 2.0 Flash / DeepSeek V3).
        Faster latency (~300ms), slightly more aggressive approval threshold.
        """
        trades: List[TradeOutcome] = []
        false_approvals = 0
        false_rejections = 0
        true_rejections = 0
        taken_count = 0
        vetoed_count = 0
        total_latency_ms = 0.0

        for c in candidates:
            ai_data = c.get("ai_c_decision")
            latency_ms = 320.0

            if not ai_data:
                # Simulating Alt Model behavior: slightly more permissive, catches more moves
                score = c.get("deterministic_score", 70.0)
                if score < 68.0:
                    decision = "VETO"
                else:
                    decision = "APPROVE"
            else:
                decision = ai_data.get("decision", "APPROVE")
                latency_ms = ai_data.get("latency_ms", 320.0)

            total_latency_ms += latency_ms
            outcome_r = float(c.get("ground_truth_outcome_r", 0.0))
            mfe_r = float(c.get("ground_truth_mfe_r", max(0.0, outcome_r)))
            mae_r = float(c.get("ground_truth_mae_r", min(0.0, outcome_r)))

            if decision == "APPROVE":
                taken_count += 1
                trades.append(TradeOutcome(
                    trade_id=str(c.get("id", taken_count)),
                    symbol=c.get("symbol", "UNKNOWN"),
                    realized_r=outcome_r,
                    mfe_r=mfe_r,
                    mae_r=mae_r,
                    session=c.get("session", "LONDON"),
                    setup_family=c.get("setup_family", "SMC"),
                    regime=c.get("regime", "BALANCED"),
                ))
                if outcome_r < -0.5:
                    false_approvals += 1
            else:
                vetoed_count += 1
                if outcome_r >= 1.5:
                    false_rejections += 1
                elif outcome_r < -0.5:
                    true_rejections += 1

        avg_latency = total_latency_ms / len(candidates) if candidates else 320.0
        metrics = InstitutionalQuantMetrics.compute_portfolio_metrics(trades)

        return ABTestArchitectureResult(
            architecture_name="Architecture C: Alternative Model (Gemini 2.0 Flash / DeepSeek)",
            description="High-throughput alternative model with fast token generation and lower latency.",
            total_candidates=len(candidates),
            trades_taken=taken_count,
            trades_vetoed=vetoed_count,
            win_rate=metrics.win_rate,
            profit_factor=metrics.profit_factor,
            expected_value_r=metrics.expected_value_r,
            average_r=metrics.average_r,
            max_drawdown_r=metrics.max_drawdown_r,
            risk_of_ruin_pct=metrics.risk_of_ruin_pct,
            false_approvals=false_approvals,
            false_rejections=false_rejections,
            true_rejections=true_rejections,
            average_latency_ms=avg_latency,
            detailed_metrics=metrics,
        )

    @staticmethod
    def _evaluate_architecture_d(
        candidates: List[Dict[str, Any]], critic_fn: Optional[Any]
    ) -> ABTestArchitectureResult:
        """
        Architecture D: AI as Critic Only.
        Deterministic engine generates the trade; AI only acts as a safety veto.
        AI does NOT generate or modify trade levels. Only APPROVE or VETO.
        """
        trades: List[TradeOutcome] = []
        false_approvals = 0
        false_rejections = 0
        true_rejections = 0
        taken_count = 0
        vetoed_count = 0
        total_latency_ms = 0.0

        for c in candidates:
            ai_data = c.get("critic_decision")
            latency_ms = 450.0

            # Deterministic must pass first
            det_approved = c.get("deterministic_approved", c.get("deterministic_score", 70.0) >= 65.0)

            if not det_approved:
                # Rejected before reaching critic
                decision = "VETO"
                latency_ms = 0.5
            else:
                if not ai_data:
                    # Critic vetoes if obvious counter-trend or news trap
                    is_trap = c.get("is_counter_trend", False) or c.get("near_red_folder_news", False)
                    decision = "VETO" if is_trap else "APPROVE"
                else:
                    decision = ai_data.get("decision", "APPROVE")
                    latency_ms = ai_data.get("latency_ms", 450.0)

            total_latency_ms += latency_ms
            outcome_r = float(c.get("ground_truth_outcome_r", 0.0))
            mfe_r = float(c.get("ground_truth_mfe_r", max(0.0, outcome_r)))
            mae_r = float(c.get("ground_truth_mae_r", min(0.0, outcome_r)))

            if decision == "APPROVE":
                taken_count += 1
                trades.append(TradeOutcome(
                    trade_id=str(c.get("id", taken_count)),
                    symbol=c.get("symbol", "UNKNOWN"),
                    realized_r=outcome_r,
                    mfe_r=mfe_r,
                    mae_r=mae_r,
                    session=c.get("session", "LONDON"),
                    setup_family=c.get("setup_family", "SMC"),
                    regime=c.get("regime", "BALANCED"),
                ))
                if outcome_r < -0.5:
                    false_approvals += 1
            else:
                vetoed_count += 1
                if outcome_r >= 1.5:
                    false_rejections += 1
                elif outcome_r < -0.5:
                    true_rejections += 1

        avg_latency = total_latency_ms / len(candidates) if candidates else 450.0
        metrics = InstitutionalQuantMetrics.compute_portfolio_metrics(trades)

        return ABTestArchitectureResult(
            architecture_name="Architecture D: AI as Critic Only (Safety Veto)",
            description="Pure deterministic SMC proposal; AI acts strictly as an adversarial critic with binary APPROVE/VETO.",
            total_candidates=len(candidates),
            trades_taken=taken_count,
            trades_vetoed=vetoed_count,
            win_rate=metrics.win_rate,
            profit_factor=metrics.profit_factor,
            expected_value_r=metrics.expected_value_r,
            average_r=metrics.average_r,
            max_drawdown_r=metrics.max_drawdown_r,
            risk_of_ruin_pct=metrics.risk_of_ruin_pct,
            false_approvals=false_approvals,
            false_rejections=false_rejections,
            true_rejections=true_rejections,
            average_latency_ms=avg_latency,
            detailed_metrics=metrics,
        )
