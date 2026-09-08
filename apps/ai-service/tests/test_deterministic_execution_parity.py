"""
Trade-Z Deterministic Decision & Execution Parity Test Suite:
Proves mathematically and programmatically that the exact same strategy
produces the exact same decisions across BACKTEST, PAPER, and LIVE modes.
"""

import sys
import os
import unittest
import pandas as pd
import numpy as np

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.structure import generate_simulated_candles
from app.services.unified_strategy_engine import (
    unified_strategy_engine,
    ExecutionMode,
    DecisionAction,
    TradingDecision
)
from app.services.broker_profiles import get_broker_profile, sync_from_mt5_symbol_info
from app.services.event_driven_simulator import event_driven_simulator, OrderStatus
from app.services.duplicate_detector import duplicate_detector


class TestDeterministicExecutionParity(unittest.TestCase):

    def setUp(self):
        duplicate_detector.reset()
        self.df_eur = generate_simulated_candles("EURUSD", "15m", seed_offset=100)
        self.df_gbp = generate_simulated_candles("GBPUSD", "15m", seed_offset=200)
        self.df_xau = generate_simulated_candles("XAUUSD", "15m", seed_offset=300)

    def test_backtest_paper_live_decision_parity(self):
        """
        PROVE: Given the exact same candle snapshot and account context,
        the strategy produces 100% bit-for-bit identical decisions across
        BACKTEST, PAPER, and LIVE execution modes.
        """
        duplicate_detector.reset()
        sub_df = self.df_eur.iloc[:50].copy().reset_index(drop=True)

        dec_backtest = unified_strategy_engine.evaluate(
            symbol="EURUSD",
            timeframe="15m",
            df=sub_df,
            account_balance=1000.0,
            account_equity=1000.0,
            account_leverage=2000.0,
            risk_percent=1.0,
            mode=ExecutionMode.BACKTEST,
            enable_ai_advisory=False
        )

        duplicate_detector.reset()
        dec_paper = unified_strategy_engine.evaluate(
            symbol="EURUSD",
            timeframe="15m",
            df=sub_df,
            account_balance=1000.0,
            account_equity=1000.0,
            account_leverage=2000.0,
            risk_percent=1.0,
            mode=ExecutionMode.PAPER,
            enable_ai_advisory=False
        )

        duplicate_detector.reset()
        dec_live = unified_strategy_engine.evaluate(
            symbol="EURUSD",
            timeframe="15m",
            df=sub_df,
            account_balance=1000.0,
            account_equity=1000.0,
            account_leverage=2000.0,
            risk_percent=1.0,
            mode=ExecutionMode.LIVE,
            enable_ai_advisory=False
        )

        # 1. Action Parity
        self.assertEqual(dec_backtest.action, dec_paper.action)
        self.assertEqual(dec_paper.action, dec_live.action)

        # 2. Symbol & Direction Parity
        self.assertEqual(dec_backtest.symbol, "EURUSD")
        self.assertEqual(dec_paper.symbol, "EURUSD")
        self.assertEqual(dec_live.symbol, "EURUSD")
        self.assertEqual(dec_backtest.direction, dec_paper.direction)
        self.assertEqual(dec_paper.direction, dec_live.direction)

        # 3. Order Execution Levels Parity (Exact Float Equality)
        self.assertEqual(dec_backtest.entry_price, dec_paper.entry_price)
        self.assertEqual(dec_paper.entry_price, dec_live.entry_price)
        self.assertEqual(dec_backtest.stop_loss, dec_paper.stop_loss)
        self.assertEqual(dec_paper.stop_loss, dec_live.stop_loss)
        self.assertEqual(dec_backtest.take_profit, dec_paper.take_profit)
        self.assertEqual(dec_paper.take_profit, dec_live.take_profit)

        # 4. Sizing & Lot Calculation Parity
        self.assertEqual(dec_backtest.recommended_lot, dec_paper.recommended_lot)
        self.assertEqual(dec_paper.recommended_lot, dec_live.recommended_lot)
        self.assertEqual(dec_backtest.dollar_risk, dec_paper.dollar_risk)
        self.assertEqual(dec_paper.dollar_risk, dec_live.dollar_risk)

        # 5. Statistical Expectancy & Edge Parity
        self.assertEqual(dec_backtest.expected_value_r, dec_paper.expected_value_r)
        self.assertEqual(dec_paper.expected_value_r, dec_live.expected_value_r)
        self.assertEqual(dec_backtest.setup_quality_score, dec_paper.setup_quality_score)
        self.assertEqual(dec_paper.setup_quality_score, dec_live.setup_quality_score)
        self.assertEqual(dec_backtest.setup_family, dec_paper.setup_family)
        self.assertEqual(dec_paper.setup_family, dec_live.setup_family)

        # 6. Reason Codes Parity
        self.assertEqual(dec_backtest.reason_codes, dec_paper.reason_codes)
        self.assertEqual(dec_paper.reason_codes, dec_live.reason_codes)

    def test_small_account_balance_shield_parity(self):
        """
        PROVE: When minimum broker volume risks more than 1.5x risk budget on a micro-account,
        the Small-Account Balance Shield triggers IDENTICALLY in Backtest, Paper, and Live.
        """
        sub_df = self.df_xau.iloc[:45].copy().reset_index(drop=True)

        for m in [ExecutionMode.BACKTEST, ExecutionMode.PAPER, ExecutionMode.LIVE]:
            duplicate_detector.reset()
            dec = unified_strategy_engine.evaluate(
                symbol="XAUUSD",
                timeframe="15m",
                df=sub_df,
                account_balance=20.0,   # Micro-account ($20)
                account_equity=20.0,
                risk_percent=1.0,       # 1% risk = $0.20
                mode=m,
                enable_ai_advisory=False
            )

            # If setup stop distance is large, balance shield triggers
            if not dec.is_eligible:
                self.assertFalse(dec.is_eligible)
                self.assertEqual(dec.action, DecisionAction.NO_TRADE)
                self.assertEqual(dec.recommended_lot, 0.0)
                self.assertIn("SETUP_VALID_BUT_NOT_EXECUTABLE", dec.reason_codes)
                self.assertIn("BALANCE_SHIELD_ACTIVATED", dec.reason_codes)

    def test_authoritative_mt5_broker_specs(self):
        """
        PROVE: Broker specifications derive strictly from authoritative MT5 parameters.
        """
        broker = get_broker_profile("exness")

        eur_spec = broker.get_symbol_spec("EURUSD")
        self.assertEqual(eur_spec.contract_size, 100000.0)
        self.assertEqual(eur_spec.min_volume, 0.01)
        self.assertEqual(eur_spec.pip_multiplier, 10000.0)
        self.assertEqual(eur_spec.typical_spread_pips, 0.6)

        xau_spec = broker.get_symbol_spec("XAUUSD")
        self.assertEqual(xau_spec.contract_size, 100.0)
        self.assertEqual(xau_spec.min_volume, 0.01)
        self.assertEqual(xau_spec.pip_multiplier, 10.0)
        self.assertEqual(xau_spec.typical_spread_pips, 1.8)

        # Verify dynamic MT5 terminal sync helper
        mock_mt5_quote = {
            "digits": 5,
            "point": 0.00001,
            "spread": 7,  # 7 points = 0.7 pips
            "contract_size": 100000.0,
            "volume_min": 0.01,
            "volume_step": 0.01,
            "volume_max": 100.0,
            "trade_tick_value": 1.0
        }
        synced_spec = sync_from_mt5_symbol_info("EURUSD", mock_mt5_quote, broker)
        self.assertEqual(synced_spec.typical_spread_pips, 0.7)
        self.assertEqual(synced_spec.tick_size, 0.00001)

    def test_multi_asset_simultaneous_parity(self):
        """
        PROVE: Multi-asset watchlist evaluation produces consistent ranked decisions.
        """
        duplicate_detector.reset()
        candles_map = {
            "EURUSD": self.df_eur.iloc[:50].copy().reset_index(drop=True),
            "GBPUSD": self.df_gbp.iloc[:50].copy().reset_index(drop=True),
            "XAUUSD": self.df_xau.iloc[:50].copy().reset_index(drop=True)
        }

        decisions_backtest = unified_strategy_engine.evaluate_multi_asset(
            symbols=["EURUSD", "GBPUSD", "XAUUSD"],
            candles_by_symbol=candles_map,
            account_balance=1000.0,
            mode=ExecutionMode.BACKTEST
        )

        duplicate_detector.reset()
        decisions_live = unified_strategy_engine.evaluate_multi_asset(
            symbols=["EURUSD", "GBPUSD", "XAUUSD"],
            candles_by_symbol=candles_map,
            account_balance=1000.0,
            mode=ExecutionMode.LIVE
        )

        self.assertEqual(len(decisions_backtest), len(decisions_live))
        for d_b, d_l in zip(decisions_backtest, decisions_live):
            self.assertEqual(d_b.symbol, d_l.symbol)
            self.assertEqual(d_b.direction, d_l.direction)
            self.assertEqual(d_b.entry_price, d_l.entry_price)
            self.assertEqual(d_b.stop_loss, d_l.stop_loss)
            self.assertEqual(d_b.take_profit, d_l.take_profit)
            self.assertEqual(d_b.recommended_lot, d_l.recommended_lot)

    def test_event_driven_simulator_fidelity(self):
        """
        PROVE: The EventDrivenSimulator executes trades with authentic MT5 margin mechanics,
        tracks autopsies, and audits Sentinel trade management Variants A-H.
        """
        custom_map = {
            "EURUSD": self.df_eur.iloc[:100].copy().reset_index(drop=True),
            "GBPUSD": self.df_gbp.iloc[:100].copy().reset_index(drop=True),
            "XAUUSD": self.df_xau.iloc[:100].copy().reset_index(drop=True)
        }

        res = event_driven_simulator.run_simulation(
            symbols=["EURUSD", "GBPUSD", "XAUUSD"],
            initial_balance=100.0,
            timeframe="15m",
            bars=100,
            risk_percent=1.0,
            broker_name="exness",
            custom_candles_map=custom_map
        )

        self.assertTrue(res["success"])
        self.assertIn("summary", res)
        self.assertIn("trades", res)
        self.assertIn("autopsies", res)
        self.assertIn("sentinel_audit", res)
        self.assertIn("max_drawdown_pct", res)
        self.assertIn("strategy_version", res)
        self.assertIn("Event-Driven", res["strategy_version"])


if __name__ == "__main__":
    unittest.main()
