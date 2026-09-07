"""
Deterministic SMC Engine - Layer 1:
Market Regime Filter (Trending, Range, Expansion, Compression).
"""

from typing import Dict, Any
import numpy as np
import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot
from app.services.indicators import calculate_ema, calculate_adx


class TrendQualityEngine(BaseEngine):
    """
    Layer 1: Classifies market regime into Trending, Range, Expansion, or Compression.
    Enforces systematic market regime awareness.
    """

    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        if df is None or len(df) < 30:
            return EngineResult(
                result="ranging",
                confidence=50.0,
                explanation="Market regime skipped: insufficient history.",
                metrics={},
                validation_status="incomplete"
            )

        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        opens = df["open"].values

        # 1. EMAs & Alignment
        ema9 = calculate_ema(df, min(9, len(df)-1)).values
        ema21 = calculate_ema(df, min(21, len(df)-1)).values
        ema_len50 = min(50, len(df)-1)
        ema50 = calculate_ema(df, ema_len50).values

        last_ema9 = ema9[-1]
        last_ema21 = ema21[-1]
        last_ema50 = ema50[-1]

        lookback_slope = min(5, len(df)-1)
        ema50_slope = ema50[-1] - ema50[-lookback_slope]

        bullish_align = last_ema9 > last_ema21 > last_ema50
        bearish_align = last_ema9 < last_ema21 < last_ema50

        # 2. ADX Trend Strength
        adx_series = calculate_adx(df)
        adx = float(adx_series.iloc[-1]) if not adx_series.empty else 20.0

        # 3. ATR & Volatility Compression / Expansion
        hl = highs - lows
        hc = np.abs(highs - np.roll(closes, 1))
        lc = np.abs(lows - np.roll(closes, 1))
        tr = np.maximum(hl, np.maximum(hc, lc))
        tr[0] = hl[0]
        recent_atr = float(np.mean(tr[-5:]))
        baseline_atr = float(np.mean(tr[-20:])) if len(tr) >= 20 else recent_atr
        atr_ratio = (recent_atr / baseline_atr) if baseline_atr > 0 else 1.0

        # 4. Regime Classification
        if atr_ratio >= 1.4:
            regime = "expansion"
            score = 80.0
            explanation = f"EXPANSION Regime: Volatility expanded {atr_ratio:.1f}x over baseline. Trend expansion in progress."
        elif atr_ratio <= 0.65:
            regime = "compression"
            score = 65.0
            explanation = f"COMPRESSION Regime: Volatility compressed ({atr_ratio:.1f}x baseline). Expect imminent liquidity breakout."
        elif bullish_align and ema50_slope > 0 and adx >= 22:
            regime = "trending_bullish"
            score = 88.0 if adx > 28 else 78.0
            explanation = f"TRENDING BULLISH Regime: Aligned EMAs with strong directional momentum (ADX: {adx:.1f})."
        elif bearish_align and ema50_slope < 0 and adx >= 22:
            regime = "trending_bearish"
            score = 88.0 if adx > 28 else 78.0
            explanation = f"TRENDING BEARISH Regime: Aligned EMAs with strong directional momentum (ADX: {adx:.1f})."
        else:
            regime = "ranging"
            score = 50.0
            explanation = f"RANGING / CHOPPY Regime: Low trend commitment (ADX: {adx:.1f}). Fading extremes or waiting for breakout."

        return EngineResult(
            result=regime,
            confidence=score,
            explanation=explanation,
            metrics={
                "regime": regime,
                "adx": round(adx, 1),
                "atr_ratio": round(atr_ratio, 2),
                "ema50_slope": round(float(ema50_slope), 6),
                "aligned": bullish_align or bearish_align
            },
            validation_status="valid"
        )
