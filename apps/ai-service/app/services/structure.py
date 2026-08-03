"""
Trade-Z AI Service — Market Structure Detection
Identifies BOS, CHoCH, Order Blocks, and Fair Value Gaps from price feeds.
"""

import pandas as pd
import numpy as np


def detect_market_structure(df: pd.DataFrame) -> dict:
    """
    Performs institutional-grade Smart Money Concepts (SMC) structure detection
    and multi-timeframe EMA alignment check on actual data.
    """
    if len(df) < 15:
        return {
            "order_blocks": [],
            "fvgs": [],
            "market_bias": "neutral",
            "bos_detected": False,
            "choch_detected": False,
            "latest_structure_break": "none"
        }

    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values
    opens = df["open"].values
    times = df.index.astype(str) if isinstance(df.index, pd.DatetimeIndex) else [str(i) for i in range(len(df))]

    # 1. Compute EMA Trends (9, 21, 50)
    # EMA 9, 21, and 50 are standard institutional trend filters
    ema9 = df["close"].ewm(span=9, adjust=False).mean().values
    ema21 = df["close"].ewm(span=21, adjust=False).mean().values
    ema50 = df["close"].ewm(span=50, adjust=False).mean().values

    # Latest EMA values
    last_ema9 = ema9[-1]
    last_ema21 = ema21[-1]
    last_ema50 = ema50[-1]

    # EMA Alignment
    ema_bullish = last_ema9 > last_ema21 > last_ema50
    ema_bearish = last_ema9 < last_ema21 < last_ema50

    # 2. Identify local swings (lookback window of 3 candles on each side)
    swing_highs = []
    swing_lows = []
    
    for i in range(3, len(df) - 3):
        # Local Swing High
        if highs[i] == max(highs[i-3:i+4]):
            swing_highs.append((i, highs[i]))
        # Local Swing Low
        if lows[i] == min(lows[i-3:i+4]):
            swing_lows.append((i, lows[i]))

    # 3. Detect BOS (Break of Structure) and CHoCH (Change of Character)
    bos_detected = False
    choch_detected = False
    latest_structure_break = "none"

    if swing_highs and swing_lows:
        # Latest swing levels
        last_high_idx, last_high_val = swing_highs[-1]
        last_low_idx, last_low_val = swing_lows[-1]
        
        # Check recent price breakouts
        recent_close = closes[-1]
        
        # Bullish Breakout (BOS of latest swing high)
        if recent_close > last_high_val:
            bos_detected = True
            latest_structure_break = "bullish_bos"
        # Bearish Breakout (BOS of latest swing low)
        elif recent_close < last_low_val:
            bos_detected = True
            latest_structure_break = "bearish_bos"
            
        # CHoCH detection: Break of the opposite swing point relative to the primary trend direction
        # If trend is bearish but we break the latest high -> Bullish CHoCH (reversal)
        if ema_bearish and recent_close > last_high_val:
            choch_detected = True
            latest_structure_break = "bullish_choch"
        # If trend is bullish but we break the latest low -> Bearish CHoCH (reversal)
        elif ema_bullish and recent_close < last_low_val:
            choch_detected = True
            latest_structure_break = "bearish_choch"

    # 4. Detect FVGs (Fair Value Gaps)
    fvgs = []
    for i in range(2, len(df)):
        if lows[i] > highs[i - 2] + 1e-5:
            fvgs.append({
                "type": "bullish",
                "high": lows[i],
                "low": highs[i - 2],
                "candle_index": i - 1,
                "timestamp": times[i - 1]
            })
        elif highs[i] < lows[i - 2] - 1e-5:
            fvgs.append({
                "type": "bearish",
                "high": lows[i - 2],
                "low": highs[i],
                "candle_index": i - 1,
                "timestamp": times[i - 1]
            })

    # 5. Detect displacement Order Blocks (OB)
    order_blocks = []
    body_sizes = np.abs(closes - opens)
    avg_body = np.mean(body_sizes)
    
    for i in range(1, len(df) - 1):
        if body_sizes[i] > avg_body * 1.5:
            if closes[i] > opens[i] and closes[i-1] < opens[i-1]:
                order_blocks.append({
                    "type": "bullish",
                    "high": highs[i - 1],
                    "low": lows[i - 1],
                    "candle_index": i - 1,
                    "timestamp": times[i - 1]
                })
            elif closes[i] < opens[i] and closes[i-1] > opens[i-1]:
                order_blocks.append({
                    "type": "bearish",
                    "high": highs[i - 1],
                    "low": lows[i - 1],
                    "candle_index": i - 1,
                    "timestamp": times[i - 1]
                })

    # 6. Conclude Trend Bias
    bias = "neutral"
    if ema_bullish or latest_structure_break in ["bullish_bos", "bullish_choch"]:
        bias = "bullish"
    elif ema_bearish or latest_structure_break in ["bearish_bos", "bearish_choch"]:
        bias = "bearish"

    return {
        "order_blocks": order_blocks[-5:],
        "fvgs": fvgs[-5:],
        "market_bias": bias,
        "bos_detected": bos_detected,
        "choch_detected": choch_detected,
        "latest_structure_break": latest_structure_break
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
            
            if "volume" in df.columns:
                df["volume"] = df["volume"].astype(float)
            else:
                df["volume"] = 0.0
            
            print(f"Successfully fetched {len(df)} live bars from TwelveData for {symbol_to_query} ({interval})")
            return df
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"TwelveData Connection Failed: {str(e)}")
