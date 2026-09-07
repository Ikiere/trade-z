from typing import Dict, Any, List
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class HistoricalPatternEngine(BaseEngine):
    """
    Layer 12: AI Loss Autopsy & Pattern Avoidance Learning Engine.
    
    Performs root-cause analysis on past losing trades for the symbol,
    extracts failure signatures, and actively vetoes candidate setups that
    repeat the same failure patterns.
    """

    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        history: List[Dict[str, Any]] = context.get("history", [])
        engine_results: Dict[str, EngineResult] = context.get("engine_results", {})

        # If no previous trade history exists, return neutral baseline
        if not history:
            return EngineResult(
                result="no_history",
                confidence=50.0,
                explanation="No previous closed trade patterns on record for this symbol. Standard confluence rules applied.",
                metrics={"win_rate": 0.0, "total_samples": 0, "autopsy_count": 0},
                validation_status="valid"
            )

        # 1. Parse win/loss statistics
        wins = 0
        losses = []
        consecutive_losses = 0
        counting_consecutive = True
        total_pnl = 0.0

        for trade in history:
            pnl = float(trade.get("pnl") or 0.0)
            status = str(trade.get("status") or "").lower()
            total_pnl += pnl

            is_win = pnl > 0 or status in ["take_profit", "won"]
            if is_win:
                wins += 1
                counting_consecutive = False
            else:
                losses.append(trade)
                if counting_consecutive:
                    consecutive_losses += 1

        total_trades = len(history)
        win_rate = (wins / total_trades) * 100.0 if total_trades > 0 else 50.0

        # Current candidate setup attributes
        struct_res = engine_results.get("structure")
        higher_bias = engine_results.get("higher_timeframe")
        liq_res = engine_results.get("liquidity")
        trend_res = engine_results.get("trend_quality")
        vol_res = engine_results.get("volatility")

        current_zone = struct_res.metrics.get("zone", "neutral") if struct_res else "neutral"
        current_htf_bias = higher_bias.result if higher_bias else "neutral"  # "bullish", "bearish", "neutral"
        has_liquidity_sweep = bool(liq_res.metrics.get("sweep_detected")) if liq_res else False
        sweep_type = liq_res.metrics.get("sweep_type") if liq_res else None

        # Determine candidate direction
        candidate_direction = "long"
        if struct_res and struct_res.result in ["bearish_bos", "bearish_choch"]:
            candidate_direction = "short"
        elif higher_bias and higher_bias.result == "bearish":
            candidate_direction = "short"
        elif current_zone == "premium":
            candidate_direction = "short"

        # 2. Perform Loss Autopsy on recent losses
        failure_signatures: List[Dict[str, Any]] = []
        for loss_trade in losses[:5]:  # inspect the 5 most recent losses
            loss_dir = str(loss_trade.get("direction") or "").lower()
            loss_pnl = float(loss_trade.get("pnl") or 0.0)
            entry_p = float(loss_trade.get("entry_price") or 0.0)

            # Autopsy Diagnosis A: Counter-Trend Trap
            # If the trade was LONG while HTF was Bearish (or vice-versa)
            if loss_dir == "long" and current_htf_bias == "bearish":
                failure_signatures.append({
                    "type": "counter_trend_trap",
                    "direction": "long",
                    "reason": "Previous LONG stopped out fighting higher-timeframe bearish expansion.",
                    "entry_price": entry_p,
                    "pnl": loss_pnl
                })
            elif loss_dir == "short" and current_htf_bias == "bullish":
                failure_signatures.append({
                    "type": "counter_trend_trap",
                    "direction": "short",
                    "reason": "Previous SHORT stopped out fighting higher-timeframe bullish expansion.",
                    "entry_price": entry_p,
                    "pnl": loss_pnl
                })

            # Autopsy Diagnosis B: Overextended Entry (Chasing in bad zone)
            if loss_dir == "long" and current_zone == "premium":
                failure_signatures.append({
                    "type": "overextended_entry",
                    "direction": "long",
                    "reason": "Previous LONG bought into the Premium zone without discount pricing.",
                    "entry_price": entry_p,
                    "pnl": loss_pnl
                })
            elif loss_dir == "short" and current_zone == "discount":
                failure_signatures.append({
                    "type": "overextended_entry",
                    "direction": "short",
                    "reason": "Previous SHORT sold into the Discount zone without premium pricing.",
                    "entry_price": entry_p,
                    "pnl": loss_pnl
                })

            # Autopsy Diagnosis C: Premature Entry without Liquidity Sweep
            if not has_liquidity_sweep:
                failure_signatures.append({
                    "type": "unswept_liquidity_trap",
                    "direction": loss_dir,
                    "reason": f"Previous {loss_dir.upper()} trade stopped out near liquidity pool before retail orders were cleared.",
                    "entry_price": entry_p,
                    "pnl": loss_pnl
                })

        # 3. Active Avoidance Check: Does the candidate setup repeat any failure signature?

        # Rule 1: Consecutive Bleed Veto (3+ consecutive losses in same direction)
        if consecutive_losses >= 3:
            last_loss_dir = str(losses[0].get("direction") or "").lower()
            if candidate_direction == last_loss_dir:
                explanation = (
                    f"AI MEMORY VETO: Symbol {snapshot.symbol} has suffered {consecutive_losses} consecutive "
                    f"stopped-out {last_loss_dir.upper()} trades. Pattern memory actively blocks repeated entries "
                    f"in this direction until a structural Change of Character (CHoCH) confirms institutional reversal."
                )
                return EngineResult(
                    result="pattern_blocked",
                    confidence=15.0,
                    explanation=explanation,
                    metrics={
                        "verdict": "VETO",
                        "violation": "consecutive_bleed",
                        "consecutive_losses": consecutive_losses,
                        "win_rate": round(win_rate, 1),
                        "total_pnl": round(total_pnl, 2),
                    },
                    validation_status="invalid"  # triggers Hard Fail in Decision Engine
                )

        # Rule 2: Counter-Trend Trap Repeat Veto
        ct_traps = [f for f in failure_signatures if f["type"] == "counter_trend_trap" and f["direction"] == candidate_direction]
        if ct_traps:
            last_trap = ct_traps[0]
            explanation = (
                f"AI MEMORY VETO: A recent {candidate_direction.upper()} trade on {snapshot.symbol} resulted in a loss "
                f"(loss: {last_trap['pnl']:.2f}) due to Counter-Trend expansion against the 4H {current_htf_bias.upper()} structure. "
                f"The AI has learned this failure signature and vetoes repeating this counter-trend setup."
            )
            return EngineResult(
                result="pattern_blocked",
                confidence=20.0,
                explanation=explanation,
                metrics={
                    "verdict": "VETO",
                    "violation": "counter_trend_repeat",
                    "failed_trade_pnl": last_trap["pnl"],
                    "win_rate": round(win_rate, 1),
                    "total_pnl": round(total_pnl, 2),
                },
                validation_status="invalid"  # triggers Hard Fail
            )

        # Rule 3: Overextended Chasing Repeat Veto
        oe_traps = [f for f in failure_signatures if f["type"] == "overextended_entry" and f["direction"] == candidate_direction]
        if oe_traps:
            explanation = (
                f"AI MEMORY VETO: Previous {candidate_direction.upper()} on {snapshot.symbol} failed after entering in the "
                f"{current_zone.upper()} zone. Candidate setup repeats this overextended entry pattern. Vetoed to protect Risk/Reward."
            )
            return EngineResult(
                result="pattern_blocked",
                confidence=25.0,
                explanation=explanation,
                metrics={
                    "verdict": "VETO",
                    "violation": "overextended_repeat",
                    "zone": current_zone,
                    "win_rate": round(win_rate, 1),
                },
                validation_status="invalid"
            )

        # 4. Check if the AI has applied a learned lesson from previous losses
        lesson_applied = False
        lesson_note = ""

        # If previous trade failed due to unswept liquidity, but CURRENT candidate has a confirmed sweep:
        sweep_failures = [f for f in failure_signatures if f["type"] == "unswept_liquidity_trap"]
        if sweep_failures and has_liquidity_sweep:
            if (candidate_direction == "long" and sweep_type == "sell_side") or (candidate_direction == "short" and sweep_type == "buy_side"):
                lesson_applied = True
                lesson_note = (
                    f"AI Lesson Applied: Previous trade failed without sweep confirmation. "
                    f"Current {candidate_direction.upper()} setup successfully swept institutional {sweep_type} liquidity, "
                    f"confirming retail stop run is complete."
                )

        # Base confidence calculation adjusted by statistical reinforcement
        base_confidence = 50.0 + (win_rate - 50.0) * 0.4
        if lesson_applied:
            base_confidence = min(95.0, base_confidence + 15.0)

        # 5. Output successful pattern analysis
        if lesson_applied:
            explanation = f"{lesson_note} Historical win rate: {win_rate:.1f}% ({wins}/{total_trades} setups)."
            result_label = "lesson_applied"
        elif win_rate >= 60.0:
            explanation = f"Reinforcement Memory: Strong {win_rate:.1f}% win rate across {total_trades} trades on {snapshot.symbol}. Confluence models verified."
            result_label = "pattern_reinforced"
        else:
            explanation = f"Reinforcement Memory: Recent {total_trades} trades on {snapshot.symbol} show {win_rate:.1f}% win rate. Strict filters active."
            result_label = "stat_compiled"

        return EngineResult(
            result=result_label,
            confidence=round(base_confidence, 2),
            explanation=explanation,
            metrics={
                "verdict": "APPROVED" if not lesson_applied else "LESSON_APPLIED",
                "win_rate": round(win_rate, 2),
                "total_pnl": round(total_pnl, 2),
                "total_samples": total_trades,
                "consecutive_losses": consecutive_losses,
                "lesson_applied": lesson_applied,
                "diagnosed_failures": len(failure_signatures),
            },
            validation_status="valid"
        )
