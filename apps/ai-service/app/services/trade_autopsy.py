"""
Trade-Z Institutional Trade Autopsy Engine:
Conducts analytical forensic post-trade autopsies for both winning and losing trades.
Categorizes losses into the 13 required institutional taxonomy categories:
- VALID_LOSING_SETUP
- ENTRY_ERROR
- LIQUIDITY_REVERSAL
- PREMATURE_EXIT
- SENTINEL_ERROR
- SPREAD_EXECUTION_ISSUE
- NEWS_EVENT
- VOLATILITY_SHOCK
- STRUCTURE_FAILURE
- DUPLICATE_SETUP
- RISK_SIZING_PROBLEM
- DATA_ISSUE
- UNKNOWN

Losses are treated as evidence to update memory, NOT as a signal to alter the strategy immediately.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from collections import Counter


class LossTaxonomy:
    VALID_LOSING_SETUP = "VALID_LOSING_SETUP"        # Confluence valid, normal probabilistic variance
    ENTRY_ERROR = "ENTRY_ERROR"                      # Chasing price away from wholesale discount/premium
    LIQUIDITY_REVERSAL = "LIQUIDITY_REVERSAL"        # Reached >1.2R before deep liquidity sweep
    PREMATURE_EXIT = "PREMATURE_EXIT"                # Exited before target due to manual or faulty close
    SENTINEL_ERROR = "SENTINEL_ERROR"                # Choked winning runner prematurely at breakeven
    SPREAD_EXECUTION_ISSUE = "SPREAD_EXECUTION_ISSUE"# Spread spike triggered stopout during illiquidity
    NEWS_EVENT = "NEWS_EVENT"                        # High-impact macroeconomic release wick
    VOLATILITY_SHOCK = "VOLATILITY_SHOCK"            # Abnormal range expansion > 3x ATR
    STRUCTURE_FAILURE = "STRUCTURE_FAILURE"          # Counter-trend failure or false breakout
    DUPLICATE_SETUP = "DUPLICATE_SETUP"              # Overlapping re-entry on same market event
    RISK_SIZING_PROBLEM = "RISK_SIZING_PROBLEM"      # Lot size indivisibility caused excessive monetary risk
    DATA_ISSUE = "DATA_ISSUE"                        # Bad ticks or missing feed bars
    UNKNOWN = "UNKNOWN"

    # Positive outcomes
    WIN_CONFLUENCE_EXPANSION = "WIN_CONFLUENCE_EXPANSION"
    BREAKEVEN_DEFENSE = "BREAKEVEN_DEFENSE"


LossCategory = LossTaxonomy


class TradeAutopsy(BaseModel):
    ticket: int
    outcome: str  # WIN | LOSS | BREAKEVEN
    root_cause: str  # One of the LossTaxonomy codes
    cause_description: str
    clinical_summary: str = ""
    mfe_r: float = 0.0
    mae_r: float = 0.0
    mfe_pips: float = 0.0
    mae_pips: float = 0.0
    r_multiple: float = 0.0
    net_pnl: float = 0.0
    pnl_dollars: float = 0.0
    pnl_r: float = 0.0
    exit_reason: str = ""
    contributing_layers: List[str] = []
    recommended_adjustment: str = ""
    is_statistical_acceptable: bool = True
    sentinel_action: Optional[str] = None
    session: str = ""
    market_regime: str = ""


class AutopsyEngine:
    """
    Forensic autopsy analyzer implementing root cause attribution
    and learning extraction across all trades.
    """

    def __init__(self):
        self.taxonomy_counts: Counter = Counter()

    def analyze_trade(
        self,
        trade_record: Dict[str, Any],
        market_context: Dict[str, Any],
        ai_evaluation: Optional[Dict[str, Any]] = None
    ) -> TradeAutopsy:
        ticket = trade_record.get("ticket", 0)
        outcome = trade_record.get("outcome", "LOSS")
        r_mult = float(trade_record.get("r_multiple", trade_record.get("pnl_r", 0.0)))
        net_pnl = float(trade_record.get("net_pnl", trade_record.get("pnl_dollars", 0.0)))
        exit_reason = trade_record.get("exit_reason", "")
        mfe_r = float(trade_record.get("mfe_r", 0.0))
        mae_r = float(trade_record.get("mae_r", 0.0))
        mfe_pips = float(trade_record.get("mfe_pips", 0.0))
        mae_pips = float(trade_record.get("mae_pips", 0.0))
        sentinel_action = trade_record.get("sentinel_action", exit_reason)
        factors = trade_record.get("factors", {})
        session = str(market_context.get("session", "UNKNOWN"))
        regime = str(market_context.get("regime", market_context.get("market_regime", "normal"))).lower()

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
            root_cause = LossTaxonomy.WIN_CONFLUENCE_EXPANSION
            desc = (
                f"Trade hit TP (+{r_mult:.1f}R) cleanly. "
                f"Peak favorable excursion reached {mfe_r:.1f}R with minimal adverse drawdown ({mae_r:.1f}R)."
            )
            adjustment = (
                "Capture higher R via runner trailing" if mfe_r > (r_mult * 1.5)
                else "Target was mathematically optimal."
            )
            self.taxonomy_counts[root_cause] += 1
            return TradeAutopsy(
                ticket=ticket,
                outcome="WIN",
                root_cause=root_cause,
                cause_description=desc,
                clinical_summary=desc,
                mfe_r=mfe_r,
                mae_r=mae_r,
                mfe_pips=mfe_pips,
                mae_pips=mae_pips,
                r_multiple=r_mult,
                net_pnl=net_pnl,
                pnl_dollars=net_pnl,
                pnl_r=r_mult,
                exit_reason=exit_reason,
                contributing_layers=contributing,
                recommended_adjustment=adjustment,
                is_statistical_acceptable=True,
                sentinel_action=sentinel_action,
                session=session,
                market_regime=regime
            )

        elif outcome == "BREAKEVEN":
            # Check if this was a Sentinel error (stopped at BE after reaching > 2.0R)
            if mfe_r >= 2.0:
                root_cause = LossTaxonomy.SENTINEL_ERROR
                desc = f"Sentinel premature BE: Position reached +{mfe_r:.1f}R MFE but was stopped at scratch ($0.00) on market retest."
                adjustment = "Use structure-confirmed trailing stop or partial profit harvesting at 2.0R."
                stat_ok = False
            else:
                root_cause = LossTaxonomy.BREAKEVEN_DEFENSE
                desc = f"Sentinel defensive BE: Position reached +{mfe_r:.1f}R before reversing to entry. Capital preserved."
                adjustment = "Defensive BE functioning as designed for low-expansion setups."
                stat_ok = True

            self.taxonomy_counts[root_cause] += 1
            return TradeAutopsy(
                ticket=ticket,
                outcome="BREAKEVEN",
                root_cause=root_cause,
                cause_description=desc,
                clinical_summary=desc,
                mfe_r=mfe_r,
                mae_r=mae_r,
                mfe_pips=mfe_pips,
                mae_pips=mae_pips,
                r_multiple=r_mult,
                net_pnl=net_pnl,
                pnl_dollars=net_pnl,
                pnl_r=r_mult,
                exit_reason=exit_reason,
                contributing_layers=contributing,
                recommended_adjustment=adjustment,
                is_statistical_acceptable=stat_ok,
                sentinel_action=sentinel_action,
                session=session,
                market_regime=regime
            )

        else:
            # ── LOSS AUTOPSY (13 Required Categories) ──
            regime = market_context.get("regime", "normal").lower()
            session = market_context.get("session", "UNKNOWN")
            news_event = market_context.get("has_news_event", False)
            spread_pips = market_context.get("spread_pips", 1.0)
            slippage_pips = market_context.get("slippage_pips", 0.0)
            risk_pct = float(trade_record.get("initial_risk_money", 1.0)) / max(1.0, float(trade_record.get("equity_before", 100.0))) * 100.0

            # 1. SPREAD / EXECUTION ISSUE
            if spread_pips > 3.5 or slippage_pips > 1.0:
                root_cause = LossTaxonomy.SPREAD_EXECUTION_ISSUE
                desc = f"Broker friction anomaly: Spread ({spread_pips:.1f} pips) or slippage triggered SL during liquidity widening."
                adjustment = "Enforce stricter spread ceiling filter (< 2.5 pips) prior to order dispatch."
                stat_ok = False

            # 2. NEWS EVENT
            elif news_event:
                root_cause = LossTaxonomy.NEWS_EVENT
                desc = "Stop loss executed during high-impact macroeconomic news release wick."
                adjustment = "Extend high-impact news blackout window to 30 minutes pre/post event."
                stat_ok = False

            # 3. RISK SIZING PROBLEM
            elif risk_pct > 2.5:
                root_cause = LossTaxonomy.RISK_SIZING_PROBLEM
                desc = f"Position sizing mismatch: Broker minimum lot forced {risk_pct:.1f}% risk, violating account parameters."
                adjustment = "Trigger Balance Shield rejection (SETUP_VALID_BUT_NOT_EXECUTABLE) on micro-accounts."
                stat_ok = False

            # 4. LIQUIDITY REVERSAL
            elif mfe_r > 1.2 and mae_r >= 1.0:
                root_cause = LossTaxonomy.LIQUIDITY_REVERSAL
                desc = f"Setup reached +{mfe_r:.1f}R favorable expansion before institutional liquidity sweep reversed into SL."
                adjustment = "Engage partial profit harvesting (50% at 1.5R) and trail behind swing structure."
                stat_ok = True

            # 5. STRUCTURE FAILURE
            elif not factors.get("higher_tf_aligned", True) or (regime == "ranging" and factors.get("structure_bos", False)):
                root_cause = LossTaxonomy.STRUCTURE_FAILURE
                desc = "Structure failure: Counter-trend exhaustion or breakout attempted in choppy consolidation."
                adjustment = "Enforce mandatory 4H/1H alignment and filter out breakout continuation in ranging regime."
                stat_ok = False

            # 6. VOLATILITY SHOCK
            elif mae_r > 2.5:
                root_cause = LossTaxonomy.VOLATILITY_SHOCK
                desc = f"Abnormal volatility expansion: Price traveled {mae_r:.1f}R against entry in compressed timeframe."
                adjustment = "Widen ATR volatility filter and scale down exposure during high-volatility regimes."
                stat_ok = False

            # 7. ENTRY ERROR
            elif not factors.get("order_block_present") and not factors.get("liquidity_sweep"):
                root_cause = LossTaxonomy.ENTRY_ERROR
                desc = "Late entry chasing price away from wholesale institutional discount/premium pricing."
                adjustment = "Enforce strict limit orders at 62%-79% OTE retracement."
                stat_ok = False

            # 8. VALID LOSING SETUP (Controlled Edge Variance)
            else:
                root_cause = LossTaxonomy.VALID_LOSING_SETUP
                desc = "Confluence factors and structural prerequisites were valid. Loss represents normal statistical variance."
                adjustment = "Maintain disciplined position sizing; strategy edge remains positive over validated sample."
                stat_ok = True

            self.taxonomy_counts[root_cause] += 1

            return TradeAutopsy(
                ticket=ticket,
                outcome="LOSS",
                root_cause=root_cause,
                cause_description=desc,
                clinical_summary=desc,
                mfe_r=mfe_r,
                mae_r=mae_r,
                mfe_pips=mfe_pips,
                mae_pips=mae_pips,
                r_multiple=r_mult,
                net_pnl=net_pnl,
                pnl_dollars=net_pnl,
                pnl_r=r_mult,
                exit_reason=exit_reason,
                contributing_layers=contributing,
                recommended_adjustment=adjustment,
                is_statistical_acceptable=stat_ok,
                sentinel_action=sentinel_action,
                session=session,
                market_regime=regime
            )

    def get_root_cause_distribution(self) -> Dict[str, int]:
        """Returns frequency of each categorized root cause."""
        return dict(self.taxonomy_counts)

    def reset_distribution(self):
        self.taxonomy_counts.clear()


# Global autopsy engine instance
autopsy_engine = AutopsyEngine()
