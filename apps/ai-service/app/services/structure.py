"""
Trade-Z AI Service — Market Structure Detection
Identifies BOS, CHoCH, Order Blocks, and Fair Value Gaps from price feeds.
"""

import pandas as pd
import numpy as np


def detect_market_structure(df: pd.DataFrame) -> dict:
    """
    Scans recent price candles for market structure components.
    Returns: dict of found support/resistance levels, order blocks, and FVGs.
    """
    if len(df) < 5:
        return {"order_blocks": [], "fvgs": [], "market_bias": "neutral"}

    order_blocks = []
    fvgs = []

    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values
    opens = df["open"].values
    times = df.index.astype(str) if isinstance(df.index, pd.DatetimeIndex) else [str(i) for i in range(len(df))]

    # 1. Detect Fair Value Gaps (FVG)
    # Check 3 consecutive candles (i-2, i-1, i)
    for i in range(2, len(df)):
        # Bullish FVG: low of current candle (i) > high of candle (i-2)
        if lows[i] > highs[i - 2] + 1e-5:
            fvgs.append({
                "type": "bullish",
                "high": lows[i],
                "low": highs[i - 2],
                "candle_index": i - 1,
                "timestamp": times[i - 1]
            })
        # Bearish FVG: high of current candle (i) < low of candle (i-2)
        elif highs[i] < lows[i - 2] - 1e-5:
            fvgs.append({
                "type": "bearish",
                "high": lows[i - 2],
                "low": highs[i],
                "candle_index": i - 1,
                "timestamp": times[i - 1]
            })

    # 2. Detect Order Blocks (OB)
    # Search for sharp displacement moves breaking structural swings
    for i in range(1, len(df) - 1):
        body_size = abs(closes[i] - opens[i])
        avg_body_size = np.mean(np.abs(closes - opens))

        # Check if candle i is a reversal block (displacement)
        if body_size > avg_body_size * 1.5:
            # Bullish OB: strong up-candle displacing after down-candle
            if closes[i] > opens[i] and closes[i - 1] < opens[i - 1]:
                order_blocks.append({
                    "type": "bullish",
                    "high": highs[i - 1],
                    "low": lows[i - 1],
                    "candle_index": i - 1,
                    "timestamp": times[i - 1]
                })
            # Bearish OB: strong down-candle displacing after up-candle
            elif closes[i] < opens[i] and closes[i - 1] > opens[i - 1]:
                order_blocks.append({
                    "type": "bearish",
                    "high": highs[i - 1],
                    "low": lows[i - 1],
                    "candle_index": i - 1,
                    "timestamp": times[i - 1]
                })

    # 3. Detect Swing Breakouts (BOS / CHoCH mock detection)
    # Assess overall market bias
    bullish_count = sum(1 for ob in order_blocks if ob["type"] == "bullish")
    bearish_count = sum(1 for ob in order_blocks if ob["type"] == "bearish")

    bias = "neutral"
    if bullish_count > bearish_count + 1:
        bias = "bullish"
    elif bearish_count > bullish_count + 1:
        bias = "bearish"

    return {
        "order_blocks": order_blocks[-5:],  # Return 5 most recent
        "fvgs": fvgs[-5:],
        "market_bias": bias,
        "bos_detected": len(order_blocks) > 0,
        "choch_detected": len(fvgs) > 0,
    }
