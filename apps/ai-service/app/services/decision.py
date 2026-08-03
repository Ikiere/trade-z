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
    required_confidence: float = 85.0,
    history: Optional[list] = None
) -> Dict[str, Any]:
    """
    Evaluates a setup against institutional rules.
    Returns: dict representing decision, confidence level, and rationale.
    """
    # 1. Calculate feedback loop modifiers from trade history
    history_adjust = 0.0
    history_reasons = []
    
    if history and len(history) > 0:
        active_direction = 'long' if trend_bias == 'bullish' else 'short'
        consecutive_losses = 0
        consecutive_wins = 0
        
        for trade in history:
            trade_dir = str(trade.get("direction", "")).lower()
            pnl = float(trade.get("pnl", 0.0) or 0.0)
            status = str(trade.get("status", "")).lower()
            
            # Loss count
            if pnl < 0 or status == 'stopped_out':
                if trade_dir == active_direction:
                    consecutive_losses += 1
                consecutive_wins = 0
            # Win count
            elif pnl > 0 or status == 'take_profit':
                if trade_dir == active_direction:
                    consecutive_wins += 1
                consecutive_losses = 0
                
        if consecutive_losses >= 2:
            history_adjust = -12.0
            history_reasons.append(f"Avoid repeat structures: protected after {consecutive_losses} consecutive losses on {pair} {active_direction.upper()}.")
        elif consecutive_wins >= 2:
            history_adjust = +6.0
            history_reasons.append(f"Strategy reinforced: {consecutive_wins} consecutive winning {active_direction.upper()} trades on {pair} detected.")

    # 2. Calculate weighted confidence scoring
    # Structure (25%), Trend (20%), Momentum/Indicators (15%), Liquidity (15%), Volume (15%), Risk/Reward (10%)
    weighted_score = (
        (structure_score * 0.25) +
        ((100 if trend_bias != "neutral" else 50) * 0.20) +
        (indicators_confluence * 0.15) +
        (liquidity_score * 0.15) +
        (volume_score * 0.15) +
        ((100 if risk_reward_ratio >= 2.0 else 50) * 0.10)
    ) + history_adjust

    # 3. Risk safeguard modifiers
    rejection_reasons = []
    if history_reasons and history_adjust < 0:
        rejection_reasons.extend(history_reasons)

    if risk_reward_ratio < 1.5:
        rejection_reasons.append("Risk reward ratio is below 1:1.5 threshold.")
    if not news_impact_low:
        # Volatility block
        rejection_reasons.append("High-impact economic release event scheduled close to entry.")
    if trend_bias == "neutral":
        rejection_reasons.append("Market is consolidating in tight ranges without trend direction.")

    passed_score = weighted_score >= required_confidence
    passed_rules = len(rejection_reasons) == 0

    decision = "no_trade"
    if passed_score and passed_rules:
        decision = "approve"
    elif not passed_rules:
        decision = "reject"
    else:
        decision = "wait"

    expected_trigger = None
    if decision == "approve":
        if timeframe in ["15m", "30m"]:
            expected_trigger = "Expected trigger zone entry within 15-45 minutes."
        elif timeframe in ["1h"]:
            expected_trigger = "Expected trigger zone entry within 1-3 hours."
        else:
            expected_trigger = "Expected trigger zone entry within 6-12 hours."

    # 3. Generate natural language reasoning/explanation
    reasoning = ""
    if decision == "approve":
        trigger_text = f" [{expected_trigger}]" if expected_trigger else ""
        reasoning = (
            f"Set up on {pair} ({timeframe}) approved with {weighted_score:.1f}% confidence. "
            f"Market structure is highly aligned ({structure_score:.1f}%), trend bias is strong ({trend_bias}), "
            f"and target Risk-Reward ({risk_reward_ratio:.2f}) represents an institutional-grade opportunity.{trigger_text}"
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
        "expected_trigger": expected_trigger,
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
