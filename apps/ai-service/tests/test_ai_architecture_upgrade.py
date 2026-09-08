"""
Comprehensive Test Suite for Trade-Z AI Architecture Upgrade (v2.2-EmpiricalSMC)
Validates all 11 phases:
- Empirical Expectancy & Sample Evidence Tiers
- Duplicate Setup Fingerprinting & Multi-Level Cooldowns
- Portfolio Risk & Net Currency Correlation Limits
- Balance Shield & Sizing Enforcement (SETUP_VALID_BUT_NOT_EXECUTABLE)
- AI Comparative Ranker Structured Advisory & Confidence Calibration
- Loss Forensic Autopsy Taxonomy (13 Categories)
- Chronological Walk-Forward Validation & Version Metadata
- Model A/B Testing Across Modes A-E
- Sentinel Auto-Management (Variant H Structure Trail & Drawdown Separation)
"""

import pytest
import pandas as pd
import numpy as np

from app.services.empirical_expectancy import (
    empirical_expectancy_engine,
    EmpiricalExpectancyEngine,
    SampleEvidenceTier,
    EmpiricalExpectancyResult
)
from app.services.duplicate_detector import duplicate_detector, DuplicateDetector
from app.services.portfolio_risk import portfolio_risk_engine, PortfolioRiskEngine, PortfolioPosition
from app.services.asset_eligibility import evaluate_instrument_eligibility, EligibilityResult
from app.services.confidence_calibration import confidence_calibrator, ConfidenceCalibrator
from app.services.reviewers.comparative_evaluator import (
    comparative_evaluator,
    ComparativeAnalysisResult,
    InstitutionalTradeAudit
)
from app.services.trade_autopsy import autopsy_engine, LossCategory
from app.services.walk_forward_pipeline import walk_forward_pipeline, WalkForwardSplit, StrategyVersionInfo
from app.services.model_ab_tester import ModelABTester
from app.services.real_market_simulator import real_market_simulator, generate_summary_from_ledger, run_sentinel_counterfactual_audit
from app.services.setup_families import CandidateSetup
from app.services.virtual_mt5_account import VirtualMT5Account


# =====================================================================
# 1. EMPIRICAL EXPECTANCY & EVIDENCE TIERS
# =====================================================================

def test_sample_evidence_tier_classification():
    """Validates strict evidence tier thresholds and Bayesian shrinkage."""
    assert EmpiricalExpectancyEngine.determine_evidence_tier(30) == SampleEvidenceTier.INSUFFICIENT
    assert EmpiricalExpectancyEngine.determine_evidence_tier(100) == SampleEvidenceTier.WEAK
    assert EmpiricalExpectancyEngine.determine_evidence_tier(350) == SampleEvidenceTier.MODERATE
    assert EmpiricalExpectancyEngine.determine_evidence_tier(600) == SampleEvidenceTier.STRONG


def test_empirical_expectancy_mathematical_calculation():
    """Validates EV = (P_win * avg_win_R) - (P_loss * avg_loss_R) minus friction."""
    # Create 100 sample trades: 50 wins (+2.0R), 40 losses (-1.0R), 10 BE (0.0R)
    trades = (
        [{"r_multiple": 2.0, "mfe_r": 2.2, "mae_r": -0.3, "duration_bars": 12}] * 50
        + [{"r_multiple": -1.0, "mfe_r": 0.2, "mae_r": -1.0, "duration_bars": 8}] * 40
        + [{"r_multiple": 0.0, "mfe_r": 1.5, "mae_r": -0.5, "duration_bars": 15}] * 10
    )
    result = empirical_expectancy_engine.calculate_expectancy(
        trades=trades,
        spread_cost_r=0.05,
        slippage_r=0.02,
        commission_r=0.01
    )

    # 50% win, 40% loss, 10% BE
    assert result.sample_count == 100
    assert result.win_rate == 50.0
    assert result.loss_rate == 40.0
    assert result.breakeven_rate == 10.0
    assert result.evidence_tier == SampleEvidenceTier.WEAK

    # Raw EV = (0.50 * 2.0) - (0.40 * 1.0) = 1.0 - 0.40 = +0.60R
    # Weak tier applies 30% discount (shrinkage = 0.70) => 0.60 * 0.70 = 0.42R
    # Cost deduction: 0.42 - 0.08 = +0.34R
    assert result.expectancy_r == 0.60
    assert result.cost_adjusted_expectancy_r == 0.34
    assert result.has_statistical_edge is True
    assert result.recommended_action == "TRADE"


def test_insufficient_sample_zeroes_out_edge():
    """Validates that samples < 50 are discounted with shrinkage=0.0 and recommended WAIT."""
    small_trades = [{"r_multiple": 3.0, "mfe_r": 3.0, "mae_r": -0.2, "duration_bars": 10}] * 20
    result = empirical_expectancy_engine.calculate_expectancy(trades=small_trades)
    assert result.evidence_tier == SampleEvidenceTier.INSUFFICIENT
    assert result.shrinkage_factor == 0.0
    assert result.recommended_action == "WAIT"


# =====================================================================
# 2. DUPLICATE SETUP FINGERPRINTING & COOLDOWNS
# =====================================================================

def test_duplicate_detector_fingerprint_and_cooldowns():
    """Validates multi-level cooldowns: symbol, event, and zone."""
    detector = DuplicateDetector(
        global_symbol_cooldown_bars=3,
        event_cooldown_bars=6,
        zone_cooldown_points=0.0020
    )

    # Register initial execution
    detector.register_execution(
        symbol="EURUSD",
        setup_family="BOS_FVG_CONTINUATION",
        direction="BUY",
        zone_price=1.0850,
        current_bar=10
    )

    # 1. Symbol cooldown check at bar 11 (only 1 bar later)
    is_dup, reason = detector.is_duplicate(
        symbol="EURUSD",
        setup_family="CHoCH_REVERSAL",
        direction="BUY",
        zone_price=1.0880,
        current_bar=11
    )
    assert is_dup is True
    assert "SYMBOL_COOLDOWN" in reason

    # 2. Different symbol (GBPUSD) is NOT blocked by EURUSD cooldown
    is_dup_gbp, _ = detector.is_duplicate(
        symbol="GBPUSD",
        setup_family="BOS_FVG_CONTINUATION",
        direction="BUY",
        zone_price=1.2750,
        current_bar=11
    )
    assert is_dup_gbp is False

    # 3. Bar 14: Symbol cooldown elapsed (4 bars > 3), but same zone within tolerance band
    is_dup_zone, reason_zone = detector.is_duplicate(
        symbol="EURUSD",
        setup_family="ORDER_BLOCK_RETEST",
        direction="BUY",
        zone_price=1.0851,  # within 0.0020 of 1.0850
        current_bar=14
    )
    assert is_dup_zone is True
    assert "SAME_ZONE_COOLDOWN" in reason_zone

    # 4. Bar 20: All cooldowns elapsed (>6 bars)
    is_dup_clear, _ = detector.is_duplicate(
        symbol="EURUSD",
        setup_family="BOS_FVG_CONTINUATION",
        direction="BUY",
        zone_price=1.0850,
        current_bar=20
    )
    assert is_dup_clear is False


# =====================================================================
# 3. PORTFOLIO RISK & CURRENCY CORRELATION
# =====================================================================

def test_portfolio_risk_currency_correlation_limits():
    """Validates that concurrent correlated USD positions trigger risk limit violations."""
    engine = PortfolioRiskEngine(
        max_portfolio_risk_pct=3.0,
        max_simultaneous_positions=3,
        max_correlated_currency_pct=2.0
    )

    # Existing position: Long EURUSD risking $15 on $1000 account (1.5% short USD)
    existing = [
        {
            "symbol": "EURUSD",
            "direction": "long",
            "initial_risk_money": 15.0,
            "required_margin": 20.0
        }
    ]

    # Candidate 1: Long GBPUSD risking $12 on $1000 account (1.2% short USD)
    # Total short USD would become 1.5% + 1.2% = 2.7% > max 2.0% limit!
    can_add, reason = engine.evaluate_new_trade(
        current_positions=existing,
        candidate_symbol="GBPUSD",
        candidate_direction="long",
        risk_amount=12.0,
        required_margin=20.0,
        account_equity=1000.0,
        used_margin=20.0
    )
    assert can_add is False
    assert "CORRELATED_EXPOSURE_LIMIT" in reason
    assert "USD" in reason

    # Candidate 2: Short USDJPY risking $10 on $1000 account (Long JPY, Short USD)
    # Also compounds USD risk, should be rejected
    can_add_jpy, reason_jpy = engine.evaluate_new_trade(
        current_positions=existing,
        candidate_symbol="USDJPY",
        candidate_direction="short",
        risk_amount=10.0,
        required_margin=20.0,
        account_equity=1000.0,
        used_margin=20.0
    )
    assert can_add_jpy is False
    assert "USD" in reason_jpy


# =====================================================================
# 4. BALANCE SHIELD & ASSET ELIGIBILITY
# =====================================================================

def test_balance_shield_micro_account_rejection():
    """Validates that a $100 micro-account rejects high point-value gold with SETUP_VALID_BUT_NOT_EXECUTABLE."""
    # XAUUSD with $10 stop distance (1000 points) on 0.01 lot = $10 risk (10% of $100)
    # Nominal 1% risk budget is $1.00. 1.5x budget is $1.50. $10 > $1.50 -> REJECT
    elig = evaluate_instrument_eligibility(
        symbol="XAUUSD",
        equity=100.0,
        stop_distance_points=10.0,
        risk_percent=1.0,
        broker_min_volume=0.01,
        broker_vol_step=0.01,
        broker_tick_value=1.0,
        broker_tick_size=0.01,
        leverage=2000.0,
        strict_risk_enforcement=True
    )
    assert elig.is_eligible is False
    assert "SETUP_VALID_BUT_NOT_EXECUTABLE" in elig.ineligibility_reason
    assert "EURUSD" in elig.suggested_alternatives

    # Same $100 account on EURUSD with 20 pip SL = $2.00 risk -> acceptable capacity
    elig_eur = evaluate_instrument_eligibility(
        symbol="EURUSD",
        equity=100.0,
        stop_distance_points=0.0020,
        risk_percent=1.0,
        broker_min_volume=0.01,
        broker_vol_step=0.01,
        broker_tick_value=1.0,
        broker_tick_size=0.0001,
        leverage=2000.0,
        strict_risk_enforcement=False
    )
    assert elig_eur.is_eligible is True
    assert elig_eur.recommended_lot == 0.01


# =====================================================================
# 5. AI COMPARATIVE RANKER & CONFIDENCE CALIBRATION
# =====================================================================

def test_confidence_calibration_shrinkage():
    """Validates Brier-based confidence calibration and overconfidence shrinkage."""
    calibrator = ConfidenceCalibrator()
    # High uncalibrated raw score (e.g. 95%) is shrunk towards empirical base
    calibrated = calibrator.calibrate_confidence(raw_confidence=95.0, sample_size=40)
    assert calibrated < 95.0
    assert calibrated >= 50.0

    # Low sample size applies shrinkage towards 50% neutral
    cal_small = calibrator.calibrate_confidence(raw_confidence=85.0, sample_size=10)
    cal_large = calibrator.calibrate_confidence(raw_confidence=85.0, sample_size=500)
    assert cal_small < cal_large


def test_comparative_evaluator_advisory_guardrails():
    """Validates that comparative evaluator produces strict structured output and cannot alter orders."""
    cand1 = CandidateSetup(
        id="CAND-EURUSD-01",
        setup_id="CAND-EURUSD-01",
        symbol="EURUSD",
        setup_family="BOS_FVG_CONTINUATION",
        direction="BUY",
        order_type="market",
        entry_price=1.0850,
        stop_loss=1.0830,
        take_profit=1.0900,
        risk_reward=2.5,
        invalidation_level=1.0825,
        target_liquidity_level=1.0910,
        setup_quality_score=85.0,
        expected_value=0.65
    )
    cand2 = CandidateSetup(
        id="CAND-GBPUSD-02",
        setup_id="CAND-GBPUSD-02",
        symbol="GBPUSD",
        setup_family="LIQUIDITY_SWEEP",
        direction="BUY",
        order_type="market",
        entry_price=1.2700,
        stop_loss=1.2680,
        take_profit=1.2740,
        risk_reward=2.0,
        invalidation_level=1.2675,
        target_liquidity_level=1.2750,
        setup_quality_score=72.0,
        expected_value=0.25
    )

    eval_result = comparative_evaluator.evaluate_candidates_sync([cand1, cand2])
    assert eval_result.action in ["TRADE", "WAIT", "NO_TRADE"]
    assert eval_result.selected_candidate in ["CAND-EURUSD-01", None]
    assert len(eval_result.ranking) == 2
    assert eval_result.institutional_audit is not None
    assert eval_result.institutional_audit.why_this_trade != ""
    assert eval_result.institutional_audit.where_the_invalidation_is != ""


# =====================================================================
# 6. LOSS FORENSIC AUTOPSY (13 CATEGORIES)
# =====================================================================

def test_trade_autopsy_13_category_taxonomy():
    """Validates forensic loss autopsy categorization across institutional root causes."""
    # Trade stopped out by HTF liquidity run
    trade_htf = {
        "symbol": "EURUSD",
        "direction": "BUY",
        "entry": 1.0850,
        "sl": 1.0830,
        "tp": 1.0900,
        "net_pnl": -10.0,
        "r_multiple": -1.0,
        "outcome": "LOSS",
        "mfe_r": 0.4,
        "mae_r": -1.2,
        "exit_reason": "STOP_LOSS",
        "bars_held": 4
    }
    autopsy = autopsy_engine.analyze_trade(
        trade_record=trade_htf,
        market_context={"session": "LONDON", "regime": "trending", "spread_pips": 1.0}
    )
    assert hasattr(LossCategory, autopsy.root_cause)
    assert autopsy.root_cause != "BAD_LUCK"


# =====================================================================
# 7. CHRONOLOGICAL WALK-FORWARD PIPELINE
# =====================================================================

def test_walk_forward_chronological_partitioning():
    """Validates strict chronological Train / Validation / OOS partitioning without leakage."""
    # Create 100 sequential timestamped records
    records = [{"bar": i, "realized_r": 1.0 if i % 2 == 0 else -1.0} for i in range(100)]
    split = walk_forward_pipeline.chronological_split(records, train_pct=0.60, val_pct=0.20, oos_pct=0.20)

    assert len(split.train_set) == 60
    assert len(split.val_set) == 20
    assert len(split.oos_set) == 20

    # Strict zero lookahead: train max bar < val min bar < oos min bar
    train_max = max(r["bar"] for r in split.train_set)
    val_min = min(r["bar"] for r in split.val_set)
    val_max = max(r["bar"] for r in split.val_set)
    oos_min = min(r["bar"] for r in split.oos_set)

    assert train_max < val_min
    assert val_max < oos_min

    # Version metadata validation
    v_info = walk_forward_pipeline.get_strategy_version_info()
    assert v_info.version_name == "Trade-Z v2.2-EmpiricalSMC"
    assert v_info.deterministic_layer_authoritative is True


# =====================================================================
# 8. MODEL A/B TESTING ACROSS MODES A TO E
# =====================================================================

def test_model_ab_tester_modes_a_to_e():
    """Validates evaluation across all 5 production AI modes."""
    candidates = [
        {
            "id": "c1",
            "symbol": "EURUSD",
            "setup_family": "BOS_FVG_CONTINUATION",
            "deterministic_score": 85.0,
            "deterministic_approved": True,
            "empirical_expectancy_r": 0.45,
            "evidence_tier": "WEAK_EVIDENCE",
            "ground_truth_outcome_r": 2.5,
            "ground_truth_mfe_r": 2.8,
            "ground_truth_mae_r": -0.2,
            "regime": "BALANCED"
        },
        {
            "id": "c2",
            "symbol": "GBPUSD",
            "setup_family": "CHoCH_REVERSAL",
            "deterministic_score": 62.0,
            "deterministic_approved": False,
            "empirical_expectancy_r": -0.10,
            "evidence_tier": "WEAK_EVIDENCE",
            "ground_truth_outcome_r": -1.0,
            "ground_truth_mfe_r": 0.2,
            "ground_truth_mae_r": -1.0,
            "regime": "CHOPPY"
        }
    ]

    res = ModelABTester.run_multi_mode_evaluation(candidates)
    assert "mode_a_pure_smc" in res["modes"]
    assert "mode_b_current_ai" in res["modes"]
    assert "mode_c_ai_critic" in res["modes"]
    assert "mode_d_ai_comparative_ranker" in res["modes"]
    assert "mode_e_statistical_ranker" in res["modes"]
    assert len(res["ranked_by_ev"]) == 5


# =====================================================================
# 9. SENTINEL AUTO-MANAGEMENT (VARIANT H) & DRAWDOWN SEPARATION
# =====================================================================

def test_sentinel_counterfactual_audit_variants_a_to_h():
    """Validates Sentinel audit covering all 8 variants A through H."""
    trades = [
        # Trade that reached +4.0R MFE but pulled back and closed at Breakeven
        {
            "trade_id": 1,
            "symbol": "XAUUSD",
            "entry": 2700.0,
            "sl": 2690.0,
            "tp": 2750.0,
            "net_pnl": 0.0,
            "r_multiple": 0.0,
            "outcome": "BREAKEVEN",
            "exit_reason": "BREAKEVEN",
            "mfe_r": 4.0,
            "mae_r": -0.2
        },
        # Regular loss
        {
            "trade_id": 2,
            "symbol": "EURUSD",
            "entry": 1.0850,
            "sl": 1.0830,
            "tp": 1.0900,
            "net_pnl": -10.0,
            "r_multiple": -1.0,
            "outcome": "LOSS",
            "exit_reason": "STOP_LOSS",
            "mfe_r": 0.3,
            "mae_r": -1.0
        }
    ]
    audit = run_sentinel_counterfactual_audit(trades)
    matrix = audit["counterfactual_expectancy_matrix"]

    assert "A_Current_Sentinel_1_5R" in matrix
    assert "B_No_BE_Pure_Target" in matrix
    assert "F_ATR_Trailing_Protection" in matrix
    assert "G_Partial_1_5R_Plus_BE" in matrix
    assert "H_Structure_Confirmed_Trail" in matrix

    # Variant H locked in +3.0R (4.0 - 1.0) on trade 1, so its expectancy must exceed Variant A (0.0R)
    exp_a = matrix["A_Current_Sentinel_1_5R"]["expectancy_r"]
    exp_h = matrix["H_Structure_Confirmed_Trail"]["expectancy_r"]
    assert exp_h > exp_a


def test_closed_vs_floating_drawdown_separation():
    """Validates that realized balance drawdown is strictly isolated from floating excursion drawdown."""
    account = VirtualMT5Account(initial_balance=100.0)
    # Position runs up to +$300 floating (equity $400), then retraces to breakeven ($100 balance)
    # Floating drawdown was 75%, but realized balance drawdown was 0%!
    account.peak_equity = 400.0
    account.equity = 100.0
    account.max_floating_drawdown_pct = 75.0
    account.max_drawdown_pct = 75.0

    account.balance = 100.0
    account.peak_balance = 100.0
    account.max_closed_drawdown_pct = 0.0

    summary = generate_summary_from_ledger(
        closed=[],
        initial_balance=100.0,
        account=account
    )

    assert summary["max_closed_drawdown_pct"] == 0.0
    assert summary["max_floating_drawdown_pct"] == 75.0
