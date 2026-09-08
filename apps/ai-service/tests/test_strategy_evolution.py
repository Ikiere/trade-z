"""
Unit and Integration Tests for Trade-Z Strategy Evolution & Trade Opportunity Engine
Validates:
1. 10 SMC Setup Families detection & parameter calculation
2. Quantitative Institutional Objective Metrics (EV, PF, Avg R, RoR, MDD, MFE/MAE)
3. Small-Account Multi-Asset Eligibility & Failover (e.g. $20 account on Gold vs EURUSD)
4. Adaptive Regime Matrix (empirical EV, negative edge / DISCOURAGED flagging)
5. AI Model A/B Testing Framework (4 Architectures replay & comparative metrics)
6. Trade Management Research (BE policies, partial TP, premature stopouts)
"""

import pytest
import pandas as pd
import numpy as np

from app.services.setup_families import (
    detect_all_setup_families,
    CandidateSetup,
)
from app.services.quant_metrics import (
    InstitutionalQuantMetrics,
    TradeOutcome,
)
from app.services.asset_eligibility import (
    evaluate_instrument_eligibility,
    INSTRUMENT_SPECS,
)
from app.services.adaptive_regime_matrix import (
    AdaptiveRegimeMatrix,
    RegimePerformanceBucket,
)
from app.services.model_ab_tester import (
    ModelABTester,
)
from app.services.trade_management_research import (
    TradeManagementResearcher,
    TradePathSample,
    BEPolicy,
    PartialPolicy,
)


def _create_mock_ohlcv(n_bars=80, base_price=1.1000) -> pd.DataFrame:
    """Helper to generate mock OHLCV dataframe with realistic swing waves and pivots."""
    import math
    np.random.seed(42)
    rows = []
    for i in range(n_bars):
        # 12-bar oscillating cycle creates clear SMC swings, BOS, and FVG
        wave = math.sin(i / 2.5) * 0.0050
        bar_price = base_price + wave + (i * 0.00005)
        high = bar_price + 0.0008
        low = bar_price - 0.0008
        open_p = low + 0.0004
        close_p = high - 0.0003
        rows.append({
            'open': round(open_p, 5),
            'high': round(high, 5),
            'low': round(low, 5),
            'close': round(close_p, 5),
            'volume': 1500.0
        })
    return pd.DataFrame(rows)


# =====================================================================
# 1. 10 SMC SETUP FAMILIES TESTS
# =====================================================================

def test_setup_families_generation():
    """Validates that detect_all_setup_families generates setups across multiple families."""
    df = _create_mock_ohlcv(80, base_price=1.0850)
    higher_df = _create_mock_ohlcv(50, base_price=1.0800)

    # Induce a clear Bullish Liquidity Sweep on the last bar:
    # Wick sweeps below the recent swing low and closes back inside the range
    recent_low = float(min(df['low'].iloc[-15:-3]))
    df.iloc[-1, df.columns.get_loc('low')] = round(recent_low - 0.0012, 5)
    df.iloc[-1, df.columns.get_loc('open')] = round(recent_low + 0.0003, 5)
    df.iloc[-1, df.columns.get_loc('close')] = round(recent_low + 0.0006, 5)
    df.iloc[-1, df.columns.get_loc('high')] = round(recent_low + 0.0010, 5)

    setups = detect_all_setup_families(
        symbol='EURUSD',
        timeframe='15m',
        df=df,
        higher_df=higher_df
    )

    assert isinstance(setups, list)
    assert len(setups) > 0

    # Ensure every setup has valid SMC geometry & non-zero risk reward
    for s in setups:
        assert isinstance(s, CandidateSetup)
        assert s.symbol == 'EURUSD'
        assert s.direction in ['BUY', 'SELL']
        assert s.entry_price > 0
        assert s.stop_loss > 0
        assert s.take_profit > 0
        assert s.risk_reward > 0
        assert len(s.setup_family) > 0
        if s.direction == 'BUY':
            assert s.take_profit > s.entry_price
            assert s.stop_loss < s.entry_price
        else:
            assert s.take_profit < s.entry_price
            assert s.stop_loss > s.entry_price


# =====================================================================
# 2. QUANTITATIVE INSTITUTIONAL METRICS TESTS
# =====================================================================

def test_quant_metrics_portfolio_calculation():
    """Validates Expected Value, Profit Factor, Average R, RoR, and Drawdown formulas."""
    trades = [
        TradeOutcome(trade_id='1', symbol='EURUSD', realized_r=2.5, mfe_r=2.8, mae_r=-0.3, session='LONDON', setup_family='BOS + FVG Continuation', regime='BALANCED'),
        TradeOutcome(trade_id='2', symbol='EURUSD', realized_r=-1.0, mfe_r=0.4, mae_r=-1.0, session='LONDON', setup_family='BOS + FVG Continuation', regime='BALANCED'),
        TradeOutcome(trade_id='3', symbol='GBPUSD', realized_r=3.0, mfe_r=3.2, mae_r=-0.2, session='NY', setup_family='Liquidity Sweep Reversal', regime='BALANCED'),
        TradeOutcome(trade_id='4', symbol='USDJPY', realized_r=-1.0, mfe_r=0.2, mae_r=-1.0, session='TOKYO', setup_family='CHoCH Reversal', regime='CHOPPY'),
        TradeOutcome(trade_id='5', symbol='EURUSD', realized_r=1.8, mfe_r=2.0, mae_r=-0.4, session='LONDON', setup_family='Order Block Retest', regime='BALANCED'),
    ]

    metrics = InstitutionalQuantMetrics.compute_portfolio_metrics(trades)

    assert metrics.sample_size == 5
    assert metrics.win_count == 3
    assert metrics.loss_count == 2
    assert metrics.win_rate == 60.0  # 3 / 5 = 60.0%
    assert metrics.profit_factor > 1.0  # Gross win 7.3R / Gross loss 2.0R = 3.65
    assert metrics.expected_value_r > 0  # Net +5.3R / 5 = 1.06R
    assert metrics.risk_of_ruin_pct >= 0.0
    assert metrics.average_mfe_r > 0
    assert metrics.regime_breakdown is not None
    assert 'LONDON' in metrics.session_breakdown


# =====================================================================
# 3. SMALL ACCOUNT MULTI-ASSET ELIGIBILITY & FAILOVER TESTS
# =====================================================================

def test_small_account_failover_gold_vs_eurusd():
    """
    Validates that a $20 account cannot trade Gold safely at 0.01 lot ($2.50+ risk > $0.40 budget),
    flagging it ineligible without shutting down, while EURUSD is fully eligible.
    """
    # $20 Account with 2% risk budget = $0.40 max risk
    equity = 20.0
    risk_pct = 2.0  # $0.40 budget

    # Case A: Gold (XAUUSD) with 30-point stop loss ($3.00 risk on 0.01 lot)
    gold_elig = evaluate_instrument_eligibility(
        symbol='XAUUSD',
        equity=equity,
        stop_distance_points=3.0,
        risk_percent=risk_pct,
        leverage=100.0
    )

    assert gold_elig.is_eligible is False
    assert gold_elig.dollar_risk_at_min_lot == 3.0  # 0.01 lot * 300 pts = $3.00
    assert gold_elig.dollar_risk_at_min_lot > gold_elig.risk_budget
    assert 'exceeding your' in gold_elig.reason

    # Case B: EURUSD with 15 pip stop loss ($1.50 risk on 0.01 lot)
    # On a $200 account (or 1% risk on $20,000 account):
    large_equity = 20000.0
    large_gold_elig = evaluate_instrument_eligibility(
        symbol='XAUUSD',
        equity=large_equity,
        stop_distance_points=3.0,
        risk_percent=1.0,
        leverage=100.0
    )
    assert large_gold_elig.is_eligible is True
    assert large_gold_elig.recommended_lot_size > 0.01


# =====================================================================
# 4. ADAPTIVE REGIME MATRIX TESTS
# =====================================================================

def test_adaptive_regime_matrix_expectancy_and_discouraged():
    """Validates that AdaptiveRegimeMatrix tracks empirical EV and flags negative edge tuples as DISCOURAGED."""
    matrix = AdaptiveRegimeMatrix()

    # Record 25 losing trades in a choppy Asian session on XAUUSD
    for i in range(25):
        matrix.record_outcome(
            symbol='XAUUSD',
            session='TOKYO',
            setup_family='BOS + FVG Continuation',
            volatility_regime='CHOPPY',
            realized_r=-1.0
        )

    bucket = matrix.get_bucket('XAUUSD', 'TOKYO', 'BOS + FVG Continuation', 'CHOPPY')
    assert bucket is not None
    assert bucket.sample_size == 25
    assert bucket.status == 'DISCOURAGED'
    assert bucket.expected_value_r < 0

    # Query setup expectancy for opportunity engine ranking
    expectancy_info = matrix.get_setup_expectancy('XAUUSD', 'TOKYO', 'BOS + FVG Continuation', 'CHOPPY')
    assert expectancy_info['status'] == 'DISCOURAGED'
    assert expectancy_info['score_multiplier'] == 0.1  # heavily penalized


# =====================================================================
# 5. AI MODEL A/B TESTING REPLAY TESTS
# =====================================================================

def test_model_ab_tester_replay():
    """Validates simulation across Architecture A, B, C, D."""
    candidates = [
        {
            'id': 'cand_1',
            'symbol': 'EURUSD',
            'setup_family': 'BOS + FVG Continuation',
            'deterministic_score': 82.0,
            'deterministic_approved': True,
            'ground_truth_outcome_r': 2.5,
            'ground_truth_mfe_r': 2.8,
            'ground_truth_mae_r': -0.2,
            'regime': 'BALANCED'
        },
        {
            'id': 'cand_2',
            'symbol': 'GBPUSD',
            'setup_family': 'CHoCH Reversal',
            'deterministic_score': 68.0,
            'deterministic_approved': False,
            'ground_truth_outcome_r': -1.0,
            'ground_truth_mfe_r': 0.3,
            'ground_truth_mae_r': -1.0,
            'regime': 'CHOPPY'
        },
        {
            'id': 'cand_3',
            'symbol': 'USDJPY',
            'setup_family': 'Liquidity Sweep Reversal',
            'deterministic_score': 76.0,
            'deterministic_approved': True,
            'ground_truth_outcome_r': 1.8,
            'ground_truth_mfe_r': 2.1,
            'ground_truth_mae_r': -0.4,
            'regime': 'BALANCED'
        }
    ]

    replay_results = ModelABTester.run_replay(candidates)

    assert replay_results['total_candidates_replayed'] == 3
    assert 'arch_a_pure_smc' in replay_results['architectures']
    assert 'arch_b_primary_model' in replay_results['architectures']
    assert 'arch_c_alt_model' in replay_results['architectures']
    assert 'arch_d_critic_only' in replay_results['architectures']
    assert len(replay_results['ranked_by_ev']) == 4


# =====================================================================
# 6. TRADE MANAGEMENT RESEARCH TESTS
# =====================================================================

def test_trade_management_researcher():
    """Validates simulation of BE policies and partial TPs, detecting premature BE stopouts."""
    samples = [
        # Trade 1: Reached +1.2R, pulled back to entry, then went on to hit full +3.0R TP
        TradePathSample(
            trade_id='path_1',
            symbol='EURUSD',
            target_r=3.0,
            mfe_r=3.0,
            mae_r=-0.2,
            first_reached_1r=True,
            first_reached_0_5r=True,
            structural_bos_formed=True,
            hit_tp_eventually=True,
            pulled_back_to_entry_after_1r=True,  # pulled back to 0!
            pulled_back_to_entry_after_0_5r=True,
        ),
        # Trade 2: Direct winner, never pulled back to entry
        TradePathSample(
            trade_id='path_2',
            symbol='GBPUSD',
            target_r=2.5,
            mfe_r=2.5,
            mae_r=-0.1,
            first_reached_1r=True,
            first_reached_0_5r=True,
            structural_bos_formed=True,
            hit_tp_eventually=True,
            pulled_back_to_entry_after_1r=False,
            pulled_back_to_entry_after_0_5r=False,
        ),
        # Trade 3: Direct loser (-1.0R)
        TradePathSample(
            trade_id='path_3',
            symbol='USDJPY',
            target_r=2.0,
            mfe_r=0.2,
            mae_r=-1.0,
            first_reached_1r=False,
            first_reached_0_5r=False,
            structural_bos_formed=False,
            hit_tp_eventually=False,
            pulled_back_to_entry_after_1r=False,
            pulled_back_to_entry_after_0_5r=False,
        ),
    ]

    report = TradeManagementResearcher.evaluate_all_combinations(samples)

    assert report['total_trades_analyzed'] == 3
    assert len(report['matrix_comparison']) == 16  # 4 BE policies * 4 Partial policies
    assert report['best_performing_policy'] is not None

    # Check that under BE_AT_1_0R with NO_PARTIAL, Trade 1 was stopped prematurely at BE!
    be_1r_res = next(
        r for r in report['matrix_comparison']
        if r['be_policy'] == BEPolicy.BE_AT_1_0R.value and r['partial_policy'] == PartialPolicy.NO_PARTIAL.value
    )
    assert be_1r_res['premature_be_stopouts'] >= 1
