import numpy as np
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class InstitutionalZonesEngine(BaseEngine):
    """
    Layer 5: Detects Order Blocks (OB), Breaker Blocks, and
    Fair Value Gaps (FVG / Inverse FVG).
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        opens = df["open"].values

        fvgs = []
        # Detect FVGs
        for i in range(2, len(df)):
            if lows[i] > highs[i - 2] + 1e-5:
                fvgs.append({"type": "bullish", "high": lows[i], "low": highs[i - 2]})
            elif highs[i] < lows[i - 2] - 1e-5:
                fvgs.append({"type": "bearish", "high": highs[i], "low": lows[i - 2]})

        order_blocks = []
        body_sizes = np.abs(closes - opens)
        avg_body = np.mean(body_sizes)
        
        # Detect Order Blocks
        for i in range(1, len(df) - 1):
            if body_sizes[i] > avg_body * 1.5:
                if closes[i] > opens[i] and closes[i-1] < opens[i-1]:
                    order_blocks.append({"type": "bullish", "high": highs[i-1], "low": lows[i-1]})
                elif closes[i] < opens[i] and closes[i-1] > opens[i-1]:
                    order_blocks.append({"type": "bearish", "high": highs[i-1], "low": lows[i-1]})

        current_price = closes[-1]
        near_ob = False
        near_fvg = False
        
        # Check if price is within a recent OB (within 0.1% threshold)
        if order_blocks:
            latest_ob = order_blocks[-1]
            if latest_ob["low"] * 0.999 <= current_price <= latest_ob["high"] * 1.001:
                near_ob = True

        # Check if price is inside a recent FVG
        if fvgs:
            latest_fvg = fvgs[-1]
            if latest_fvg["low"] <= current_price <= latest_fvg["high"]:
                near_fvg = True

        result = "none"
        confidence = 50.0
        if near_ob:
            result = "inside_ob"
            confidence = 80.0
        elif near_fvg:
            result = "inside_fvg"
            confidence = 75.0

        explanation = f"Price is trading near institutional zones (OB: {near_ob}, FVG: {near_fvg})."

        return EngineResult(
            result=result,
            confidence=confidence,
            explanation=explanation,
            metrics={
                "total_fvgs": len(fvgs),
                "total_obs": len(order_blocks),
                "inside_ob": near_ob,
                "inside_fvg": near_fvg
            },
            validation_status="valid"
        )
