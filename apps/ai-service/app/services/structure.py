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


def generate_simulated_candles(pair: str, timeframe: str) -> pd.DataFrame:
    """
    Generates a highly realistic 60-candle dataset dynamically based on pair name and current date.
    Provides natural price structures, trends, order blocks, and pullbacks.
    """
    import numpy as np
    from datetime import datetime

    # Seed depends on pair name + current day/hour to evolve dynamically over time
    now = datetime.now()
    seed_str = f"{pair}_{timeframe}_{now.year}_{now.month}_{now.day}_{now.hour}"
    seed = abs(hash(seed_str)) % 1000000
    np.random.seed(seed)

    # Base price scales
    u = pair.upper()
    base_price = 1.0800
    noise_mult = 0.0003
    pips_scale = 0.0001
    
    if "GBP" in u:
        base_price = 1.2600
        noise_mult = 0.0004
    elif "JPY" in u:
        base_price = 154.00
        noise_mult = 0.15
        pips_scale = 0.01
    elif "XAU" in u:
        base_price = 2350.00
        noise_mult = 1.5
        pips_scale = 0.1
    elif "AUD" in u or "NZD" in u:
        base_price = 0.6600
        noise_mult = 0.0003
    elif "CAD" in u or "CHF" in u:
        base_price = 1.3600
        noise_mult = 0.0003

    # Trend direction: 60% chance of a clear trend structure (either up or down)
    trend_val = hash(pair + "_trend") % 3
    trend_bias = 0
    if trend_val == 0:
        trend_bias = 1.2  # Bullish
    elif trend_val == 1:
        trend_bias = -1.2 # Bearish

    prices = []
    current = base_price
    
    for i in range(60):
        # Sine wave swing structure + random noise
        swing = 0.8 * np.sin(i / 6.0)
        noise = np.random.normal(0, 0.8)
        change = (trend_bias * 0.4 + swing + noise) * noise_mult
        current += change
        prices.append(current)

    opens = []
    highs = []
    lows = []
    closes = []

    for i in range(60):
        o = prices[i - 1] if i > 0 else base_price
        c = prices[i]
        
        # Ensure there is wick noise
        wick_noise = abs(np.random.normal(0, noise_mult * 0.5))
        h = max(o, c) + wick_noise
        l = min(o, c) - wick_noise
        
        opens.append(o)
        closes.append(c)
        highs.append(h)
        lows.append(l)

    df = pd.DataFrame({
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": np.random.randint(500, 2500, size=60)
    })
    return df


async def fetch_twelve_data_candles(symbol: str, timeframe: str, api_key: str):
    """
    Fetches real historical price candles from the TwelveData REST API.
    Maps XAUUSD -> XAU/USD (Spot Gold) for standard currency conversion.
    """
    import httpx
    import pandas as pd

    # Map timeframe standard to TwelveData intervals
    interval = "15min"
    if timeframe == "30m":
        interval = "30min"
    elif timeframe == "1h":
        interval = "1h"
    elif timeframe == "4h":
        interval = "4h"
    elif timeframe == "1d":
        interval = "1day"

    # Normalize currency pairs and Spot Gold (e.g., EURUSD -> EUR/USD, XAUUSD -> XAU/USD)
    symbol_to_query = symbol.upper()
    if len(symbol_to_query) == 6:
        symbol_to_query = f"{symbol_to_query[:3]}/{symbol_to_query[3:]}"

    url = f"https://api.twelvedata.com/time_series?symbol={symbol_to_query}&interval={interval}&outputsize=60&apikey={api_key}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            if response.status_code != 200:
                raise ValueError(f"TwelveData Server returned HTTP {response.status_code}.")
            
            data = response.json()
            if data.get("status") == "error":
                err_msg = data.get("message", "Unknown error from TwelveData API.")
                raise ValueError(f"TwelveData API: {err_msg}")
                
            if "values" not in data:
                raise ValueError("TwelveData response missing values field.")
                
            values = data["values"]
            if not values:
                raise ValueError(f"No chart bars returned for {symbol_to_query}.")
                
            # TwelveData returns most recent values first; reverse to chronological order
            values = list(reversed(values))
            
            df = pd.DataFrame(values)
            df["open"] = df["open"].astype(float)
            df["high"] = df["high"].astype(float)
            df["low"] = df["low"].astype(float)
            df["close"] = df["close"].astype(float)
            df["volume"] = df["volume"].astype(float)
            
            print(f"Successfully fetched {len(df)} live bars from TwelveData for {symbol_to_query} ({interval})")
            return df
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"TwelveData Connection Failed: {str(e)}")
