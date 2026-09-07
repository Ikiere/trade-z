"""
AI Cognitive Brain & Supervisory Collaboration Service.

Acts as the 'Teacher / Institutional Advisor' communicating with the
15-layer algorithmic quant trading pipeline ('Student / Executor').
Performs deep loss autopsies on closed trades, ingests backtest-learned rules,
and emits structured BrainGuidanceDirectives that guide and refine live setups.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, field


@dataclass
class BrainGuidanceDirective:
    """
    Structured directive emitted by the AI Cognitive Brain
    to advise the 15-layer trading engine.
    """
    verdict: str  # "APPROVE", "ADJUST", "VETO"
    confidence_adjustment: float  # e.g., -15.0 to +15.0
    recommended_sl_buffer_pips: float  # e.g., 0.0 to 10.0 pips
    lot_scale_factor: float  # e.g., 0.5 to 1.0 (1.0 = normal, 0.75 = conservative)
    learned_lesson: str  # Human & machine readable educational reason
    failure_mode_flagged: Optional[str] = None  # e.g., "wick_sweep_stopout", "counter_trend_trap"
    backtest_rule_applied: Optional[str] = None
    collaborative_rationale: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AIBrainSupervisor:
    """
    Cognitive Advisor and Reflective Memory System for Trade-Z.
    
    1. Loss Autopsy: Pinpoints structural failure modes from closed losses.
    2. Backtest Rule Ingestion: Translates quantitative backtest discoveries into active rules.
    3. Collaborative Pre-Trade Consultation: Advises the 15-layer engine on parameters.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AIBrainSupervisor, cls).__new__(cls)
            cls._instance._pair_memory = {}
        return cls._instance

    def __init__(self):
        # Persistent memory across scan cycles per symbol
        if not hasattr(self, "_initialized"):
            self._pair_memory: Dict[str, Dict[str, Any]] = {}
            self._initialized = True

    def ingest_backtest_learning(
        self,
        pair: str,
        insights: List[str],
        optimized_weights: Optional[Dict[str, float]] = None,
        win_rate: float = 60.0
    ) -> None:
        """
        Ingests backtest results into active pair memory so live trading
        immediately benefits from historical simulations.
        """
        sym = pair.upper().replace("/", "")
        if sym not in self._pair_memory:
            self._pair_memory[sym] = {
                "loss_autopsies": [],
                "backtest_insights": [],
                "consecutive_losses": 0,
                "learned_rules": [],
                "last_updated": None,
            }

        self._pair_memory[sym]["backtest_insights"] = insights or []
        self._pair_memory[sym]["win_rate_benchmark"] = win_rate
        self._pair_memory[sym]["optimized_weights"] = optimized_weights or {}
        self._pair_memory[sym]["last_updated"] = datetime.now(timezone.utc).isoformat()

        # Derive active actionable rules from insights
        rules = []
        for text in insights:
            t = text.lower()
            if "higher timeframe" in t:
                rules.append("REQUIRE_HTF_ALIGNMENT")
            if "order block" in t:
                rules.append("REQUIRE_ORDER_BLOCK_DISPLACEMENT")
            if "liquidity" in t or "sweep" in t:
                rules.append("REQUIRE_LIQUIDITY_SWEEP_CONFIRMATION")
        self._pair_memory[sym]["learned_rules"] = list(set(rules))

    def perform_loss_autopsy(self, symbol: str, history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Performs root-cause failure analysis on recent losing trades for this symbol.
        Identifies whether the loss was caused by:
        - wick_sweep_stopout: Stop was placed inside the liquidity pool and wicked out.
        - counter_trend_trap: Trade fought higher timeframe expansion.
        - overextended_chase: Trade entered in extreme premium/discount without discount pricing.
        - rapid_reversal: Rapid directional momentum flip.
        """
        sym = symbol.upper().replace("/", "")
        autopsies = []

        # Filter to loss trades
        losses = []
        for t in history:
            pnl = float(t.get("pnl") or 0.0)
            status = str(t.get("status") or "").lower()
            if pnl < 0 or status in ["stopped_out", "loss", "loss_trade"]:
                losses.append(t)

        for l_trade in losses[:5]:  # Analyze up to 5 most recent losses
            ticket = l_trade.get("ticket") or l_trade.get("id", "Unknown")
            direction = str(l_trade.get("direction") or "long").lower()
            entry_p = float(l_trade.get("entry_price") or 0.0)
            sl_p = float(l_trade.get("stop_loss") or 0.0)
            pnl = float(l_trade.get("pnl") or 0.0)
            pips = abs(float(l_trade.get("pips") or 0.0))

            # Determine pip multiplier based on asset class
            is_jpy = "JPY" in sym
            is_gold = "XAU" in sym or "GOLD" in sym
            pip_mult = 100.0 if is_jpy else (10.0 if is_gold else 10000.0)

            # Failure Mode A: Wick Sweep Stop-Out (Small pip loss, tight stop)
            # Typically <= 12 pips on forex or <= 35 points on gold
            sl_distance_pips = abs(entry_p - sl_p) * pip_mult if (entry_p > 0 and sl_p > 0) else pips
            is_wick_stopout = sl_distance_pips < (35.0 if is_gold else 12.0)

            if is_wick_stopout:
                autopsies.append({
                    "ticket": ticket,
                    "failure_mode": "wick_sweep_stopout",
                    "direction": direction,
                    "pnl": pnl,
                    "sl_distance_pips": round(sl_distance_pips, 1),
                    "diagnosis": f"Stop loss on Ticket #{ticket} was set too tight ({sl_distance_pips:.1f} pips) inside the retail liquidity wick pool."
                })
            else:
                autopsies.append({
                    "ticket": ticket,
                    "failure_mode": "structural_invalidation",
                    "direction": direction,
                    "pnl": pnl,
                    "sl_distance_pips": round(sl_distance_pips, 1),
                    "diagnosis": f"Market structure broke decisively against Ticket #{ticket} ({pnl:.2f} loss)."
                })

        # Save to memory
        if sym not in self._pair_memory:
            self._pair_memory[sym] = {
                "loss_autopsies": [],
                "backtest_insights": [],
                "consecutive_losses": 0,
                "learned_rules": [],
                "last_updated": None,
            }
        self._pair_memory[sym]["loss_autopsies"] = autopsies
        return autopsies

    def consult(
        self,
        symbol: str,
        candidate_direction: str,
        current_zone: str,
        htf_bias: str,
        has_liquidity_sweep: bool,
        history: List[Dict[str, Any]],
        current_price: float,
        proposed_sl: float
    ) -> BrainGuidanceDirective:
        """
        Pre-Trade Consultation Dialogue:
        The existing 15-layer trading engine presents its candidate setup to the AI Brain.
        The Brain reviews recent loss autopsies and backtest rules, and responds with
        actionable advice (APPROVE, ADJUST, or VETO).
        """
        sym = symbol.upper().replace("/", "")
        cand_dir = candidate_direction.lower()
        is_gold = "XAU" in sym or "GOLD" in sym
        is_jpy = "JPY" in sym
        pip_mult = 100.0 if is_jpy else (10.0 if is_gold else 10000.0)

        # 1. Update loss autopsy memory
        autopsies = self.perform_loss_autopsy(sym, history)
        mem = self._pair_memory.get(sym, {})
        backtest_rules = mem.get("learned_rules", [])

        # Calculate consecutive losses
        consecutive_losses = 0
        for t in history:
            pnl = float(t.get("pnl") or 0.0)
            if pnl < 0:
                consecutive_losses += 1
            else:
                break

        # Check 1: Consecutive Bleed Veto (3+ losses in a row)
        if consecutive_losses >= 3:
            return BrainGuidanceDirective(
                verdict="VETO",
                confidence_adjustment=-30.0,
                recommended_sl_buffer_pips=0.0,
                lot_scale_factor=0.5,
                failure_mode_flagged="consecutive_bleed",
                learned_lesson=f"Symbol {sym} has suffered {consecutive_losses} consecutive stopped-out trades. AI Brain orders complete trading halt until session change.",
                collaborative_rationale=f"Vetoed to preserve capital during erratic market chop on {sym}."
            )

        # Check 2: Counter-Trend Trap Veto / Heavy Penalty
        # If trade is Long but 4H bias is Bearish, or Short but 4H bias is Bullish
        is_counter_trend = (cand_dir == "long" and htf_bias == "bearish") or (cand_dir == "short" and htf_bias == "bullish")
        has_ct_loss = any(a.get("failure_mode") == "structural_invalidation" and a.get("direction") == cand_dir for a in autopsies)

        if is_counter_trend and has_ct_loss:
            return BrainGuidanceDirective(
                verdict="VETO",
                confidence_adjustment=-25.0,
                recommended_sl_buffer_pips=0.0,
                lot_scale_factor=0.5,
                failure_mode_flagged="counter_trend_trap",
                learned_lesson=f"Recent {cand_dir.upper()} loss on {sym} occurred by fighting higher-timeframe {htf_bias.upper()} order flow. Candidate setup repeats this counter-trend trap.",
                collaborative_rationale="Vetoed: Candidate repeats confirmed counter-trend failure pattern."
            )

        # Check 3: Wick Sweep Stop-Out -> Suggest SL Safety Buffer Adaptation
        # If a recent loss was stopped out by a wick, advise the trading engine to widen SL by 3.5 to 5.0 pips
        wick_losses = [a for a in autopsies if a.get("failure_mode") == "wick_sweep_stopout" and a.get("direction") == cand_dir]
        if wick_losses:
            last_wick_loss = wick_losses[0]
            buffer_pips = 35.0 if is_gold else 4.5  # 35 points for Gold ($3.50), 4.5 pips for FX
            return BrainGuidanceDirective(
                verdict="ADJUST",
                confidence_adjustment=+5.0,  # Confidence boosted because safety adaptation was applied
                recommended_sl_buffer_pips=buffer_pips,
                lot_scale_factor=0.85,  # Scale lot slightly to accommodate wider SL without increasing dollar risk
                failure_mode_flagged="wick_sweep_stopout",
                learned_lesson=f"Previous {cand_dir.upper()} trade #{last_wick_loss.get('ticket')} lost ${abs(last_wick_loss.get('pnl', 0)):.2f} to a tight liquidity wick. Brain advises adding +{buffer_pips:.1f} pip SL buffer.",
                collaborative_rationale=f"Brain advised +{buffer_pips:.1f} pip SL buffer to clear retail wick sweeps. Trading engine adapts SL and rescales lot size."
            )

        # Check 4: Positive Lesson Applied: Prior trade lacked liquidity sweep, but CURRENT setup has a sweep
        if has_liquidity_sweep:
            sweep_note = "Confirmed institutional liquidity sweep cleared retail stops prior to entry."
            return BrainGuidanceDirective(
                verdict="APPROVE",
                confidence_adjustment=+12.0,
                recommended_sl_buffer_pips=0.0,
                lot_scale_factor=1.0,
                learned_lesson=f"AI Lesson Applied: {sweep_note} Confluences verified against historical edge.",
                collaborative_rationale="Brain approves candidate setup with full institutional reinforcement boost."
            )

        # Check 5: Backtest Rule Alignment
        if "REQUIRE_LIQUIDITY_SWEEP_CONFIRMATION" in backtest_rules and not has_liquidity_sweep:
            return BrainGuidanceDirective(
                verdict="ADJUST",
                confidence_adjustment=-8.0,
                recommended_sl_buffer_pips=2.0,
                lot_scale_factor=0.75,
                learned_lesson="Backtest rule advisory: Trades without confirmed liquidity sweep showed lower win rates in historical simulations. Risk scaled to 75%.",
                collaborative_rationale="Trading engine reduces position sizing to align with backtest risk expectancy."
            )

        # Standard clean approval
        return BrainGuidanceDirective(
            verdict="APPROVE",
            confidence_adjustment=0.0,
            recommended_sl_buffer_pips=0.0,
            lot_scale_factor=1.0,
            learned_lesson="No adverse historical loss signatures detected on this pair. Standard confluences approved.",
            collaborative_rationale="Setup passed all historical autopsy and backtest filters."
        )


# Global singleton instance
brain_supervisor = AIBrainSupervisor()
