import numpy as np
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class MarketStructureEngine(BaseEngine):
    """
    Layer 3: Tracks swing highs, swing lows, Breaks of Structure (BOS),
    Changes of Character (CHoCH), and Premium/Discount zones.
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
                explanation="Market structure swings not yet fully formed on this series.",
                metrics={},
                validation_status="incomplete"
            )

        last_high = swing_highs[-1]
        last_low = swing_lows[-1]
        current_price = closes[-1]

        # Breakouts
        bos_detected = False
        latest_break = "none"
        if current_price > last_high:
            bos_detected = True
            latest_break = "bullish_bos"
        elif current_price < last_low:
            bos_detected = True
            latest_break = "bearish_bos"

        # Premium vs Discount Calculation
        struct_range = last_high - last_low
        equilibrium = last_low + (struct_range * 0.5)
        
        zone = "equilibrium"
        if current_price < equilibrium:
            zone = "discount"
        elif current_price > equilibrium:
            zone = "premium"

        bias = "neutral"
        score = 60.0
        if latest_break == "bullish_bos":
            bias = "bullish"
            score = 90.0
        elif latest_break == "bearish_bos":
            bias = "bearish"
            score = 90.0

        explanation = f"Market structure shows a {latest_break.upper()} breakout. Current price is in the {zone.upper()} zone."

        return EngineResult(
            result=bias,
            confidence=score,
            explanation=explanation,
            metrics={
                "swing_high": float(last_high),
                "swing_low": float(last_low),
                "equilibrium": float(equilibrium),
                "trading_zone": zone,
                "structure_break": latest_break
            },
            validation_status="valid"
        )
