"""
Trade-Z AI Service — Confidence Scoring & Decision Engine
Evaluates market parameters, scores trades, and outputs institutional trading rationale.
"""

from typing import Optional, Dict, Any


def evaluate_decision(
    pair: str,
    timeframe: str,
    trend_bias: str,
    indicators_confluence: float,
    structure_score: float,
    liquidity_score: float,
    volume_score: float,
    risk_reward_ratio: float,
    news_impact_low: bool,
    required_confidence: float = 85.0
) -> Dict[str, Any]:
    """
    Evaluates a setup against institutional rules.
    Returns: dict representing decision, confidence level, and rationale.
    """
    # 1. Calculate weighted confidence scoring
    # Structure (25%), Trend (20%), Momentum/Indicators (15%), Liquidity (15%), Volume (15%), Risk/Reward (10%)
    weighted_score = (
        (structure_score * 0.25) +
        ((100 if trend_bias != "neutral" else 50) * 0.20) +
        (indicators_confluence * 0.15) +
        (liquidity_score * 0.15) +
        (volume_score * 0.15) +
        ((100 if risk_reward_ratio >= 2.0 else 50) * 0.10)
    )

    # 2. Risk safeguard modifiers
    rejection_reasons = []

    if risk_reward_ratio < 1.5:
        rejection_reasons.append("Risk reward ratio is below 1:1.5 threshold.")
    if not news_impact_low:
        # Volatility block
        rejection_reasons.append("High-impact economic release event scheduled close to entry.")
    if trend_bias == "neutral":
        rejection_reasons.append("Market is consolidating in tight ranges without trend direction.")

    # A setup is rejected if it has critical risk issues or fails confidence thresholds
    passed_score = weighted_score >= required_confidence
    passed_rules = len(rejection_reasons) == 0

    decision = "no_trade"
    if passed_score and passed_rules:
        decision = "approve"
    elif not passed_rules:
        decision = "reject"
    else:
        decision = "wait"

    # 3. Generate natural language reasoning/explanation
    reasoning = ""
    if decision == "approve":
        reasoning = (
            f"Set up on {pair} ({timeframe}) approved with {weighted_score:.1f}% confidence. "
            f"Market structure is highly aligned ({structure_score:.1f}%), trend bias is strong ({trend_bias}), "
            f"and target Risk-Reward ({risk_reward_ratio:.2f}) represents an institutional-grade opportunity."
        )
    elif decision == "reject":
        reasoning = (
            f"Set up on {pair} ({timeframe}) rejected with {weighted_score:.1f}% confidence. "
            f"Rejection reason: {', '.join(rejection_reasons)}"
        )
    else:
        reasoning = (
            f"Set up on {pair} ({timeframe}) deferred to WATCH list (Confidence: {weighted_score:.1f}%). "
            f"Confluences are insufficient to trigger immediate entry. Awaiting cleaner volume breakout."
        )

    return {
        "pair": pair,
        "timeframe": timeframe,
        "decision": decision,
        "confidence": round(weighted_score, 2),
        "reasoning": reasoning,
        "rejection_reasons": rejection_reasons,
        "confluence_breakdown": {
            "marketStructure": round(structure_score, 1),
            "trend": 100 if trend_bias != "neutral" else 50,
            "momentum": round(indicators_confluence, 1),
            "liquidity": round(liquidity_score, 1),
            "economicNews": 100 if news_impact_low else 10,
            "riskReward": 100 if risk_reward_ratio >= 2.0 else 50,
            "overall": round(weighted_score, 1),
        }
    }
