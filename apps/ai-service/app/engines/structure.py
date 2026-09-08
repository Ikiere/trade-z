"""
Deterministic SMC Engine - Layer 5 & Layer 6:
Market Structure Transitions (BOS vs CHoCH vs MSS) & Dealing Range Modeling.
"""

from typing import List, Tuple, Optional
import numpy as np
import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class MarketStructureEngine(BaseEngine):
    """
    Tracks swing points, structural transitions (BOS, CHoCH, MSS),
    and maps the Dealing Range (Equilibrium 50%, OTE 62%-79%).
    """

    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        if df is None or len(df) < 20:
            return EngineResult(
                result="neutral",
                confidence=50.0,
                explanation="Insufficient candle depth to map market structure.",
                metrics={},
                validation_status="incomplete"
            )

        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        opens = df["open"].values

        # 1. Identify Valid Fractal Swing Points (3-bar left/right pivot)
        swing_highs: List[Tuple[int, float]] = []
        swing_lows: List[Tuple[int, float]] = []

        window = 3
        for i in range(window, len(df) - window):
            if highs[i] == max(highs[i - window : i + window + 1]):
                swing_highs.append((i, float(highs[i])))
            if lows[i] == min(lows[i - window : i + window + 1]):
                swing_lows.append((i, float(lows[i])))

        if not swing_highs:
            swing_highs.append((int(np.argmax(highs)), float(highs.max())))
        if not swing_lows:
            swing_lows.append((int(np.argmin(lows)), float(lows.min())))

        last_high_idx, last_swing_high = swing_highs[-1]
        prev_high_idx, prev_swing_high = swing_highs[-2] if len(swing_highs) > 1 else swing_highs[-1]

        last_low_idx, last_swing_low = swing_lows[-1]
        prev_low_idx, prev_swing_low = swing_lows[-2] if len(swing_lows) > 1 else swing_lows[-1]

        current_price = float(closes[-1])
        current_open = float(opens[-1])
        body_size = abs(current_price - current_open)

        # 2. Prior structural trend classification
        prior_trend = "neutral"
        if last_swing_high > prev_swing_high and last_swing_low > prev_swing_low:
            prior_trend = "bullish"
        elif last_swing_high < prev_swing_high and last_swing_low < prev_swing_low:
            prior_trend = "bearish"

        # 3. Detect Structural Transitions: BOS vs CHoCH vs MSS
        # Confirmation requires a candle body close past the swing level, not merely a wick
        structure_event = "none"
        bias = "neutral"
        score = 50.0

        # Bullish Breakout
        if current_price > last_swing_high:
            if prior_trend == "bullish":
                structure_event = "bullish_bos"
                bias = "bullish"
                score = 80.0
            else:
                # Prior trend was bearish or neutral, breaking above last swing high is a Change of Character (CHoCH)
                structure_event = "bullish_choch"
                bias = "bullish"
                score = 85.0
        # Bearish Breakdown
        elif current_price < last_swing_low:
            if prior_trend == "bearish":
                structure_event = "bearish_bos"
                bias = "bearish"
                score = 80.0
            else:
                # Prior trend was bullish or neutral, breaking below last swing low is a Change of Character (CHoCH)
                structure_event = "bearish_choch"
                bias = "bearish"
                score = 85.0
        else:
            # Inside prior dealing range
            bias = prior_trend
            score = 60.0 if prior_trend != "neutral" else 50.0

        # 4. Dealing Range & Premium/Discount Modeling (Layer 6)
        # Defined by the most significant recent dealing high and dealing low
        range_high = max(last_swing_high, prev_swing_high)
        range_low = min(last_swing_low, prev_swing_low)
        total_range = range_high - range_low

        if total_range > 0:
            equilibrium = range_low + (total_range * 0.5)
            # OTE (Optimal Trade Entry): 62% to 79% retracement
            bullish_ote_low = range_low + (total_range * 0.21)  # 79% retracement from high
            bullish_ote_high = range_low + (total_range * 0.38)  # 62% retracement from high

            bearish_ote_low = range_low + (total_range * 0.62)   # 62% retracement from low
            bearish_ote_high = range_low + (total_range * 0.79)  # 79% retracement from low

            pct_position = (current_price - range_low) / total_range

            if pct_position < 0.38:
                zone = "deep_discount"
            elif pct_position < 0.50:
                zone = "discount"
            elif pct_position <= 0.62:
                zone = "equilibrium"
            elif pct_position <= 0.79:
                zone = "premium"
            else:
                zone = "deep_premium"
        else:
            equilibrium = current_price
            zone = "equilibrium"
            pct_position = 0.5

        # Refine score based on institutional confluence:
        # A bullish BOS that has already chased deep into premium has higher failure risk (re-test needed)
        if structure_event in ["bullish_bos", "bullish_choch"] and zone in ["premium", "deep_premium"]:
            score = max(55.0, score - 15.0)  # penalize chasing breakout into premium
        elif structure_event in ["bearish_bos", "bearish_choch"] and zone in ["discount", "deep_discount"]:
            score = max(55.0, score - 15.0)  # penalize chasing breakdown into discount
        elif bias == "bullish" and zone in ["discount", "deep_discount"] and structure_event != "none":
            score = min(92.0, score + 10.0)  # discount pullback after structural confirmation
        elif bias == "bearish" and zone in ["premium", "deep_premium"] and structure_event != "none":
            score = min(92.0, score + 10.0)  # premium pullback after structural confirmation

        explanation = (
            f"Market Structure: {structure_event.upper() if structure_event != 'none' else prior_trend.upper() + ' RANGE'}. "
            f"Price at {current_price:.5f} is in {zone.upper()} ({pct_position*100.0:.1f}% of Dealing Range)."
        )

        return EngineResult(
            result=bias,
            confidence=round(score, 1),
            explanation=explanation,
            metrics={
                "swing_high": float(last_swing_high),
                "swing_low": float(last_swing_low),
                "range_high": float(range_high),
                "range_low": float(range_low),
                "equilibrium": float(equilibrium),
                "trading_zone": zone,
                "pct_position": round(float(pct_position), 4),
                "structure_event": structure_event,
                "prior_trend": prior_trend
            },
            validation_status="valid"
        )
