import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot
from app.services.indicators import calculate_ema, calculate_adx


class TrendQualityEngine(BaseEngine):
    """
    Layer 6: Measures EMA slope, EMA alignment (9, 21, 50),
    and ADX trend strength to evaluate structural trend quality.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        if len(df) < 50:
            return EngineResult(
                result="low",
                confidence=50.0,
                explanation="Trend quality evaluation skipped: insufficient history.",
                metrics={},
                validation_status="incomplete"
            )

        # Computes EMAs
        ema9 = calculate_ema(df, 9).values
        ema21 = calculate_ema(df, 21).values
        ema50 = calculate_ema(df, 50).values

        last_ema9 = ema9[-1]
        last_ema21 = ema21[-1]
        last_ema50 = ema50[-1]

        # Calculate ADX (trend strength)
        adx = float(calculate_adx(df).iloc[-1])

        # EMA Slope over last 5 bars
        ema50_slope = ema50[-1] - ema50[-5]

        # Alignment checks
        bullish_align = last_ema9 > last_ema21 > last_ema50
        bearish_align = last_ema9 < last_ema21 < last_ema50

        trend_state = "ranging"
        score = 50.0
        if bullish_align and ema50_slope > 0:
            trend_state = "strong_bullish"
            score = 90.0 if adx > 25 else 75.0
        elif bearish_align and ema50_slope < 0:
            trend_state = "strong_bearish"
            score = 90.0 if adx > 25 else 75.0

        explanation = f"Trend state is {trend_state.upper()} with an ADX of {adx:.1f} and EMA50 slope of {ema50_slope:.5f}."

        return EngineResult(
            result=trend_state,
            confidence=score,
            explanation=explanation,
            metrics={
                "adx": adx,
                "ema50_slope": ema50_slope,
                "trend_aligned": bullish_align or bearish_align
            },
            validation_status="valid"
        )
