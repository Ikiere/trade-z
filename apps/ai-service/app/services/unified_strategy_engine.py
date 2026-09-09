"""
Trade-Z Authoritative Unified Strategy Intelligence Engine:
Provides ONE single source of truth for trade generation, evaluation, risk sizing,
and execution across all operating modes: BACKTEST, PAPER, and LIVE.

Implements the Canonical 20-Step Executable-First + Edge-First Candidate Pipeline:
1. Detect candidate across 10 SMC setup families
2. Validate causal market data (zero lookahead)
3. Validate structure (BOS, CHoCH, OB, FVG, sweep)
4. Validate quality (score >= 70)
5. Validate R:R (>= 1.8)
6. Validate session (Gold Asia rule: Asia permits only Liquidity Sweep Reversal)
7. Validate kill zone (block low-liquidity dead zones)
8. Validate news (historical news window check)
9. Validate broker symbol/spec
10. Validate account risk
11. Validate minimum lot
12. Validate margin
13. Calculate candidate's actual execution risk dollars
14. Calculate empirical edge using point-in-time memory (as_of_timestamp)
15. Apply EdgePolicy (DISCOVERY vs STRICT vs LIVE)
16. Remove candidates that are prohibited (NEGATIVE_EDGE never bypassed)
17. Apply discovery exposure controls if UNKNOWN_EDGE
18. ONLY THEN rank remaining executable candidates
19. Select the highest-ranked executable candidate
20. Execute
"""

from enum import Enum
from typing import List, Dict, Any, Optional, Set, Tuple, Union
from pydantic import BaseModel, Field
import pandas as pd
import numpy as np

from app.services.setup_families import detect_all_setup_families, CandidateSetup
from app.services.empirical_expectancy import (
    empirical_expectancy_engine,
    EmpiricalExpectancyResult,
    SampleEvidenceTier
)
from app.services.edge_policy import (
    EdgeState,
    BacktestEdgeMode,
    RejectionReasonCode,
    DiscoveryExposureBudget,
    LiveDiscoveryProhibitedError,
    validate_live_safety,
    assert_point_in_time_data,
    calculate_currency_exposure,
    parse_to_utc_timestamp
)
from app.services.duplicate_detector import duplicate_detector
from app.services.asset_eligibility import evaluate_instrument_eligibility, EligibilityResult
from app.services.portfolio_risk import portfolio_risk_engine, PortfolioPosition
from app.services.broker_profiles import get_broker_profile, BrokerProfile, SymbolSpec
from app.services.reviewers.comparative_evaluator import comparative_evaluator, ComparativeAnalysisResult
from app.services.market_context_resolver import MarketContextResolver, MarketContext


class ExecutionMode(str, Enum):
    BACKTEST = "BACKTEST"
    PAPER = "PAPER"
    LIVE = "LIVE"


class DecisionAction(str, Enum):
    TRADE = "TRADE"
    WAIT = "WAIT"
    NO_TRADE = "NO_TRADE"


class TradingDecision(BaseModel):
    decision_id: str
    action: DecisionAction
    execution_mode: ExecutionMode
    symbol: str
    direction: str  # BUY | SELL | neutral
    order_type: str  # limit | market | none
    entry_price: float
    stop_loss: float
    take_profit: float
    recommended_lot: float
    dollar_risk: float
    actual_risk_dollars: float = 0.0
    required_margin: float = 0.0
    risk_reward: float
    expected_value_r: Optional[float] = None
    setup_quality_score: float
    setup_family: str
    evidence_tier: str
    sample_size: int
    is_eligible: bool
    ineligibility_reason: Optional[str] = None
    reason_codes: List[str] = Field(default_factory=list)
    rejection_reason_code: Optional[str] = None
    risk_flags: List[str] = Field(default_factory=list)
    institutional_audit: Dict[str, Any] = Field(default_factory=dict)
    candidate: Optional[CandidateSetup] = None
    eligibility: Optional[EligibilityResult] = None
    timestamp: str = ""
    decision_timestamp: str = ""
    market_context_version: str = "2.2.0"
    session: str = "LONDON"
    regime: str = "trending"
    volatility_regime: str = "NORMAL"
    htf_context: str = "NEUTRAL"
    edge_state: Optional[str] = None
    edge_policy: Optional[str] = None
    discovery_trade: bool = False
    empirical_sample_size: int = 0
    empirical_gate_bypassed: bool = False
    bypass_reason: Optional[str] = None
    intrabar_resolution_method: str = "OHLC_UNAMBIGUOUS"


class UnifiedStrategyEngine:
    """
    Authoritative Intelligence Layer.
    Guarantees deterministic, causal execution across Backtest, Paper, and Live execution.
    """

    def __init__(self, default_broker: str = "exness"):
        self.default_broker = default_broker

    def evaluate(
        self,
        symbol: str,
        timeframe: str,
        df: pd.DataFrame,
        higher_df: Optional[pd.DataFrame] = None,
        account_balance: float = 1000.0,
        account_equity: Optional[float] = None,
        account_leverage: float = 2000.0,
        risk_percent: float = 1.0,
        current_positions: Optional[List[Dict[str, Any]]] = None,
        current_bar_index: int = 0,
        broker_name: Optional[str] = None,
        mode: ExecutionMode = ExecutionMode.LIVE,
        edge_mode: Optional[BacktestEdgeMode] = None,
        bootstrap_unknown_edge: bool = False,
        discovery_budget: Optional[DiscoveryExposureBudget] = None,
        as_of_timestamp: Optional[str] = None,
        enable_ai_advisory: bool = True,
        min_quality_score: float = 70.0,
        min_risk_reward: float = 1.8,
        min_expectancy_r: float = 0.20,
        news_windows: Optional[List[Dict[str, Any]]] = None,
        is_cent_account: bool = False
    ) -> TradingDecision:
        """
        Executes the Canonical 20-Step Executable-First + Edge-First Candidate Pipeline.
        """
        clean_sym = symbol.upper().replace("/", "").replace(" ", "")
        equity = float(account_equity if account_equity is not None else account_balance)
        broker = get_broker_profile(broker_name or self.default_broker)
        spec = broker.get_symbol_spec(clean_sym)
        positions = current_positions or []

        # Multi-layer LIVE safety gate
        effective_edge_mode = edge_mode
        if effective_edge_mode is None:
            if mode == ExecutionMode.BACKTEST:
                effective_edge_mode = BacktestEdgeMode.DISCOVERY if bootstrap_unknown_edge else BacktestEdgeMode.STRICT
            elif mode == ExecutionMode.PAPER:
                effective_edge_mode = BacktestEdgeMode.PAPER
            else:
                effective_edge_mode = BacktestEdgeMode.LIVE

        if mode == ExecutionMode.LIVE or "LIVE" in str(mode).upper():
            if effective_edge_mode == BacktestEdgeMode.DISCOVERY or bootstrap_unknown_edge:
                raise LiveDiscoveryProhibitedError(
                    "LIVE_DISCOVERY_PROHIBITED: LIVE execution cannot enable DISCOVERY mode or bootstrap_unknown_edge. Production safety violation."
                )
        validate_live_safety(effective_edge_mode, bootstrap_unknown_edge)

        # 1. Market Data Integrity Pre-Flight
        if df is None or len(df) < 15:
            return TradingDecision(
                decision_id=f"DEC-{clean_sym}-NO_DATA",
                action=DecisionAction.NO_TRADE,
                execution_mode=mode,
                symbol=clean_sym,
                direction="neutral",
                order_type="none",
                entry_price=0.0,
                stop_loss=0.0,
                take_profit=0.0,
                recommended_lot=0.0,
                dollar_risk=0.0,
                risk_reward=0.0,
                expected_value_r=None,
                setup_quality_score=0.0,
                setup_family="None",
                evidence_tier="INSUFFICIENT",
                sample_size=0,
                is_eligible=False,
                ineligibility_reason="INSUFFICIENT_CANDLE_DATA",
                reason_codes=["DATA_INTEGRITY_INSUFFICIENT_BARS"],
                rejection_reason_code=RejectionReasonCode.DATA_INVALID.value
            )

        # Slice causal dataframe strictly to current_bar_index
        if current_bar_index is not None and 0 < current_bar_index < len(df) - 1:
            effective_df = df.iloc[:current_bar_index + 1].copy().reset_index(drop=True)
        else:
            effective_df = df

        last_bar = effective_df.iloc[-1]
        last_bar_ts = str(last_bar.get("time", last_bar.get("timestamp", as_of_timestamp or "")))

        # 2. Point-in-Time Causality Enforcement
        if as_of_timestamp and last_bar_ts:
            assert_point_in_time_data(last_bar_ts, as_of_timestamp, context_label=f"evaluating {clean_sym}")

        dec_ts = as_of_timestamp or last_bar_ts or "UNKNOWN_TIME"

        # Deterministic Market Context Resolution
        market_ctx = MarketContextResolver.resolve(effective_df, htf_df=higher_df)

        # 3. Detect SMC Candidates across 10 families
        candidates = detect_all_setup_families(
            symbol=clean_sym,
            timeframe=timeframe,
            df=effective_df,
            higher_df=higher_df
        )

        if not candidates:
            current_close = float(effective_df.iloc[-1]["close"])
            return TradingDecision(
                decision_id=f"DEC-{clean_sym}-NO_SETUP",
                action=DecisionAction.NO_TRADE,
                execution_mode=mode,
                symbol=clean_sym,
                direction="neutral",
                order_type="none",
                entry_price=current_close,
                stop_loss=0.0,
                take_profit=0.0,
                recommended_lot=0.0,
                dollar_risk=0.0,
                risk_reward=0.0,
                expected_value_r=None,
                setup_quality_score=0.0,
                setup_family="None",
                evidence_tier="INSUFFICIENT",
                sample_size=0,
                is_eligible=True,
                reason_codes=["NO_SMC_STRUCTURAL_SETUP_DETECTED"],
                rejection_reason_code=RejectionReasonCode.STRUCTURE_INVALID.value,
                decision_timestamp=dec_ts,
                market_context_version=market_ctx.market_context_version,
                session=market_ctx.session,
                regime=market_ctx.regime,
                volatility_regime=market_ctx.volatility_regime,
                htf_context=market_ctx.htf_context
            )

        # News Blackout Check
        is_news_blocked = False
        if news_windows and dec_ts != "UNKNOWN_TIME":
            try:
                cand_dt = parse_to_utc_timestamp(dec_ts)
                for nw in news_windows:
                    sym_nw = nw.get("symbol", "").upper()
                    if sym_nw == "" or sym_nw == clean_sym:
                        st = parse_to_utc_timestamp(nw["start"])
                        et = parse_to_utc_timestamp(nw["end"])
                        if st <= cand_dt <= et:
                            is_news_blocked = True
                            break
            except Exception:
                pass

        spread_pts = spec.typical_spread_pips / max(1.0, spec.pip_multiplier)

        # Candidate Evaluation Records
        evaluated_candidates: List[Dict[str, Any]] = []

        for c in candidates:
            eval_record: Dict[str, Any] = {
                "candidate": c,
                "passed_structure": True,
                "passed_quality": c.setup_quality_score >= min_quality_score,
                "passed_rr": c.risk_reward >= min_risk_reward,
                "passed_session": True,
                "passed_kill_zone": True,
                "passed_news": not is_news_blocked,
                "eligibility": None,
                "empirical": None,
                "edge_state": EdgeState.UNKNOWN_EDGE,
                "is_actionable": False,
                "rejection_reason": None
            }

            # 4. Quality & R:R Check
            if not eval_record["passed_quality"]:
                eval_record["rejection_reason"] = RejectionReasonCode.QUALITY_BELOW_MINIMUM
                evaluated_candidates.append(eval_record)
                continue

            if not eval_record["passed_rr"]:
                eval_record["rejection_reason"] = RejectionReasonCode.RR_TOO_LOW
                evaluated_candidates.append(eval_record)
                continue

            # 6. Session Policy Check
            # Gold Session Policy: XAUUSD during Asia permits Liquidity Sweep Reversal ONLY
            is_asia = market_ctx.session.upper() == "ASIA"
            if "XAU" in clean_sym and is_asia:
                if "sweep" not in c.setup_family.lower():
                    eval_record["passed_session"] = False
                    eval_record["rejection_reason"] = RejectionReasonCode.SESSION_BLOCKED
                    evaluated_candidates.append(eval_record)
                    continue

            # 7. Kill Zone Check (FX blocked during 21:00-02:00 UTC dead zone; Gold/Crypto exempt)
            if "XAU" not in clean_sym and "BTC" not in clean_sym and "ETH" not in clean_sym and dec_ts != "UNKNOWN_TIME":
                try:
                    cand_dt = parse_to_utc_timestamp(dec_ts)
                    if cand_dt.hour in {21, 22, 23, 0, 1}:
                        eval_record["passed_kill_zone"] = False
                        eval_record["rejection_reason"] = RejectionReasonCode.KILL_ZONE_BLOCKED
                        evaluated_candidates.append(eval_record)
                        continue
                except Exception:
                    pass

            # 8. News Check
            if is_news_blocked:
                eval_record["rejection_reason"] = RejectionReasonCode.NEWS_BLOCKED
                evaluated_candidates.append(eval_record)
                continue

            sl_dist = abs(c.entry_price - c.stop_loss)
            spread_cost_r = spread_pts / max(0.00001, sl_dist)

            # 9-13. Broker Spec, Minimum Lot, Margin & Actual Sizing
            elig = evaluate_instrument_eligibility(
                symbol=clean_sym,
                equity=equity,
                stop_distance_points=sl_dist,
                risk_percent=risk_percent,
                broker_min_volume=spec.min_volume,
                broker_vol_step=spec.vol_step,
                broker_tick_value=spec.tick_value,
                broker_tick_size=spec.tick_size,
                leverage=account_leverage,
                strict_risk_enforcement=True,
                is_cent_account=is_cent_account
            )
            eval_record["eligibility"] = elig

            if not elig.is_eligible:
                # Classify specific execution ineligibility reason
                if elig.dollar_loss_at_min_volume > elig.risk_budget_dollars:
                    eval_record["rejection_reason"] = RejectionReasonCode.ACCOUNT_RISK_TOO_HIGH
                elif elig.margin_requirement_estimate > equity:
                    eval_record["rejection_reason"] = RejectionReasonCode.MARGIN_INSUFFICIENT
                else:
                    eval_record["rejection_reason"] = RejectionReasonCode.MIN_LOT_TOO_LARGE
                evaluated_candidates.append(eval_record)
                continue

            actual_risk_dollars = elig.dollar_loss_at_recommended_lot

            # 14. Calculate Point-in-Time Empirical Expectancy
            emp = empirical_expectancy_engine.calculate_expectancy(
                symbol=clean_sym,
                setup_family=c.setup_family,
                session=market_ctx.session,
                regime=market_ctx.regime,
                spread_cost_r=spread_cost_r,
                as_of_timestamp=dec_ts
            )
            eval_record["empirical"] = emp
            eval_record["edge_state"] = emp.edge_state
            c.expected_value = emp.cost_adjusted_expectancy_r
            c.sample_size = emp.sample_size
            c.evidence_tier = str(emp.evidence_tier)

            # 15. Apply EdgePolicy
            if emp.edge_state == EdgeState.NEGATIVE_EDGE:
                # Mandatory Rule: DISCOVERY mode can NEVER bypass NEGATIVE_EDGE
                eval_record["rejection_reason"] = RejectionReasonCode.NEGATIVE_EDGE
                evaluated_candidates.append(eval_record)
                continue

            if emp.edge_state in [EdgeState.WEAK_EVIDENCE, EdgeState.MODERATE_EVIDENCE, EdgeState.STRONG_EVIDENCE]:
                ev_val = emp.cost_adjusted_expectancy_r or 0.0
                pf_val = emp.profit_factor or 1.0
                if ev_val < min_expectancy_r or pf_val < 1.25:
                    eval_record["rejection_reason"] = RejectionReasonCode.INSUFFICIENT_EVIDENCE_STRICT_MODE
                    evaluated_candidates.append(eval_record)
                    continue

            if emp.edge_state == EdgeState.UNKNOWN_EDGE:
                if effective_edge_mode == BacktestEdgeMode.DISCOVERY or bootstrap_unknown_edge:
                    # Check Discovery Exposure Budget
                    if discovery_budget:
                        trade_date = str(dec_ts)[:10]
                        can_open, disc_err = discovery_budget.can_open_discovery_trade(
                            symbol=clean_sym,
                            setup_family=c.setup_family,
                            risk_dollars=actual_risk_dollars,
                            account_equity=equity,
                            trade_date_str=trade_date
                        )
                        if not can_open:
                            eval_record["rejection_reason"] = disc_err
                            evaluated_candidates.append(eval_record)
                            continue
                    eval_record["discovery_allowed"] = True
                else:
                    eval_record["rejection_reason"] = RejectionReasonCode.INSUFFICIENT_EVIDENCE_STRICT_MODE
                    evaluated_candidates.append(eval_record)
                    continue

            # Check Duplicate / Cooldown
            is_dup, dup_reason = duplicate_detector.is_duplicate(
                symbol=clean_sym,
                setup_family=c.setup_family,
                direction=c.direction,
                zone_price=c.entry_price,
                current_bar=current_bar_index
            )
            if is_dup:
                eval_record["rejection_reason"] = RejectionReasonCode.DUPLICATE_SETUP
                evaluated_candidates.append(eval_record)
                continue

            # Check Portfolio Risk Limits
            can_add_port, port_reason = portfolio_risk_engine.evaluate_new_trade(
                current_positions=positions,
                candidate_symbol=clean_sym,
                candidate_direction=c.direction,
                risk_amount=actual_risk_dollars,
                required_margin=elig.margin_requirement_estimate,
                account_equity=equity
            )
            if not can_add_port:
                eval_record["rejection_reason"] = RejectionReasonCode.PORTFOLIO_RISK_EXCEEDED
                evaluated_candidates.append(eval_record)
                continue

            # Candidate passed all 17 checks and is fully actionable!
            eval_record["is_actionable"] = True
            evaluated_candidates.append(eval_record)

        # 18. Executable-First Ranking of Actionable Candidates
        actionable_candidates = [ec for ec in evaluated_candidates if ec["is_actionable"]]

        if not actionable_candidates:
            # Rejection Telemetry: Pick best evaluated candidate to report root cause
            best_attempt = evaluated_candidates[0] if evaluated_candidates else None
            rej_code = best_attempt["rejection_reason"].value if best_attempt and best_attempt.get("rejection_reason") else "NO_ACTIONABLE_CANDIDATE"
            cand_obj = best_attempt["candidate"] if best_attempt else None
            elig_obj = best_attempt.get("eligibility") if best_attempt else None
            emp_obj = best_attempt.get("empirical") if best_attempt else None

            reason_list = [rej_code]
            if rej_code in [RejectionReasonCode.ACCOUNT_RISK_TOO_HIGH.value, RejectionReasonCode.MIN_LOT_TOO_LARGE.value]:
                reason_list.append("SETUP_VALID_BUT_NOT_EXECUTABLE")
                reason_list.append("BALANCE_SHIELD_ACTIVATED")

            current_close = float(effective_df.iloc[-1]["close"])
            return TradingDecision(
                decision_id=f"DEC-{clean_sym}-REJECTED",
                action=DecisionAction.NO_TRADE,
                execution_mode=mode,
                symbol=clean_sym,
                direction=cand_obj.direction if cand_obj else "neutral",
                order_type=cand_obj.order_type if cand_obj else "none",
                entry_price=cand_obj.entry_price if cand_obj else current_close,
                stop_loss=cand_obj.stop_loss if cand_obj else 0.0,
                take_profit=cand_obj.take_profit if cand_obj else 0.0,
                recommended_lot=elig_obj.recommended_lot if elig_obj else 0.0,
                dollar_risk=elig_obj.dollar_loss_at_recommended_lot if elig_obj else 0.0,
                risk_reward=cand_obj.risk_reward if cand_obj else 0.0,
                expected_value_r=cand_obj.expected_value if cand_obj else None,
                setup_quality_score=cand_obj.setup_quality_score if cand_obj else 0.0,
                setup_family=cand_obj.setup_family if cand_obj else "None",
                evidence_tier=emp_obj.evidence_tier if emp_obj else "INSUFFICIENT",
                sample_size=emp_obj.sample_size if emp_obj else 0,
                is_eligible=elig_obj.is_eligible if elig_obj else False,
                ineligibility_reason=str(rej_code),
                reason_codes=reason_list,
                rejection_reason_code=rej_code,
                decision_timestamp=dec_ts,
                candidate=cand_obj,
                eligibility=elig_obj,
                edge_state=emp_obj.edge_state.value if emp_obj else EdgeState.UNKNOWN_EDGE.value,
                edge_policy=effective_edge_mode.value,
                market_context_version=market_ctx.market_context_version,
                session=market_ctx.session,
                regime=market_ctx.regime,
                volatility_regime=market_ctx.volatility_regime,
                htf_context=market_ctx.htf_context
            )

        # 19. Rank Actionable Candidates
        # In DISCOVERY with UNKNOWN_EDGE: rank by quality score, then R:R
        # In STRICT or with empirical evidence: rank by cost_adjusted_expectancy, then quality score
        def _candidate_rank_key(item: Dict[str, Any]):
            c_obj = item["candidate"]
            emp_obj = item["empirical"]
            ev = emp_obj.cost_adjusted_expectancy_r if emp_obj and emp_obj.cost_adjusted_expectancy_r is not None else 0.0
            return (ev, c_obj.setup_quality_score, c_obj.risk_reward)

        sorted_actionable = sorted(actionable_candidates, key=_candidate_rank_key, reverse=True)
        chosen = sorted_actionable[0]
        chosen_cand = chosen["candidate"]
        chosen_elig = chosen["eligibility"]
        chosen_emp = chosen["empirical"]

        is_discovery_trade = chosen_emp.edge_state == EdgeState.UNKNOWN_EDGE and (effective_edge_mode == BacktestEdgeMode.DISCOVERY or bootstrap_unknown_edge)

        # 20. Produce Final TradingDecision
        audit_dict = {
            "why_this_trade": f"High-quality {chosen_cand.setup_family} setup on {clean_sym} ({chosen_emp.edge_state.value}).",
            "why_now": f"Price tapped entry zone {chosen_cand.entry_price:.5f} with invalidation at {chosen_cand.stop_loss:.5f}.",
            "where_the_liquidity_is": f"Target liquidity pool at {chosen_cand.take_profit:.5f}.",
            "where_the_invalidation_is": f"Structural invalidation set at {chosen_cand.stop_loss:.5f}.",
            "where_the_target_liquidity_is": f"Take-profit liquidity target at {chosen_cand.take_profit:.5f}.",
            "what_would_make_this_trade_wrong": f"Adverse break beyond {chosen_cand.stop_loss:.5f} invalidates setup structure."
        }

        final_action = DecisionAction.TRADE
        risk_flags = []

        if enable_ai_advisory and mode in [ExecutionMode.PAPER, ExecutionMode.LIVE]:
            try:
                account_summ = {"equity": equity, "balance": account_balance, "open_positions": len(positions)}
                eval_res = comparative_evaluator.evaluate_candidates_sync([chosen_cand], account_summary=account_summ)
                if eval_res.action == "WAIT":
                    final_action = DecisionAction.WAIT
                    risk_flags.extend(eval_res.risk_flags)
                elif eval_res.action == "NO_TRADE":
                    final_action = DecisionAction.NO_TRADE
                    risk_flags.extend(eval_res.risk_flags)
                if eval_res.institutional_audit:
                    audit_dict = eval_res.institutional_audit.model_dump()
            except Exception as e:
                risk_flags.append(f"ADVISORY_LLM_SKIPPED: {e}")

        reason_codes = ["EMPIRICAL_EDGE_CONFIRMED", "BALANCE_SHIELD_PASSED", "PORTFOLIO_RISK_PASSED"]
        if is_discovery_trade:
            reason_codes = ["DISCOVERY_BOOTSTRAP_ALLOWED", "INSUFFICIENT_HISTORICAL_EVIDENCE_BYPASSED"]

        return TradingDecision(
            decision_id=f"DEC-{clean_sym}-{chosen_cand.setup_family.upper().replace(' ', '_')}-{current_bar_index}",
            action=final_action,
            execution_mode=mode,
            symbol=clean_sym,
            direction=chosen_cand.direction,
            order_type=chosen_cand.order_type,
            entry_price=chosen_cand.entry_price,
            stop_loss=chosen_cand.stop_loss,
            take_profit=chosen_cand.take_profit,
            recommended_lot=chosen_elig.recommended_lot,
            dollar_risk=chosen_elig.dollar_loss_at_recommended_lot,
            actual_risk_dollars=chosen_elig.dollar_loss_at_recommended_lot,
            required_margin=chosen_elig.margin_requirement_estimate,
            risk_reward=chosen_cand.risk_reward,
            expected_value_r=chosen_emp.cost_adjusted_expectancy_r,
            setup_quality_score=chosen_cand.setup_quality_score,
            setup_family=chosen_cand.setup_family,
            evidence_tier=chosen_emp.evidence_tier,
            sample_size=chosen_emp.sample_size,
            is_eligible=True,
            reason_codes=reason_codes,
            risk_flags=risk_flags,
            institutional_audit=audit_dict,
            candidate=chosen_cand,
            eligibility=chosen_elig,
            decision_timestamp=dec_ts,
            timestamp=dec_ts,
            edge_state=chosen_emp.edge_state.value,
            edge_policy=effective_edge_mode.value,
            discovery_trade=is_discovery_trade,
            empirical_sample_size=chosen_emp.sample_size,
            empirical_gate_bypassed=is_discovery_trade,
            bypass_reason="INSUFFICIENT_HISTORICAL_EVIDENCE" if is_discovery_trade else None,
            intrabar_resolution_method="OHLC_UNAMBIGUOUS",
            market_context_version=market_ctx.market_context_version,
            session=market_ctx.session,
            regime=market_ctx.regime,
            volatility_regime=market_ctx.volatility_regime,
            htf_context=market_ctx.htf_context
        )

    def evaluate_multi_asset(
        self,
        symbols: List[str],
        candles_by_symbol: Dict[str, pd.DataFrame],
        timeframe: str = "15m",
        account_balance: float = 1000.0,
        account_equity: Optional[float] = None,
        account_leverage: float = 2000.0,
        risk_percent: float = 1.0,
        current_positions: Optional[List[Dict[str, Any]]] = None,
        current_bar_index: int = 0,
        broker_name: Optional[str] = None,
        mode: ExecutionMode = ExecutionMode.LIVE,
        edge_mode: Optional[BacktestEdgeMode] = None,
        bootstrap_unknown_edge: bool = False,
        discovery_budget: Optional[DiscoveryExposureBudget] = None,
        as_of_timestamp: Optional[str] = None,
        max_new_trades: int = 3
    ) -> List[TradingDecision]:
        """
        Multi-Asset Watchlist Evaluator with Small-Account Failover.
        Collects decisions across all symbols, ranks executable opportunities, and selects best feasible setups.
        """
        decisions: List[TradingDecision] = []
        positions = list(current_positions or [])

        for sym in symbols:
            df = candles_by_symbol.get(sym)
            if df is None:
                continue

            dec = self.evaluate(
                symbol=sym,
                timeframe=timeframe,
                df=df,
                account_balance=account_balance,
                account_equity=account_equity,
                account_leverage=account_leverage,
                risk_percent=risk_percent,
                current_positions=positions,
                current_bar_index=current_bar_index,
                broker_name=broker_name,
                mode=mode,
                edge_mode=edge_mode,
                bootstrap_unknown_edge=bootstrap_unknown_edge,
                discovery_budget=discovery_budget,
                as_of_timestamp=as_of_timestamp
            )
            decisions.append(dec)

        # Sort actionable trades by expected value / quality score
        actionable = [d for d in decisions if d.action == DecisionAction.TRADE]
        actionable_sorted = sorted(
            actionable,
            key=lambda d: (d.expected_value_r or 0.0, d.setup_quality_score, d.risk_reward),
            reverse=True
        )

        return actionable_sorted[:max_new_trades]


# Global Authoritative Strategy Engine instance
unified_strategy_engine = UnifiedStrategyEngine()
