"""
Deterministic SMC Engine - Layer 15:
Setup Quality Scoring & Confluence Evaluation (0-100 Deterministic Score).
Note: This is a systematic rule-confluence quality score, NOT an empirical win probability.
"""

from typing import Dict, Any
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class ConfidenceEngine(BaseEngine):
    """
    Layer 15: Aggregates systematic layer confluences into a deterministic
    Setup Quality Score (0 - 100). Enforces hard-fail vetos for any safety breaches.
    """

    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        results: Dict[str, EngineResult] = context.get("engine_results", {})

        # 1. Evaluate Hard-Fail Overrides first
        # L1: Eligibility (Session & Limits)
        elig = results.get("eligibility")
        if elig and elig.result == "NO TRADE":
            return EngineResult(
                result="hard_fail",
                confidence=0.0,
                explanation=f"Hard Fail Triggered: {elig.explanation}",
                metrics={"setup_quality_score": 0.0, "grade": "F", "fail_layer": "eligibility"},
                validation_status="invalid"
            )

        # Fundamentals / News Blackout
        funds = results.get("fundamentals")
        if funds and funds.result == "high_risk_news":
            return EngineResult(
                result="hard_fail",
                confidence=0.0,
                explanation=f"Hard Fail Triggered: {funds.explanation}",
                metrics={"setup_quality_score": 0.0, "grade": "F", "fail_layer": "fundamentals"},
                validation_status="invalid"
            )

        # Historical Pattern Memory (Loss Autopsy Veto)
        hist = results.get("historical_pattern")
        if hist and hist.validation_status in ["invalid", "pattern_blocked"]:
            return EngineResult(
                result="hard_fail",
                confidence=hist.confidence,
                explanation=f"Hard Fail Triggered: {hist.explanation}",
                metrics={"setup_quality_score": hist.confidence, "grade": "F", "fail_layer": "historical_pattern"},
                validation_status="invalid"
            )

        # Risk & Capital Shield
        risk = results.get("risk")
        if risk and risk.result == "rejected":
            return EngineResult(
                result="hard_fail",
                confidence=0.0,
                explanation=f"Hard Fail Triggered: {risk.explanation}",
                metrics={"setup_quality_score": 0.0, "grade": "F", "fail_layer": "risk"},
                validation_status="invalid"
            )

        # 2. Weighted Setup Quality Score Calculation
        weights = {
            "structure": 0.20,
            "higher_timeframe": 0.15,
            "liquidity": 0.15,
            "zones": 0.15,
            "fundamentals": 0.10,
            "volume": 0.10,
            "trend_quality": 0.05,
            "momentum": 0.05,
            "volatility": 0.05
        }

        weighted_sum = 0.0
        total_weight = 0.0
        breakdown = {}

        for key, weight in weights.items():
            engine_res = results.get(key)
            if engine_res:
                score = float(engine_res.confidence)
                weighted_sum += score * weight
                total_weight += weight
                breakdown[key] = round(score, 1)

        final_score = (weighted_sum / total_weight) if total_weight > 0 else 50.0

        # Incorporate historical pattern memory adaptation
        if hist and hist.result in ["stat_compiled", "pattern_reinforced", "lesson_applied"]:
            final_score += (hist.confidence - 50.0) * 0.20
            final_score = max(0.0, min(100.0, final_score))

        final_score = round(final_score, 1)

        # Qualitative Grade
        if final_score >= 88.0:
            grade = "A+"
        elif final_score >= 80.0:
            grade = "A"
        elif final_score >= 72.0:
            grade = "B"
        else:
            grade = "C"

        explanation = (
            f"Deterministic Setup Quality Score: {final_score}/100 (Grade: {grade}). "
            f"Reflects systematic SMC rule-matching confluence across 15 layers."
        )

        return EngineResult(
            result="score_calculated",
            confidence=final_score,
            explanation=explanation,
            metrics={
                "setup_quality_score": final_score,
                "grade": grade,
                "layer_breakdown": breakdown
            },
            validation_status="valid"
        )
