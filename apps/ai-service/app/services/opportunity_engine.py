"""
Watchlist Trade Opportunity Engine:
At every scan:
1. Analyzes every instrument on the user's watchlist concurrently.
2. Generates all valid candidate setups across the 10 SMC setup families.
3. Scores each candidate (Setup Quality 0-100, Expected Value in R, R:R).
4. Filters out candidates violating hard strategy rules.
5. Evaluates account-level instrument eligibility (Small Account Multi-Asset Failover).
6. Ranks all candidates from highest to lowest expected value.
7. Passes top candidates to the AI Comparative Evaluator.
"""

import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import pandas as pd

from app.services.market_data import MarketDataService, MarketSnapshot
from app.services.setup_families import detect_all_setup_families, CandidateSetup
from app.services.asset_eligibility import evaluate_instrument_eligibility, EligibilityResult
from app.services.calendar import check_news_filter
from app.services.adaptive_regime_matrix import adaptive_regime_matrix
from app.services.reviewers.comparative_evaluator import AIComparativeEvaluator
from app.services.market_context_resolver import MarketContextResolver, MarketContext


class RankedOpportunity(BaseModel):
    rank: int
    candidate: CandidateSetup
    eligibility: EligibilityResult
    is_actionable: bool
    selection_notes: str


class WatchlistOpportunityReport(BaseModel):
    timestamp: str
    watchlist_scanned: List[str]
    total_candidates_found: int
    ranked_opportunities: List[RankedOpportunity]
    top_selected_opportunity: Optional[RankedOpportunity] = None
    comparative_analysis: Optional[Dict[str, Any]] = None
    account_summary: Dict[str, Any] = Field(default_factory=dict)


class OpportunityEngine:
    """
    Continuous Multi-Asset Opportunity Scanner & Ranker.
    """

    def __init__(self, market_data_service: Optional[MarketDataService] = None):
        self.market_data_service = market_data_service or MarketDataService()

    async def scan_watchlist(
        self,
        watchlist: List[str],
        timeframe: str = "15m",
        api_key: Optional[str] = None,
        account_balance: Optional[float] = None,
        account_equity: Optional[float] = None,
        account_leverage: Optional[float] = None,
        risk_percent: float = 1.0
    ) -> WatchlistOpportunityReport:
        """
        Scans all instruments in the watchlist, generates setups across 10 SMC families,
        evaluates small-account eligibility, and ranks opportunities.
        """
        from datetime import datetime, timezone
        now_str = datetime.now(timezone.utc).isoformat()

        equity = float(account_equity or account_balance or 10000.0)
        leverage = float(account_leverage or 100.0)

        all_candidates: List[tuple[CandidateSetup, EligibilityResult]] = []

        # Concurrent scan across watchlist
        tasks = []
        for sym in watchlist:
            tasks.append(self._scan_single_symbol(sym, timeframe, api_key, equity, risk_percent, leverage))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results:
            if isinstance(res, list):
                all_candidates.extend(res)

        # Filter candidates: remove those with quality < 70 or R:R < 1.8
        viable_candidates = [
            (c, elig) for c, elig in all_candidates
            if c.setup_quality_score >= 70.0 and c.risk_reward >= 1.8
        ]

        from app.services.empirical_expectancy import empirical_expectancy_engine
        from app.services.broker_profiles import get_broker_profile
        broker = get_broker_profile("exness")

        # Calculate authoritative empirical Expected Value in R for each viable candidate
        for c, elig in viable_candidates:
            spec = broker.get_symbol_spec(c.symbol)
            sl_dist = abs(c.entry_price - c.stop_loss)
            spread_pts = spec.typical_spread_pips / max(1.0, spec.pip_multiplier)
            spread_cost_r = spread_pts / max(0.00001, sl_dist)

            sym_df = candles_by_symbol.get(c.symbol)
            ctx = MarketContextResolver.resolve(sym_df) if sym_df is not None else MarketContext()

            emp = empirical_expectancy_engine.calculate_expectancy(
                symbol=c.symbol,
                setup_family=c.setup_family,
                session=ctx.session,
                regime=ctx.regime,
                spread_cost_r=spread_cost_r
            )
            c.expected_value = emp.empirical_ev_r
            c.sample_size = emp.sample_size
            c.evidence_tier = str(emp.evidence_tier)

        # Rank candidates:
        # 1st tier: Eligible for current account balance + highest Expected Value * regime score multiplier
        # 2nd tier: Ineligible for current balance (e.g. Gold on $20 account), ranked by EV
        def ranking_key(item: tuple[CandidateSetup, EligibilityResult]):
            c, elig = item
            sym_df = candles_by_symbol.get(c.symbol)
            ctx = MarketContextResolver.resolve(sym_df) if sym_df is not None else MarketContext()
            regime_info = adaptive_regime_matrix.get_setup_expectancy(
                symbol=c.symbol,
                session=ctx.session,
                setup_family=c.setup_family,
                volatility_regime=ctx.volatility_regime
            )
            regime_multiplier = regime_info.get("score_multiplier", 1.0)
            eligibility_score = 1000.0 if elig.is_eligible else 0.0
            return eligibility_score + ((c.expected_value * 100.0) * regime_multiplier) + c.setup_quality_score

        sorted_candidates = sorted(viable_candidates, key=ranking_key, reverse=True)

        ranked_opps: List[RankedOpportunity] = []
        for rank_idx, (c, elig) in enumerate(sorted_candidates, start=1):
            is_actionable = elig.is_eligible and c.expected_value > 0

            if elig.is_eligible:
                notes = f"Rank #{rank_idx}: Top actionable setup on {c.symbol} ({c.setup_family}) with EV +{c.expected_value:.2f}R and {c.risk_reward:.1f} R:R."
            else:
                notes = f"Rank #{rank_idx}: High-conviction setup ({c.setup_family}) on {c.symbol}, but requires larger equity to trade safely at broker 0.01 min lot. Sizing deferred to eligible assets."

            ranked_opps.append(RankedOpportunity(
                rank=rank_idx,
                candidate=c,
                eligibility=elig,
                is_actionable=is_actionable,
                selection_notes=notes
            ))

        # Top selected actionable opportunity
        top_selected = next((o for o in ranked_opps if o.is_actionable), None)

        account_sum = {
            "equity": equity,
            "risk_percent": risk_percent,
            "risk_budget": round(equity * (risk_percent / 100.0), 2),
            "leverage": leverage
        }

        # AI Comparative Evaluator on top candidates (up to 3)
        comparative_analysis_dict: Optional[Dict[str, Any]] = None
        if viable_candidates:
            top_candidate_objs = [c for c, _ in sorted_candidates[:3]]
            evaluator = AIComparativeEvaluator()
            try:
                comp_result = await evaluator.evaluate_candidates(
                    candidates=top_candidate_objs,
                    account_summary=account_sum
                )
                comparative_analysis_dict = comp_result.model_dump()
            except Exception as eval_err:
                print(f"[OpportunityEngine] Comparative evaluation warning: {eval_err}")

        return WatchlistOpportunityReport(
            timestamp=now_str,
            watchlist_scanned=watchlist,
            total_candidates_found=len(all_candidates),
            ranked_opportunities=ranked_opps,
            top_selected_opportunity=top_selected,
            comparative_analysis=comparative_analysis_dict,
            account_summary=account_sum
        )

    async def _scan_single_symbol(
        self,
        symbol: str,
        timeframe: str,
        api_key: Optional[str],
        equity: float,
        risk_percent: float,
        leverage: float
    ) -> List[tuple[CandidateSetup, EligibilityResult]]:
        """
        Scans a single symbol and returns all candidate setups paired with their eligibility.
        """
        sym = symbol.upper().replace("/", "").replace(" ", "")
        try:
            news_safe = await check_news_filter(sym)
            if not news_safe:
                return []

            snapshot = await self.market_data_service.get_market_snapshot(
                symbol=sym,
                timeframe=timeframe,
                api_key=api_key or "default",
                news_safe=news_safe
            )

            if snapshot is None or not getattr(snapshot, "is_valid", True) or snapshot.df is None or len(snapshot.df) < 25:
                return []

            # Detect setups across 10 families
            candidates = detect_all_setup_families(
                symbol=sym,
                timeframe=timeframe,
                df=snapshot.df,
                higher_df=snapshot.higher_df
            )

            from app.services.broker_profiles import get_broker_profile
            broker = get_broker_profile("exness")
            spec = broker.get_symbol_spec(sym)

            results: List[tuple[CandidateSetup, EligibilityResult]] = []
            for c in candidates:
                sl_dist = abs(c.entry_price - c.stop_loss)
                elig = evaluate_instrument_eligibility(
                    symbol=sym,
                    equity=equity,
                    stop_distance_points=sl_dist,
                    risk_percent=risk_percent,
                    broker_min_volume=spec.min_volume,
                    broker_vol_step=spec.vol_step,
                    broker_tick_value=spec.tick_value,
                    broker_tick_size=spec.tick_size,
                    leverage=leverage,
                    strict_risk_enforcement=True
                )
                results.append((c, elig))

            return results

        except Exception as e:
            print(f"[OpportunityEngine] Non-fatal scan error on {sym}: {e}")
            return []
