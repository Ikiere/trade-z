import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class HigherTimeframeEngine(BaseEngine):
    """
    Layer 2: Analyzes higher timeframe trends to output the primary
    directional trend bias (bullish, bearish, or neutral).
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        hdf = snapshot.higher_df
        if hdf.empty or len(hdf) < 15:
            return EngineResult(
                result="neutral",
                confidence=50.0,
                explanation="Higher Timeframe analysis skipped: insufficient data.",
                metrics={},
                validation_status="incomplete"
            )

        # Compute Higher Timeframe EMA Trend (EMA 9, 21, 50)
        ema9 = hdf["close"].ewm(span=9, adjust=False).mean().values
        ema21 = hdf["close"].ewm(span=21, adjust=False).mean().values
        ema50 = hdf["close"].ewm(span=50, adjust=False).mean().values

        last_ema9 = ema9[-1]
        last_ema21 = ema21[-1]
        last_ema50 = ema50[-1]

        bullish = last_ema9 > last_ema21 > last_ema50
        bearish = last_ema9 < last_ema21 < last_ema50

        bias = "neutral"
        confidence = 50.0
        if bullish:
            bias = "bullish"
            confidence = 85.0
        elif bearish:
            bias = "bearish"
            confidence = 85.0

        explanation = f"Higher timeframe primary trend bias is {bias.upper()} based on EMA(9/21/50) alignment."

        return EngineResult(
            result=bias,
            confidence=confidence,
            explanation=explanation,
            metrics={
                "higher_ema9": round(float(last_ema9), 5),
                "higher_ema21": round(float(last_ema21), 5),
                "higher_ema50": round(float(last_ema50), 5),
            },
            validation_status="valid"
        )
