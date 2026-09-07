"""
Deterministic SMC Engine - Layer 9:
Displacement & Momentum Confirmation (Candle Body >= 1.5x Average, Consecutive Candles, RSI/MACD).
"""

import numpy as np
import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot
from app.services.indicators import calculate_rsi, calculate_macd


class MomentumEngine(BaseEngine):
    """
    Layer 9: Validates aggressive institutional Displacement and Momentum Confirmation:
    - Candle body size >= 1.5x average body size
    - Consecutive directional candles
    - Non-exhausted RSI and aligned MACD momentum
    """

    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        if df is None or len(df) < 20:
            return EngineResult(
                result="neutral",
                confidence=50.0,
                explanation="Momentum skipped: insufficient history.",
                metrics={},
                validation_status="incomplete"
            )

        closes = df["close"].values
        opens = df["open"].values
        highs = df["high"].values
        lows = df["low"].values

        # 1. Displacement Calculation
        body_sizes = np.abs(closes - opens)
        avg_body = float(np.mean(body_sizes[-20:])) if len(body_sizes) >= 20 else float(np.mean(body_sizes))
        last_body = float(body_sizes[-1])
        displacement_ratio = (last_body / avg_body) if avg_body > 0 else 1.0
        has_displacement = displacement_ratio >= 1.5

        # 2. Consecutive directional candles (last 3 bars)
        bullish_bars = int(np.sum([closes[i] > opens[i] for i in range(-3, 0)]))
        bearish_bars = int(np.sum([closes[i] < opens[i] for i in range(-3, 0)]))

        # 3. Indicators: RSI and MACD
        rsi_series = calculate_rsi(df, period=14)
        rsi = float(rsi_series.iloc[-1]) if not rsi_series.empty else 50.0

        macd_line, signal_line, hist = calculate_macd(df)
        macd_val = float(macd_line.iloc[-1]) if not macd_line.empty else 0.0
        macd_sig = float(signal_line.iloc[-1]) if not signal_line.empty else 0.0
        macd_hist = float(hist.iloc[-1]) if not hist.empty else 0.0

        macd_bullish = macd_hist > 0 and macd_val >= macd_sig
        macd_bearish = macd_hist < 0 and macd_val <= macd_sig

        # 4. Momentum & Displacement Synthesis
        momentum_bias = "neutral"
        score = 50.0

        if macd_bullish and bullish_bars >= 2 and 45 <= rsi <= 68:
            momentum_bias = "bullish"
            score = 90.0 if has_displacement else 80.0
        elif macd_bearish and bearish_bars >= 2 and 32 <= rsi <= 55:
            momentum_bias = "bearish"
            score = 90.0 if has_displacement else 80.0
        elif rsi >= 72:
            momentum_bias = "overbought_exhaustion"
            score = 40.0
        elif rsi <= 28:
            momentum_bias = "oversold_exhaustion"
            score = 40.0
        elif macd_bullish:
            momentum_bias = "bullish"
            score = 70.0
        elif macd_bearish:
            momentum_bias = "bearish"
            score = 70.0

        explanation = (
            f"Momentum: {momentum_bias.upper()}. "
            f"Displacement ratio: {displacement_ratio:.2f}x average body. "
            f"RSI: {rsi:.1f}, MACD Hist: {macd_hist:.5f}."
        )

        return EngineResult(
            result=momentum_bias,
            confidence=score,
            explanation=explanation,
            metrics={
                "displacement_ratio": round(displacement_ratio, 2),
                "has_displacement": has_displacement,
                "bullish_bars_last_3": bullish_bars,
                "bearish_bars_last_3": bearish_bars,
                "rsi": round(rsi, 1),
                "macd_hist": round(macd_hist, 6)
            },
            validation_status="valid"
        )
