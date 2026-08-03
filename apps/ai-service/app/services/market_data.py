import httpx
import asyncio
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any


class MarketSnapshot:
    """
    Unified immutable container holding all validated data feeds
    required by individual analysis engines.
    """
    def __init__(
        self,
        symbol: str,
        timeframe: str,
        df: pd.DataFrame,
        higher_df: pd.DataFrame,
        corr_df: Optional[pd.DataFrame] = None,
        news_safe: bool = True,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.symbol = symbol
        self.timeframe = timeframe
        self.df = df
        self.higher_df = higher_df
        self.corr_df = corr_df
        self.news_safe = news_safe
        self.timestamp = datetime.now(timezone.utc)
        self.metadata = metadata or {}


class MarketDataService:
    """
    Centralized market data manager querying TwelveData once,
    handling rate-limits, validation, and serving normalized snapshots.
    """
    def __init__(self, cache_expiry_seconds: int = 300):
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.cache_expiry = timedelta(seconds=cache_expiry_seconds)

    async def fetch_candles_with_retry(
        self,
        symbol: str,
        interval: str,
        api_key: str,
        outputsize: int = 60
    ) -> pd.DataFrame:
        """
        Queries TwelveData candles with exponential backoff and input verification.
        """
        # Normalize symbol formatting
        symbol_to_query = symbol.upper()
        if len(symbol_to_query) == 6:
            symbol_to_query = f"{symbol_to_query[:3]}/{symbol_to_query[3:]}"

        # Map timeframe codes to TwelveData intervals
        td_interval = interval
        if interval == "15m":
            td_interval = "15min"
        elif interval == "30m":
            td_interval = "30min"
        elif interval == "1h":
            td_interval = "1h"
        elif interval in ["4h", "240"]:
            td_interval = "4h"
        elif interval == "1d":
            td_interval = "1day"

        url = f"https://api.twelvedata.com/time_series?symbol={symbol_to_query}&interval={td_interval}&outputsize={outputsize}&apikey={api_key}"

        max_retries = 3
        backoff = 1.5

        async with httpx.AsyncClient(timeout=10.0) as client:
            for attempt in range(max_retries):
                try:
                    response = await client.get(url)
                    if response.status_code == 429:
                        print(f"[TwelveData] Rate limit hit. Backoff retry {attempt + 1}...")
                        await asyncio.sleep(backoff * (attempt + 1))
                        continue

                    if response.status_code != 200:
                        raise ValueError(f"TwelveData returned HTTP {response.status_code}")

                    data = response.json()
                    if data.get("status") == "error":
                        msg = data.get("message", "Unknown API error")
                        raise ValueError(f"TwelveData API Error: {msg}")

                    values = data.get("values")
                    if not values or not isinstance(values, list):
                        raise ValueError("TwelveData returned empty candle series.")

                    # Convert to pandas DataFrame and sanitize
                    df = pd.DataFrame(values)
                    df["open"] = df["open"].astype(float)
                    df["high"] = df["high"].astype(float)
                    df["low"] = df["low"].astype(float)
                    df["close"] = df["close"].astype(float)

                    if "volume" in df.columns:
                        df["volume"] = df["volume"].astype(float)
                    else:
                        df["volume"] = 0.0

                    # Standardize sorting (oldest first)
                    df = df.iloc[::-1].reset_index(drop=True)
                    return df

                except httpx.RequestError as req_err:
                    if attempt == max_retries - 1:
                        raise ValueError(f"Network error contacting TwelveData: {str(req_err)}")
                    await asyncio.sleep(backoff * (attempt + 1))

        raise ValueError("TwelveData request failed after retries.")

    async def get_market_snapshot(
        self,
        symbol: str,
        timeframe: str,
        api_key: str,
        news_safe: bool = True
    ) -> MarketSnapshot:
        """
        Builds a comprehensive MarketSnapshot. Uses cached data if within freshness threshold,
        otherwise updates feeds from TwelveData API.
        """
        cache_key = f"{symbol}_{timeframe}"
        now = datetime.now(timezone.utc)

        # Check Cache freshness
        cached = self.cache.get(cache_key)
        if cached:
            age = now - cached["timestamp"]
            if age < self.cache_expiry:
                print(f"[MarketDataService] Serving fresh cached snapshot for {cache_key} (age: {age.total_seconds():.1f}s)")
                return cached["snapshot"]

        try:
            # 1. Fetch primary timeframe candles
            df = await self.fetch_candles_with_retry(symbol, timeframe, api_key)

            # 2. Fetch higher timeframe candles for bias check (e.g. 4h if 15m requested, 1d if 4h requested)
            higher_timeframe = "4h" if timeframe in ["15m", "30m", "1h"] else "1d"
            higher_df = await self.fetch_candles_with_retry(symbol, higher_timeframe, api_key)

            # 3. Fetch correlation pair if applicable (e.g., DXY or USDX)
            corr_df = None
            if symbol.upper() in ["EURUSD", "GBPUSD", "XAUUSD"]:
                # Try fetching EURUSD as USD alignment indicator if scanning Gold, or query DXY index
                try:
                    corr_df = await self.fetch_candles_with_retry("USDJPY", timeframe, api_key, outputsize=30)
                except Exception as corr_exc:
                    print(f"[MarketDataService] Non-fatal correlation query skip: {str(corr_exc)}")

            snapshot = MarketSnapshot(
                symbol=symbol,
                timeframe=timeframe,
                df=df,
                higher_df=higher_df,
                corr_df=corr_df,
                news_safe=news_safe
            )

            # Write cache
            self.cache[cache_key] = {
                "snapshot": snapshot,
                "timestamp": now
            }
            return snapshot

        except Exception as e:
            # If fresh data failed, fall back to any stale cache if available
            if cached:
                print(f"[MarketDataService] Warning: Updating failed. Falling back to stale cache for {cache_key}: {str(e)}")
                return cached["snapshot"]
            raise ValueError(f"Market data unavailable: {str(e)}")
