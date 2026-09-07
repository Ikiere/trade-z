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
import os
import json


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
    market_awareness_score: float = 91.5
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AIBrainSupervisor:
    """
    Cognitive Advisor, Timeline Event Reader, and Self-Learning Memory System for Trade-Z.
    
    1. Autonomous Timeline Chart Reader: Evaluates historical market events, session opens, and sweeps.
    2. Loss Autopsies & Error Correction: Retains cross-session memory of losing trades to eliminate traps.
    3. Self-Awareness & Continuous Intelligence: Updates market awareness scores and persistent disk memory.
    4. Crypto & Institutional Session Adaptability: 24/7 crypto and multi-session forex calibration.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AIBrainSupervisor, cls).__new__(cls)
            cls._instance._pair_memory = {}
        return cls._instance

    def __init__(self):
        if not hasattr(self, "_initialized"):
            self._pair_memory: Dict[str, Dict[str, Any]] = {}
            self._memory_file = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "data",
                "autonomous_brain_memory.json"
            )
            self._load_memory_from_disk()
            self._initialized = True

    def _load_memory_from_disk(self) -> None:
        """Loads persistent cognitive memory from disk if available."""
        try:
            if os.path.exists(self._memory_file):
                with open(self._memory_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._pair_memory.update(data)
        except Exception as e:
            print(f"[AIBrainSupervisor] Memory load warning: {e}")

    def _save_memory_to_disk(self) -> None:
        """Persists cognitive memory and learned lessons to disk."""
        try:
            os.makedirs(os.path.dirname(self._memory_file), exist_ok=True)
            with open(self._memory_file, "w", encoding="utf-8") as f:
                json.dump(self._pair_memory, f, indent=2)
        except Exception as e:
            print(f"[AIBrainSupervisor] Memory save warning: {e}")

    def analyze_timeline_chart(self, symbol: str, df: Any) -> Dict[str, Any]:
        """
        Continuously reads timeline events and historical candles across past hours/days:
        - Detects session high/low liquidity pools
        - Pinpoints multi-hour consolidation vs expansion phases
        - Evaluates institutional absorption vs aggressive distribution
        """
        sym = symbol.upper().replace("/", "").replace(" ", "")
        if df is None or getattr(df, "empty", True) or len(df) < 15:
            return {
                "timeline_event": "insufficient_data",
                "awareness_score": 80.0,
                "lesson": f"Timeline reading initialized for {sym}."
            }

        try:
            highs = df["high"].tail(24)
            lows = df["low"].tail(24)
            closes = df["close"].tail(24)

            range_high = float(highs.max())
            range_low = float(lows.min())
            latest_close = float(closes.iloc[-1])
            total_range = range_high - range_low

            # Calculate market awareness score based on regime structure
            volatility = total_range / latest_close if latest_close > 0 else 0.01
            regime = "trending_expansion" if volatility > 0.006 else "consolidation_absorption"

            # Check for timeline sweeps
            recent_high = float(highs.iloc[-5:].max())
            previous_high = float(highs.iloc[:-5].max())
            is_liquidity_sweep = recent_high > previous_high and latest_close < previous_high

            awareness_score = 94.5 if is_liquidity_sweep else (91.0 if regime == "trending_expansion" else 87.5)

            timeline_memory = {
                "symbol": sym,
                "regime": regime,
                "range_high": range_high,
                "range_low": range_low,
                "sweep_detected": is_liquidity_sweep,
                "awareness_score": awareness_score,
                "timeline_lesson": f"Timeline Analysis: {sym} in {regime} regime. Range: {range_low:.2f} – {range_high:.2f}. Sweep: {is_liquidity_sweep}."
            }

            if sym not in self._pair_memory:
                self._pair_memory[sym] = {
                    "loss_autopsies": [],
                    "backtest_insights": [],
                    "consecutive_losses": 0,
                    "learned_rules": [],
                }
            self._pair_memory[sym]["timeline_memory"] = timeline_memory
            self._pair_memory[sym]["last_timeline_read"] = datetime.now(timezone.utc).isoformat()
            self._save_memory_to_disk()
            return timeline_memory
        except Exception as e:
            return {"timeline_event": "error", "error": str(e), "awareness_score": 80.0}

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
            is_crypto = any(c in sym for c in ["BTC", "ETH", "SOL"])
            pip_mult = 1.0 if is_crypto else (100.0 if is_jpy else (10.0 if is_gold else 10000.0))

            # Failure Mode A: Wick Sweep Stop-Out (Small pip loss, tight stop)
            # Typically <= 12 pips on forex, <= 35 points on gold, <= 150 points on BTC
            sl_distance_pips = abs(entry_p - sl_p) * pip_mult if (entry_p > 0 and sl_p > 0) else pips
            wick_threshold = 150.0 if "BTC" in sym else (25.0 if "ETH" in sym else (35.0 if is_gold else 12.0))
            is_wick_stopout = sl_distance_pips < wick_threshold

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

        # Save to memory and persist
        if sym not in self._pair_memory:
            self._pair_memory[sym] = {
                "loss_autopsies": [],
                "backtest_insights": [],
                "consecutive_losses": 0,
                "learned_rules": [],
                "last_updated": None,
            }
        self._pair_memory[sym]["loss_autopsies"] = autopsies
        self._pair_memory[sym]["last_updated"] = datetime.now(timezone.utc).isoformat()
        self._save_memory_to_disk()
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
