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
8. Strictly maintains candles_by_symbol mapping and distinguishes NO_SETUP_FOUND, DATA_ERROR, and ENGINE_ERROR.
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
    scan_diagnostics: Dict[str, Any] = Field(default_factory=dict)


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
        evaluates small-account eligibility, maintains candles_by_symbol, and ranks opportunities.
        """
        from datetime import datetime, timezone
        now_str = datetime.now(timezone.utc).isoformat()

        equity = float(account_equity or account_balance or 10000.0)
        leverage = float(account_leverage or 100.0)

        all_candidates: List[tuple[CandidateSetup, EligibilityResult]] = []
        candles_by_symbol: Dict[str, pd.DataFrame] = {}
        scan_diagnostics: Dict[str, Any] = {
            "SUCCESS": 0,
            "NO_SETUP_FOUND": 0,
            "DATA_ERROR": 0,
            "ENGINE_ERROR": 0,
            "NEWS_BLOCKED": 0,
            "symbol_errors": {}
        }

        # Concurrent scan across watchlist
        tasks = []
        for sym in watchlist:
            tasks.append(self._scan_single_symbol(sym, timeframe, api_key, equity, risk_percent, leverage))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results:
            if isinstance(res, dict):
                sym = res.get("symbol", "UNKNOWN")
                status = res.get("status", "ENGINE_ERROR")
                scan_diagnostics[status] = scan_diagnostics.get(status, 0) + 1

                if res.get("error"):
                    scan_diagnostics["symbol_errors"][sym] = res["error"]

                snapshot_df = res.get("snapshot_df")
                if snapshot_df is not None:
                    candles_by_symbol[sym] = snapshot_df

                candidates_list = res.get("candidates") or []
                all_candidates.extend(candidates_list)
            elif isinstance(res, tuple) and len(res) == 3:
                candidates_list, _, snapshot_df = res
                if isinstance(candidates_list, list):
                    all_candidates.extend(candidates_list if isinstance(candidates_list[0] if candidates_list else None, tuple) else [])
            elif isinstance(res, Exception):
                scan_diagnostics["ENGINE_ERROR"] = scan_diagnostics.get("ENGINE_ERROR", 0) + 1

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
            c.expected_value = emp.cost_adjusted_expectancy_r
            c.sample_size = emp.sample_size
            c.evidence_tier = str(emp.evidence_tier)

        # Executable-First Ranking:
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
            ev_val = c.expected_value if c.expected_value is not None else 0.0
            return eligibility_score + ((ev_val * 100.0) * regime_multiplier) + c.setup_quality_score

        sorted_candidates = sorted(viable_candidates, key=ranking_key, reverse=True)

        ranked_opps: List[RankedOpportunity] = []
        for rank_idx, (c, elig) in enumerate(sorted_candidates, start=1):
            ev_val = c.expected_value if c.expected_value is not None else 0.0
            is_actionable = elig.is_eligible and (c.expected_value is None or ev_val >= 0)

            ev_str = f"+{c.expected_value:.2f}R" if c.expected_value is not None else "UNKNOWN"
            if elig.is_eligible:
                notes = f"Rank #{rank_idx}: Top actionable setup on {c.symbol} ({c.setup_family}) with EV {ev_str} and {c.risk_reward:.1f} R:R."
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
                scan_diagnostics["symbol_errors"]["comparative_evaluator"] = str(eval_err)

        return WatchlistOpportunityReport(
            timestamp=now_str,
            watchlist_scanned=watchlist,
            total_candidates_found=len(all_candidates),
            ranked_opportunities=ranked_opps,
            top_selected_opportunity=top_selected,
            comparative_analysis=comparative_analysis_dict,
            account_summary=account_sum,
            scan_diagnostics=scan_diagnostics
        )

    async def _scan_single_symbol(
        self,
        symbol: str,
        timeframe: str,
        api_key: Optional[str],
        equity: float,
        risk_percent: float,
        leverage: float
    ) -> Dict[str, Any]:
        """
        Scans a single symbol and returns structured diagnostic record:
        {symbol, candidates, snapshot_df, status, error}
        Distinguishes SUCCESS, NO_SETUP_FOUND, DATA_ERROR, NEWS_BLOCKED, ENGINE_ERROR.
        """
        sym = symbol.upper().replace("/", "").replace(" ", "")
        try:
            news_safe = await check_news_filter(sym)
            if not news_safe:
                return {
                    "symbol": sym,
                    "candidates": [],
                    "snapshot_df": None,
                    "status": "NEWS_BLOCKED",
                    "error": "News filter active"
                }

            snapshot = await self.market_data_service.get_market_snapshot(
                symbol=sym,
                timeframe=timeframe,
                api_key=api_key or "default",
                news_safe=news_safe
            )

            if snapshot is None or not getattr(snapshot, "is_valid", True) or snapshot.df is None or len(snapshot.df) < 25:
                return {
                    "symbol": sym,
                    "candidates": [],
                    "snapshot_df": snapshot.df if snapshot is not None else None,
                    "status": "DATA_ERROR",
                    "error": "Market snapshot unavailable or insufficient bars (<25)"
                }

            snapshot_df = snapshot.df

            # Detect setups across 10 families
            candidates = detect_all_setup_families(
                symbol=sym,
                timeframe=timeframe,
                df=snapshot_df,
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

            status = "SUCCESS" if results else "NO_SETUP_FOUND"
            return {
                "symbol": sym,
                "candidates": results,
                "snapshot_df": snapshot_df,
                "status": status,
                "error": None
            }

        except Exception as e:
            return {
                "symbol": sym,
                "candidates": [],
                "snapshot_df": None,
                "status": "ENGINE_ERROR",
                "error": str(e)
            }


# Singleton instance
opportunity_engine = OpportunityEngine()
