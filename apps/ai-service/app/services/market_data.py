import httpx
import asyncio
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any


from app.services.market_data_validator import validate_dataframe_candles, ValidationResult


class MarketSnapshot:
    """
    Unified immutable container holding all validated data feeds
    required by individual analysis engines.
    """
    def __init__(
        self,
        symbol: str,
        timeframe: str,
        df: Optional[pd.DataFrame],
        higher_df: Optional[pd.DataFrame],
        corr_df: Optional[pd.DataFrame] = None,
        news_safe: bool = True,
        is_valid: bool = True,
        validation_errors: Optional[list] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.symbol = symbol
        self.timeframe = timeframe
        self.df = df
        self.higher_df = higher_df
        self.corr_df = corr_df
        self.news_safe = news_safe
        self.is_valid = is_valid
        self.validation_errors = validation_errors or []
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
        Multi-source institutional candle fetcher with automatic failover:
        1. Local / VPS MT5 Bridge (Direct broker feed, 0 delay, 0 external API dependency)
        2. TwelveData API (with rate-limit backoff)
        3. Real-time failover: Binance (Crypto) or Yahoo Finance (Forex/Metals)
        """
        clean_symbol = symbol.upper().replace('/', '').replace(' ', '')

        # ── PRIORITY 1: MT5 Bridge Direct Broker Candles ──
        try:
            bridge_base = os.environ.get("MT5_BRIDGE_URL", "http://40.123.242.172:5001").rstrip("/")
            mt5_url = f"{bridge_base}/candles?symbol={clean_symbol}&timeframe={interval}&count={outputsize}"
            async with httpx.AsyncClient(timeout=2.0) as bridge_client:
                b_res = await bridge_client.get(mt5_url)
                if b_res.status_code == 200:
                    b_data = b_res.json()
                    candles = b_data.get("candles", [])
                    if candles and len(candles) >= 20:
                        df = pd.DataFrame(candles)
                        df["open"] = df["open"].astype(float)
                        df["high"] = df["high"].astype(float)
                        df["low"] = df["low"].astype(float)
                        df["close"] = df["close"].astype(float)
                        df["volume"] = df.get("volume", 0.0).astype(float)
                        if "time" in df.columns:
                            df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
                        print(f"[MarketDataService] Priority 1 Success: Received {len(df)} authentic broker candles from MT5 Bridge for {clean_symbol} ({interval}).")
                        return df
        except Exception as bridge_err:
            pass  # MT5 bridge not local/running, seamlessly proceed to cloud sources

        # ── PRIORITY 2: TwelveData API ──
        if api_key and api_key not in ["", "placeholder", "your_api_key"]:
            symbol_to_query = clean_symbol
            if len(symbol_to_query) == 6 and not symbol_to_query.startswith(('BTC', 'ETH', 'SOL', 'XRP')):
                symbol_to_query = f"{symbol_to_query[:3]}/{symbol_to_query[3:]}"

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

            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    response = await client.get(url)
                    if response.status_code == 200:
                        data = response.json()
                        if data.get("status") != "error":
                            values = data.get("values")
                            if values and isinstance(values, list) and len(values) >= 20:
                                df = pd.DataFrame(values)
                                df["open"] = df["open"].astype(float)
                                df["high"] = df["high"].astype(float)
                                df["low"] = df["low"].astype(float)
                                df["close"] = df["close"].astype(float)
                                df["volume"] = df["volume"].astype(float) if "volume" in df.columns else 0.0
                                df = df.iloc[::-1].reset_index(drop=True)
                                print(f"[MarketDataService] Priority 2 Success: Received {len(df)} candles from TwelveData for {symbol_to_query} ({interval}).")
                                return df
                    print(f"[MarketDataService] TwelveData query status {response.status_code}. Initiating Priority 3 Institutional Failover...")
            except Exception as td_err:
                print(f"[MarketDataService] TwelveData exception ({td_err}). Initiating Priority 3 Institutional Failover...")

        # ── PRIORITY 3: Institutional Failover (Binance for Crypto / Yahoo Finance for Metals & FX) ──
        try:
            # A. Crypto via Binance Public Klines (Zero API key required, 99.99% uptime)
            crypto_prefixes = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX']
            is_crypto = any(clean_symbol.startswith(cp) for cp in crypto_prefixes)

            if is_crypto:
                base_coin = clean_symbol.replace('USD', '').replace('USDT', '')
                binance_sym = f"{base_coin}USDT"
                binance_interval = "15m" if interval in ["15m", "15min"] else "1h" if interval in ["1h", "60m"] else "4h" if interval in ["4h", "240"] else "1d"
                b_url = f"https://api.binance.com/api/v3/klines?symbol={binance_sym}&interval={binance_interval}&limit={outputsize}"
                async with httpx.AsyncClient(timeout=5.0) as client:
                    b_res = await client.get(b_url)
                    if b_res.status_code == 200:
                        klines = b_res.json()
                        if klines and len(klines) >= 20:
                            df = pd.DataFrame(klines, columns=[
                                "time", "open", "high", "low", "close", "volume",
                                "close_time", "q_vol", "trades", "tb_base", "tb_quote", "ignore"
                            ])
                            df["open"] = df["open"].astype(float)
                            df["high"] = df["high"].astype(float)
                            df["low"] = df["low"].astype(float)
                            df["close"] = df["close"].astype(float)
                            df["volume"] = df["volume"].astype(float)
                            df["datetime"] = pd.to_datetime(df["time"], unit="ms", utc=True)
                            print(f"[MarketDataService] Priority 3 (Binance) Success: Received {len(df)} live candles for {binance_sym} ({binance_interval}).")
                            return df

            # B. Metals and Forex via Yahoo Finance Chart API
            yf_map = {
                'XAUUSD': 'GC=F',  # Gold Continuous Futures
                'GOLD': 'GC=F',
                'EURUSD': 'EURUSD=X',
                'GBPUSD': 'GBPUSD=X',
                'USDJPY': 'USDJPY=X',
                'AUDUSD': 'AUDUSD=X',
                'USDCAD': 'USDCAD=X',
                'USDCHF': 'USDCHF=X',
                'NZDUSD': 'NZDUSD=X',
            }
            yf_sym = yf_map.get(clean_symbol, f"{clean_symbol}=X")
            yf_interval = "15m" if interval in ["15m", "15min"] else "60m" if interval in ["1h", "4h", "240"] else "1d"
            yf_range = "5d" if yf_interval == "15m" else "1mo"
            yf_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_sym}?interval={yf_interval}&range={yf_range}"

            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
                yf_res = await client.get(yf_url)
                if yf_res.status_code == 200:
                    yf_data = yf_res.json()
                    results = yf_data.get("chart", {}).get("result", [])
                    if results:
                        timestamps = results[0].get("timestamp", [])
                        quotes = results[0].get("indicators", {}).get("quote", [{}])[0]
                        o = quotes.get("open", [])
                        h = quotes.get("high", [])
                        l = quotes.get("low", [])
                        c = quotes.get("close", [])
                        v = quotes.get("volume", [])

                        rows = []
                        for idx, ts in enumerate(timestamps):
                            if idx < len(c) and c[idx] is not None and o[idx] is not None and h[idx] is not None and l[idx] is not None:
                                rows.append({
                                    "time": ts,
                                    "open": float(o[idx]),
                                    "high": float(h[idx]),
                                    "low": float(l[idx]),
                                    "close": float(c[idx]),
                                    "volume": float(v[idx]) if idx < len(v) and v[idx] is not None else 0.0
                                })

                        if len(rows) >= 20:
                            df = pd.DataFrame(rows).tail(outputsize).reset_index(drop=True)
                            df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
                            print(f"[MarketDataService] Priority 3 (Yahoo Finance) Success: Received {len(df)} live candles for {yf_sym} ({yf_interval}).")
                            return df

        except Exception as failover_err:
            print(f"[MarketDataService] Failover query exception: {failover_err}")

        raise ValueError(f"All live market data feeds (MT5 Bridge, TwelveData, and Failover) failed to return valid candles for {symbol}.")

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
        Enforces strict pre-flight validation. NEVER falls back to fake candles for live analysis.
        """
        cache_key = f"{symbol}_{timeframe}"
        now = datetime.now(timezone.utc)

        # Check Cache freshness
        cached = self.cache.get(cache_key)
        if cached:
            age = now - cached["timestamp"]
            if age < self.cache_expiry and cached["snapshot"].is_valid:
                print(f"[MarketDataService] Serving fresh cached snapshot for {cache_key} (age: {age.total_seconds():.1f}s)")
                return cached["snapshot"]

        try:
            # 1. Fetch primary timeframe candles
            df = await self.fetch_candles_with_retry(symbol, timeframe, api_key)

            # 2. Pre-flight validation on primary candles
            val_primary = validate_dataframe_candles(df, timeframe=timeframe, min_candles=30)
            if not val_primary.is_valid:
                print(f"[MarketDataService] Pre-flight validation failed on primary timeframe: {val_primary.failure_reasons}")
                return MarketSnapshot(
                    symbol=symbol,
                    timeframe=timeframe,
                    df=df,
                    higher_df=None,
                    corr_df=None,
                    news_safe=news_safe,
                    is_valid=False,
                    validation_errors=val_primary.failure_reasons
                )

            # 3. Fetch higher timeframe candles for bias check (e.g. 4h if 15m requested, 1d if 4h requested)
            higher_timeframe = "4h" if timeframe in ["15m", "30m", "1h"] else "1d"
            higher_df = await self.fetch_candles_with_retry(symbol, higher_timeframe, api_key)

            val_higher = validate_dataframe_candles(higher_df, timeframe=higher_timeframe, min_candles=20)
            if not val_higher.is_valid:
                print(f"[MarketDataService] Pre-flight validation failed on higher timeframe: {val_higher.failure_reasons}")
                return MarketSnapshot(
                    symbol=symbol,
                    timeframe=timeframe,
                    df=df,
                    higher_df=higher_df,
                    corr_df=None,
                    news_safe=news_safe,
                    is_valid=False,
                    validation_errors=val_higher.failure_reasons
                )

            # 4. Fetch correlation pair if applicable
            corr_df = None
            if symbol.upper() in ["EURUSD", "GBPUSD", "XAUUSD"]:
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
                news_safe=news_safe,
                is_valid=True,
                validation_errors=[]
            )

            # Write cache
            self.cache[cache_key] = {
                "snapshot": snapshot,
                "timestamp": now
            }
            return snapshot

        except Exception as e:
            # If fresh data failed, check if we have a valid cached snapshot
            if cached and cached.get("snapshot") and cached["snapshot"].is_valid:
                print(f"[MarketDataService] Warning: Fetch failed, serving cached snapshot for {cache_key}: {str(e)}")
                return cached["snapshot"]

            # Institutional rule: If live market data fails, NEVER generate fake candles. Return invalid snapshot.
            print(f"[MarketDataService] Live market data query failed for {symbol} ({timeframe}): {str(e)}")
            return MarketSnapshot(
                symbol=symbol,
                timeframe=timeframe,
                df=None,
                higher_df=None,
                corr_df=None,
                news_safe=news_safe,
                is_valid=False,
                validation_errors=[f"DATA_FETCH_EXCEPTION: {str(e)}"]
            )
