import numpy as np
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class LiquidityEngine(BaseEngine):
    """
    Layer 4: Identifies liquidity pools, Equal Highs (EQH), Equal Lows (EQL),
    and price stop-hunts / liquidity sweeps.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values

        # Find Pivot swings
        swing_highs = []
        swing_lows = []
        for i in range(3, len(df) - 3):
            if highs[i] == max(highs[i-3:i+4]):
                swing_highs.append(highs[i])
            if lows[i] == min(lows[i-3:i+4]):
                swing_lows.append(lows[i])

        if not swing_highs or not swing_lows:
            return EngineResult(
                result="neutral",
                confidence=50.0,
                explanation="No key liquidity levels found.",
                metrics={},
                validation_status="incomplete"
            )

        last_high = swing_highs[-1]
        last_low = swing_lows[-1]

        # Check for Sweeps (current candle high/low wick vs last structural high/low)
        current_close = closes[-1]
        current_high = highs[-1]
        current_low = lows[-1]

        sweep_detected = "none"
        confidence = 50.0
        
        # Bullish sweep: Low wick goes below last swing low but close is above it
        if current_low < last_low and current_close > last_low:
            sweep_detected = "bullish_sweep"
            confidence = 85.0
        # Bearish sweep: High wick goes above last swing high but close is below it
        elif current_high > last_high and current_close < last_high:
            sweep_detected = "bearish_sweep"
            confidence = 85.0

        # EQH/EQL checks (within 0.03% threshold)
        eqh_detected = False
        eql_detected = False
        threshold = current_close * 0.0003
        
        if len(swing_highs) >= 2:
            if abs(swing_highs[-1] - swing_highs[-2]) < threshold:
                eqh_detected = True
        if len(swing_lows) >= 2:
            if abs(swing_lows[-1] - swing_lows[-2]) < threshold:
                eql_detected = True

        explanation = "No major liquidity sweeps identified."
        if sweep_detected == "bullish_sweep":
            explanation = "Bullish liquidity sweep detected! Sellers stop-hunted below swing low before price recovered."
        elif sweep_detected == "bearish_sweep":
            explanation = "Bearish liquidity sweep detected! Buyers stop-hunted above swing high before price dropped."

        return EngineResult(
            result=sweep_detected,
            confidence=confidence,
            explanation=explanation,
            metrics={
                "eqh_detected": eqh_detected,
                "eql_detected": eql_detected,
                "sweep_type": sweep_detected
            },
            validation_status="valid"
        )
