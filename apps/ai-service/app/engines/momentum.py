import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot
from app.services.indicators import calculate_rsi, calculate_macd


class MomentumEngine(BaseEngine):
    """
    Layer 7: Computes RSI bands, MACD histogram crossovers, and
    acceleration divergence parameters.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        rsi = float(calculate_rsi(df, period=14).iloc[-1])

        macd_line, signal_line, hist = calculate_macd(df)
        macd_val = float(macd_line.iloc[-1])
        macd_sig = float(signal_line.iloc[-1])
        macd_hist = float(hist.iloc[-1])

        # Crossovers
        macd_bullish = macd_hist > 0 and macd_val > macd_sig
        macd_bearish = macd_hist < 0 and macd_val < macd_sig

        momentum_bias = "neutral"
        score = 50.0

        if macd_bullish and 40 <= rsi <= 68:
            momentum_bias = "bullish"
            score = 85.0
        elif macd_bearish and 32 <= rsi <= 60:
            momentum_bias = "bearish"
            score = 85.0
        elif rsi >= 70:
            momentum_bias = "overbought"
            score = 30.0  # low confidence for buying, high for exhaustion
        elif rsi <= 30:
            momentum_bias = "oversold"
            score = 30.0

        explanation = f"Momentum bias is {momentum_bias.upper()} (RSI: {rsi:.1f}, MACD Histogram: {macd_hist:.5f})."

        return EngineResult(
            result=momentum_bias,
            confidence=score,
            explanation=explanation,
            metrics={
                "rsi": rsi,
                "macd_val": macd_val,
                "macd_sig": macd_sig,
                "macd_hist": macd_hist
            },
            validation_status="valid"
        )
