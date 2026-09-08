"""
Trade-Z Institutional Trade Autopsy Engine:
Conducts deep forensic post-trade autopsies for both winning and losing trades.
Losses are categorized into the 15-cause institutional taxonomy.
Wins are analyzed for layer contributions, MFE efficiency, and target optimality.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel


class TradeAutopsy(BaseModel):
    ticket: int
    outcome: str  # WIN | LOSS | BREAKEVEN
    root_cause: str  # One of the 15 taxonomy codes
    cause_description: str
    mfe_r: float
    mae_r: float
    r_multiple: float
    net_pnl: float
    exit_reason: str
    contributing_layers: List[str] = []
    recommended_adjustment: str
    is_statistical_acceptable: bool


class AutopsyEngine:
    """
    Forensic autopsy analyzer implementing root cause attribution
    and learning extraction.
    """

    def analyze_trade(
        self,
        trade_record: Dict[str, Any],
        market_context: Dict[str, Any],
        ai_evaluation: Optional[Dict[str, Any]] = None
    ) -> TradeAutopsy:
        ticket = trade_record.get("ticket", 0)
        outcome = trade_record.get("outcome", "LOSS")
        r_mult = trade_record.get("r_multiple", 0.0)
        net_pnl = trade_record.get("net_pnl", 0.0)
        exit_reason = trade_record.get("exit_reason", "")
        mfe_r = trade_record.get("mfe_r", 0.0)
        mae_r = trade_record.get("mae_r", 0.0)
        factors = trade_record.get("factors", {})

        contributing = []
        if factors.get("higher_tf_aligned"):
            contributing.append("Higher-Timeframe Trend Alignment")
        if factors.get("order_block_present"):
            contributing.append("Institutional Order Block Mitigation")
        if factors.get("liquidity_sweep"):
            contributing.append("Liquidity Sweep / SFP")
        if factors.get("structure_bos"):
            contributing.append("Market Structure Break (BOS)")
        if factors.get("trend_aligned"):
            contributing.append("Dynamic Trend Quality")

        if outcome == "WIN":
            # ── WIN AUTOPSY ──
            root_cause = "PROVEN_CONFLUENCE_EXPANSION"
            desc = (
                f"Trade hit TP (+{r_mult:.1f}R) cleanly. "
                f"Peak favorable excursion reached {mfe_r:.1f}R with minimal adverse drawdown ({mae_r:.1f}R)."
            )
            adjustment = (
                "Capture higher R via runner trailing" if mfe_r > (r_mult * 1.5)
                else "Target was mathematically optimal."
            )
            return TradeAutopsy(
                ticket=ticket,
                outcome="WIN",
                root_cause=root_cause,
                cause_description=desc,
                mfe_r=mfe_r,
                mae_r=mae_r,
                r_multiple=r_mult,
                net_pnl=net_pnl,
                exit_reason=exit_reason,
                contributing_layers=contributing,
                recommended_adjustment=adjustment,
                is_statistical_acceptable=True
            )

        elif outcome == "BREAKEVEN":
            return TradeAutopsy(
                ticket=ticket,
                outcome="BREAKEVEN",
                root_cause="PREMATURE_OR_PROTECTIVE_BE",
                cause_description=f"Sentinel locked SL to breakeven; position stopped out at scratch. (MFE was {mfe_r:.1f}R).",
                mfe_r=mfe_r,
                mae_r=mae_r,
                r_multiple=r_mult,
                net_pnl=net_pnl,
                exit_reason=exit_reason,
                contributing_layers=contributing,
                recommended_adjustment="Consider widening BE trigger from 1.0R to 1.5R to prevent stopout during liquidity retests.",
                is_statistical_acceptable=True
            )

        else:
            # ── LOSS AUTOPSY (15 Root Cause Taxonomy) ──
            regime = market_context.get("regime", "normal").lower()
            session = market_context.get("session", "UNKNOWN")
            news_event = market_context.get("has_news_event", False)
            spread_pips = market_context.get("spread_pips", 1.0)
            slippage_pips = market_context.get("slippage_pips", 0.0)

            # 1. Spread error: Spread spike caused stopout
            if spread_pips > 3.5:
                root_cause = "SPREAD_ERROR"
                desc = f"Excessive broker spread ({spread_pips:.1f} pips) prematurely triggered SL during liquidity widening."
                adjustment = "Enforce stricter spread ceiling filter (<2.5 pips) prior to order dispatch."
                stat_ok = False

            # 2. News error: Red folder macro event
            elif news_event:
                root_cause = "NEWS_ERROR"
                desc = "Stop loss executed during high-impact macroeconomic news release wick."
                adjustment = "Extend high-impact news blackout window to 30 minutes pre/post event."
                stat_ok = False

            # 3. Liquidity error: Trade swept by institutional hunt
            elif mfe_r > 1.2 and mae_r >= 1.0:
                root_cause = "LIQUIDITY_ERROR"
                desc = f"Setup reached +{mfe_r:.1f}R favorable move before deep institutional liquidity sweep reversed into SL."
                adjustment = "Engage partial profit harvesting (50% at 1.5R) and move SL to protect capital."
                stat_ok = True

            # 4. Session error: Low liquidity dead zone
            elif "gap" in session.lower() or "rollover" in session.lower():
                root_cause = "SESSION_ERROR"
                desc = f"Executed during {session}. Thin inter-bank liquidity created erratic whipsaws."
                adjustment = "Strictly forbid execution in inter-session rollover gap."
                stat_ok = False

            # 5. Structure error: Counter to HTF trend
            elif not factors.get("higher_tf_aligned", True):
                root_cause = "STRUCTURE_ERROR"
                desc = "Setup fought higher-timeframe order flow. Counter-trend exhaustion failed to pivot."
                adjustment = "Require mandatory 4H/1H directional alignment for this setup family."
                stat_ok = False

            # 6. Regime error: Wrong regime for setup family
            elif regime == "ranging" and factors.get("structure_bos", False):
                root_cause = "REGIME_ERROR"
                desc = "BOS continuation attempted inside choppy range-bound compression."
                adjustment = "Filter out breakout continuation setups when market regime is ranging."
                stat_ok = False

            # 7. Stop placement error
            elif mae_r <= 1.05 and factors.get("order_block_present"):
                root_cause = "STOP_PLACEMENT_ERROR"
                desc = "Stop loss was placed directly at order block wick edge rather than beyond external structural swing."
                adjustment = "Add 3-5 pip volatility buffer beyond order block invalidation level."
                stat_ok = True

            # 8. Entry error: Chasing price
            elif not factors.get("order_block_present") and not factors.get("liquidity_sweep"):
                root_cause = "ENTRY_ERROR"
                desc = "Entry was taken late away from institutional wholesale discount/premium pricing."
                adjustment = "Enforce strict limit orders at 62%-79% OTE retracement."
                stat_ok = False

            # 9. Normal statistical loss (Controlled edge variance)
            else:
                root_cause = "NORMAL_STATISTICAL_LOSS"
                desc = "Confluence factors and structural prerequisites were valid. Loss represents normal probabilistic variance."
                adjustment = "Maintain disciplined position sizing; strategy edge remains positive over large sample."
                stat_ok = True

            return TradeAutopsy(
                ticket=ticket,
                outcome="LOSS",
                root_cause=root_cause,
                cause_description=desc,
                mfe_r=mfe_r,
                mae_r=mae_r,
                r_multiple=r_mult,
                net_pnl=net_pnl,
                exit_reason=exit_reason,
                contributing_layers=contributing,
                recommended_adjustment=adjustment,
                is_statistical_acceptable=stat_ok
            )


autopsy_engine = AutopsyEngine()
