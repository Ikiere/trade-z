"""
Deterministic SMC Engine - Layer 2, Layer 3 & Layer 4:
External Liquidity, Internal Liquidity (Inducement) & Confirmed Liquidity Sweep Engine.
"""

from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class LiquidityEngine(BaseEngine):
    """
    Maps External Liquidity (major swing levels, session extremes),
    Internal Liquidity (inducement pools), and validates Confirmed Liquidity Sweeps.
    """

    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        if df is None or len(df) < 20:
            return EngineResult(
                result="none",
                confidence=50.0,
                explanation="Insufficient candle series to evaluate liquidity pools.",
                metrics={},
                validation_status="incomplete"
            )

        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        opens = df["open"].values

        current_high = float(highs[-1])
        current_low = float(lows[-1])
        current_close = float(closes[-1])
        current_open = float(opens[-1])

        # 1. External Liquidity: Identify Major Swing Highs & Lows (5-bar pivots)
        major_highs: List[float] = []
        major_lows: List[float] = []
        for i in range(5, len(df) - 5):
            if highs[i] == max(highs[i - 5 : i + 6]):
                major_highs.append(float(highs[i]))
            if lows[i] == min(lows[i - 5 : i + 6]):
                major_lows.append(float(lows[i]))

        # Minor Swings (Internal Liquidity / Inducement) (2-bar pivots)
        minor_highs: List[float] = []
        minor_lows: List[float] = []
        for i in range(2, len(df) - 2):
            if highs[i] == max(highs[i - 2 : i + 3]):
                minor_highs.append(float(highs[i]))
            if lows[i] == min(lows[i - 2 : i + 3]):
                minor_lows.append(float(lows[i]))

        if not major_highs and minor_highs:
            major_highs = minor_highs
        if not major_lows and minor_lows:
            major_lows = minor_lows

        if not major_highs or not major_lows:
            return EngineResult(
                result="none",
                confidence=50.0,
                explanation="No established liquidity pools identified.",
                metrics={},
                validation_status="incomplete"
            )

        external_high = major_highs[-1]
        external_low = major_lows[-1]

        # 2. Equal Highs (EQH) & Equal Lows (EQL) Detection (within 0.03% threshold)
        eqh_detected = False
        eql_detected = False
        threshold = current_close * 0.0003

        if len(minor_highs) >= 2:
            if abs(minor_highs[-1] - minor_highs[-2]) <= threshold:
                eqh_detected = True
        if len(minor_lows) >= 2:
            if abs(minor_lows[-1] - minor_lows[-2]) <= threshold:
                eql_detected = True

        # 3. Confirmed Liquidity Sweep Verification (Layer 4)
        # Check last 3 candles for sweeps of external or internal liquidity
        sweep_detected = "none"
        sweep_level = 0.0
        confidence = 50.0
        sweep_type = "none"

        # Look back up to 3 candles
        lookback = min(3, len(df) - 1)
        for offset in range(1, lookback + 1):
            idx = -offset
            bar_high = float(highs[idx])
            bar_low = float(lows[idx])
            bar_close = float(closes[idx])

            # Bullish Sweep: Price swept below swing low, but closed back above it (wick-only or quick reclaim)
            # Check external low first, then minor inducement low
            for test_low in [external_low] + (minor_lows[-3:] if minor_lows else []):
                if bar_low < test_low and current_close > test_low:
                    sweep_detected = "bullish_sweep"
                    sweep_level = test_low
                    sweep_type = "external" if test_low == external_low else "inducement"
                    confidence = 88.0 if sweep_type == "external" else 78.0
                    break

            # Bearish Sweep: Price swept above swing high, but closed back below it (wick-only or quick reclaim)
            for test_high in [external_high] + (minor_highs[-3:] if minor_highs else []):
                if bar_high > test_high and current_close < test_high:
                    sweep_detected = "bearish_sweep"
                    sweep_level = test_high
                    sweep_type = "external" if test_high == external_high else "inducement"
                    confidence = 88.0 if sweep_type == "external" else 78.0
                    break

            if sweep_detected != "none":
                break

        # If resting EQH/EQL exist above/below current price, they serve as liquidity draw (targets)
        explanation = "No confirmed liquidity sweeps detected."
        if sweep_detected == "bullish_sweep":
            explanation = (
                f"Confirmed Bullish Liquidity Sweep ({sweep_type.upper()} pool at {sweep_level:.5f}). "
                f"Sell-side liquidity tapped and buyers reclaimed level."
            )
        elif sweep_detected == "bearish_sweep":
            explanation = (
                f"Confirmed Bearish Liquidity Sweep ({sweep_type.upper()} pool at {sweep_level:.5f}). "
                f"Buy-side liquidity tapped and sellers rejected price."
            )
        elif eqh_detected:
            explanation = "Resting Buy-Side Liquidity pool (Equal Highs) identified above market."
            confidence = 60.0
        elif eql_detected:
            explanation = "Resting Sell-Side Liquidity pool (Equal Lows) identified below market."
            confidence = 60.0

        return EngineResult(
            result=sweep_detected,
            confidence=confidence,
            explanation=explanation,
            metrics={
                "external_high": float(external_high),
                "external_low": float(external_low),
                "sweep_type": sweep_type,
                "sweep_level": float(sweep_level),
                "eqh_detected": eqh_detected,
                "eql_detected": eql_detected,
                "minor_highs_count": len(minor_highs),
                "minor_lows_count": len(minor_lows)
            },
            validation_status="valid"
        )
