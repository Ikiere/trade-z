from typing import Dict
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class ConfidenceEngine(BaseEngine):
    """
    Layer 14: Aggregates individual engine scores using configurable
    weights, implementing hard-fail overrides for critical check violations.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        # Pull outputs of preceding engines passed in context
        results: Dict[str, EngineResult] = context.get("engine_results", {})

        # 1. Evaluate Hard-Fail Overrides first
        # L1: Eligibility
        elig = results.get("eligibility")
        if elig and elig.result == "NO TRADE":
            return EngineResult(
                result="hard_fail",
                confidence=0.0,
                explanation=f"Hard Fail Triggered: {elig.explanation}",
                metrics={},
                validation_status="invalid"
            )

        # L11: Fundamentals
        funds = results.get("fundamentals")
        if funds and funds.result == "high_risk_news":
            return EngineResult(
                result="hard_fail",
                confidence=0.0,
                explanation=f"Hard Fail Triggered: {funds.explanation}",
                metrics={},
                validation_status="invalid"
            )

        # L13: Risk
        risk = results.get("risk")
        if risk and risk.result == "rejected":
            return EngineResult(
                result="hard_fail",
                confidence=0.0,
                explanation=f"Hard Fail Triggered: {risk.explanation}",
                metrics={},
                validation_status="invalid"
            )

        # 2. Weighted Confidence Score Calculation
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

        for key, weight in weights.items():
            engine_res = results.get(key)
            if engine_res:
                weighted_sum += engine_res.confidence * weight
                total_weight += weight

        final_score = (weighted_sum / total_weight) if total_weight > 0 else 50.0

        # Incorporate historical bias boost/drag
        hist = results.get("historical_pattern")
        if hist and hist.result == "stat_compiled":
            final_score += (hist.confidence - 50.0) * 0.2
            final_score = max(0.0, min(100.0, final_score))

        explanation = f"Confidence Engine aggregates a weighted score of {final_score:.1f}%."

        return EngineResult(
            result="score_calculated",
            confidence=round(final_score, 2),
            explanation=explanation,
            metrics={"weighted_score": round(final_score, 2)},
            validation_status="valid"
        )
