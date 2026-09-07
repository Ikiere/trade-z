"""
Comprehensive Test Suite for Trade-Z Institutional Engine Rebuild:
1. Market Data Pre-Flight Validation
2. Small-Account Mathematical Risk Sizing & MT5 Bridge Protection ($20 Account Test)
3. Deterministic 15-Layer SMC Engine (BOS, CHoCH, Dealing Range, Sweeps, FVGs, OBs)
4. Decoupled AI Reviewer Critic & Guardrails
"""

import sys
import os
import unittest
import pandas as pd
import numpy as np

# Ensure app and mt5-bridge can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../mt5-bridge")))

from app.services.market_data_validator import validate_dataframe_candles, validate_spread
from app.services.market_data import MarketSnapshot
from app.engines.structure import MarketStructureEngine
from app.engines.liquidity import LiquidityEngine
from app.engines.zones import InstitutionalZonesEngine
from app.engines.momentum import MomentumEngine
from app.engines.trend_quality import TrendQualityEngine
from app.engines.confidence import ConfidenceEngine
from app.engines.risk import RiskEngine
from app.services.reviewers.openrouter_reviewer import OpenRouterReviewer


class MockSymbolInfo:
    def __init__(self, volume_min=0.01, volume_max=100.0, volume_step=0.01, trade_tick_value=1.0, trade_tick_size=0.00001):
        self.volume_min = volume_min
        self.volume_max = volume_max
        self.volume_step = volume_step
        self.trade_tick_value = trade_tick_value
        self.trade_tick_size = trade_tick_size


class TestMarketDataValidator(unittest.TestCase):

    def test_empty_or_insufficient_dataframe(self):
        # Empty DataFrame
        res = validate_dataframe_candles(None)
        self.assertFalse(res.is_valid)
        self.assertIn("MARKET_DATA_EMPTY_OR_NONE", res.failure_reasons)

        # Insufficient candles (<30)
        short_df = pd.DataFrame({
            "open": [1.0] * 10,
            "high": [1.1] * 10,
            "low": [0.9] * 10,
            "close": [1.0] * 10
        })
        res2 = validate_dataframe_candles(short_df, min_candles=30)
        self.assertFalse(res2.is_valid)
        self.assertTrue(any("INSUFFICIENT_CANDLE_DEPTH" in r for r in res2.failure_reasons))

    def test_missing_ohlc_columns(self):
        bad_df = pd.DataFrame({
            "price": [1.0] * 40,
            "volume": [100] * 40
        })
        res = validate_dataframe_candles(bad_df)
        self.assertFalse(res.is_valid)
        self.assertTrue(any("MISSING_REQUIRED_OHLC_COLUMNS" in r for r in res.failure_reasons))

    def test_geometric_ohlc_inconsistency(self):
        # High < Low
        corrupt_df = pd.DataFrame({
            "open": [1.0] * 40,
            "high": [0.8] * 40,  # High is lower than low!
            "low": [1.2] * 40,
            "close": [1.0] * 40
        })
        res = validate_dataframe_candles(corrupt_df)
        self.assertFalse(res.is_valid)
        self.assertTrue(any("GEOMETRIC_OHLC_INCONSISTENCY" in r for r in res.failure_reasons))

    def test_valid_dataframe_passes(self):
        # Clean synthetic series
        np.random.seed(42)
        base = 1.1000
        returns = np.random.normal(0, 0.001, 50)
        prices = base + np.cumsum(returns)
        clean_df = pd.DataFrame({
            "open": prices,
            "high": prices + 0.0005,
            "low": prices - 0.0005,
            "close": prices + 0.0001
        })
        res = validate_dataframe_candles(clean_df, min_candles=30)
        self.assertTrue(res.is_valid)
        self.assertEqual(len(res.failure_reasons), 0)

    def test_negative_spread_rejected(self):
        valid, err = validate_spread(bid=1.1005, ask=1.1000)  # Ask < Bid is invalid
        self.assertFalse(valid)
        self.assertIn("NEGATIVE_SPREAD_DETECTED", err)


class TestSmallAccountRiskSizing(unittest.TestCase):

    def test_twenty_dollar_account_gold_rejection(self):
        """
        Critical Audit Item: On a $20 account, broker minimum lot is 0.01.
        Gold with 50-pip (5.0 point) stop risks $5.00 on 0.01 lot (25% of account!).
        Must strictly return valid: False and NOT clamp lot up to 0.01.
        """
        from mt5_bridge import calculate_safe_lot_size

        gold_sym = MockSymbolInfo(
            volume_min=0.01,
            volume_max=100.0,
            volume_step=0.01,
            trade_tick_value=1.0,  # $1 per point at 0.01 lot
            trade_tick_size=0.01
        )

        equity = 20.0
        sl_dist = 5.0  # $5 move in Gold
        risk_percent = 1.0  # 1% target = $0.20 allowed risk

        sizing = calculate_safe_lot_size(gold_sym, equity, sl_dist, risk_percent)
        self.assertFalse(sizing["valid"], "Must veto trade because risk exceeds allowed maximum!")
        self.assertEqual(sizing["lot"], 0.0, "Must NEVER force lot size to 0.01 if risk is breached!")
        self.assertIn("Capital Shield Veto", sizing["error"])

    def test_ten_thousand_dollar_account_sizing(self):
        """
        Standard account ($10,000) on EURUSD with 20-pip stop should size accurately to 1% risk ($100).
        """
        from mt5_bridge import calculate_safe_lot_size

        eur_sym = MockSymbolInfo(
            volume_min=0.01,
            volume_max=100.0,
            volume_step=0.01,
            trade_tick_value=1.0,
            trade_tick_size=0.00001
        )

        equity = 10000.0
        sl_dist = 0.0020  # 20 pips
        risk_percent = 1.0  # 1% = $100

        sizing = calculate_safe_lot_size(eur_sym, equity, sl_dist, risk_percent)
        self.assertTrue(sizing["valid"])
        self.assertGreater(sizing["lot"], 0.01)
        self.assertLessEqual(sizing["est_loss"], 101.0)


class TestDeterministicSMCLayers(unittest.TestCase):

    def setUp(self):
        # Create standard synthetic trend
        n = 50
        dates = pd.date_range("2026-01-01", periods=n, freq="15min")
        close = np.linspace(1.1000, 1.1100, n)
        high = close + 0.0008
        low = close - 0.0008
        open_ = close - 0.0002
        self.df = pd.DataFrame({"open": open_, "high": high, "low": low, "close": close}, index=dates)

    def test_market_structure_engine_dealing_range(self):
        snapshot = MarketSnapshot("EURUSD", "15m", self.df, self.df)
        engine = MarketStructureEngine()
        res = engine.analyze(snapshot, {})

        self.assertEqual(res.validation_status, "valid")
        self.assertIn("trading_zone", res.metrics)
        self.assertIn(res.metrics["trading_zone"], ["discount", "deep_discount", "equilibrium", "premium", "deep_premium"])
        self.assertIn("equilibrium", res.metrics)
        self.assertGreater(res.metrics["range_high"], res.metrics["range_low"])

    def test_zones_engine_order_blocks_and_fvg(self):
        # Insert a deliberate 3-candle FVG: candle 1 high < candle 3 low
        fvg_df = self.df.copy()
        fvg_df.loc[fvg_df.index[20], "high"] = 1.1020
        fvg_df.loc[fvg_df.index[21], "low"] = 1.1025
        fvg_df.loc[fvg_df.index[21], "high"] = 1.1050
        fvg_df.loc[fvg_df.index[22], "low"] = 1.1040  # Low 22 (1.1040) > High 20 (1.1020) -> FVG!

        snapshot = MarketSnapshot("EURUSD", "15m", fvg_df, fvg_df)
        engine = InstitutionalZonesEngine()
        res = engine.analyze(snapshot, {})

        self.assertEqual(res.validation_status, "valid")
        self.assertGreaterEqual(res.metrics["unmitigated_fvgs_count"], 1)

    def test_momentum_displacement(self):
        # Insert strong displacement candle (3x average body)
        disp_df = self.df.copy()
        disp_df.loc[disp_df.index[-1], "open"] = 1.1050
        disp_df.loc[disp_df.index[-1], "close"] = 1.1120  # +70 pips candle!
        disp_df.loc[disp_df.index[-1], "high"] = 1.1125
        disp_df.loc[disp_df.index[-1], "low"] = 1.1045

        snapshot = MarketSnapshot("EURUSD", "15m", disp_df, disp_df)
        engine = MomentumEngine()
        res = engine.analyze(snapshot, {})

        self.assertEqual(res.validation_status, "valid")
        self.assertTrue(res.metrics["has_displacement"])
        self.assertGreaterEqual(res.metrics["displacement_ratio"], 1.5)

    def test_risk_engine_small_account_veto(self):
        snapshot = MarketSnapshot("XAUUSD", "15m", self.df, self.df)
        engine = RiskEngine()
        # Test $20 equity on Gold
        context = {
            "account_equity": 20.0,
            "account_balance": 20.0,
            "risk_reward_ratio": 2.5,
            "risk_percent": 1.0
        }
        res = engine.analyze(snapshot, context)
        self.assertEqual(res.result, "rejected")
        self.assertEqual(res.validation_status, "limit_breached")
        self.assertIn("AI Capital Shield Veto", res.explanation)


class TestDecoupledAIReviewer(unittest.TestCase):

    def test_reviewer_fallback_without_api_key(self):
        """
        When OpenRouter API key is not configured, Reviewer gracefully
        approves the deterministic setup without blocking the systematic pipeline.
        """
        import asyncio

        reviewer = OpenRouterReviewer(api_key=None)
        mock_setup = {
            "symbol": "EURUSD",
            "timeframe": "15m",
            "direction": "BUY",
            "confidence": 84.0,
            "order_type": "buy limit"
        }

        result = asyncio.run(reviewer.review_setup(mock_setup))
        self.assertIn(result.decision, ["APPROVE", "REJECT", "REQUEST_MORE_DATA"])
        self.assertEqual(result.reviewer_name, "DeterministicReviewerFallback")


if __name__ == "__main__":
    unittest.main()
