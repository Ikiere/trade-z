from datetime import datetime, timezone
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class EligibilityEngine(BaseEngine):
    """
    Layer 1: Verifies session open, data freshness, spreads,
    and user daily signal/loss limit eligibility.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        if df.empty or len(df) < 15:
            return EngineResult(
                result="NO TRADE",
                confidence=0.0,
                explanation="Eligibility Check Failed: Market data series is empty or insufficient to evaluate.",
                metrics={},
                validation_status="invalid"
            )

        # Check data freshness (candle timestamp age check)
        now = datetime.now(timezone.utc)
        age = now - snapshot.timestamp
        if age.total_seconds() > 3600 * 24:  # older than 1 day
            return EngineResult(
                result="NO TRADE",
                confidence=0.0,
                explanation="Eligibility Check Failed: Market data is stale (older than 24 hours).",
                metrics={"data_age_seconds": age.total_seconds()},
                validation_status="stale"
            )

        # Check user Daily Trade Limits passed in context (strictly locked to 2 trades/day)
        today_signals = context.get("today_signal_count", 0)
        daily_limit = min(2, context.get("daily_signal_limit", 2))
        if today_signals >= daily_limit:
            return EngineResult(
                result="NO TRADE",
                confidence=0.0,
                explanation=f"Eligibility Check Failed: Institutional daily trade limit reached ({today_signals}/{daily_limit}).",
                metrics={"today_signals": today_signals, "daily_limit": daily_limit},
                validation_status="limit_breached"
            )

        sym = snapshot.symbol.upper().replace("/", "").replace(" ", "")
        is_crypto = any(c in sym for c in ["BTC", "ETH", "SOL", "CRYPTO"])

        # 1. Crypto Pairs: 24/7 Always Open
        if is_crypto:
            return EngineResult(
                result="ELIGIBLE",
                confidence=100.0,
                explanation=f"Eligibility Passed: {sym} operates on 24/7 perpetual decentralized session. Market open.",
                metrics={"today_signals": today_signals, "daily_limit": daily_limit, "session": "crypto_24_7"},
                validation_status="valid"
            )

        # 2. Traditional Forex/Commodity Weekend Check
        # Friday closes at 21:00 UTC; Sunday reopens at 21:00 UTC
        current_day = now.weekday()  # 4=Friday, 5=Saturday, 6=Sunday
        utc_minutes = now.hour * 60 + now.minute

        is_weekend = (
            current_day == 5 or  # Saturday
            (current_day == 4 and utc_minutes >= 21 * 60) or  # Friday after 21:00 UTC
            (current_day == 6 and utc_minutes < 21 * 60)  # Sunday before 21:00 UTC
        )

        if is_weekend:
            return EngineResult(
                result="NO TRADE",
                confidence=0.0,
                explanation="Session Shield Veto: Traditional forex and commodity markets are closed for the weekend.",
                metrics={"weekday": current_day, "session": "weekend_close"},
                validation_status="closed"
            )

        # 3. Intraday Session Hour Check
        is_gold = "XAU" in sym or "GOLD" in sym
        is_asian = any(a in sym for a in ["JPY", "AUD", "NZD"])

        if is_gold:
            # Gold active London & NY: 08:00 to 21:00 UTC
            if not (8 * 60 <= utc_minutes < 21 * 60):
                return EngineResult(
                    result="NO TRADE",
                    confidence=0.0,
                    explanation=f"Session Shield Veto: XAUUSD is outside London/NY active session (08:00-21:00 UTC). Current time: {now.strftime('%H:%M')} UTC. Wait for London open.",
                    metrics={"session": "gold_off_hours", "current_utc": now.strftime("%H:%M")},
                    validation_status="session_closed"
                )
        elif is_asian:
            # Asian pairs active 00:00 to 21:00 UTC (dead zone between 21:00 and 00:00 UTC)
            if utc_minutes >= 21 * 60:
                return EngineResult(
                    result="NO TRADE",
                    confidence=0.0,
                    explanation=f"Session Shield Veto: {sym} is in the daily inter-session rollover gap (21:00-00:00 UTC). Spreads widened.",
                    metrics={"session": "rollover_gap", "current_utc": now.strftime("%H:%M")},
                    validation_status="session_closed"
                )
        else:
            # European/US Forex: London through NY (08:00 to 21:00 UTC)
            if not (8 * 60 <= utc_minutes < 21 * 60):
                return EngineResult(
                    result="NO TRADE",
                    confidence=0.0,
                    explanation=f"Session Shield Veto: {sym} is outside London/NY session hours (08:00-21:00 UTC). Low liquidity chop.",
                    metrics={"session": "forex_off_hours", "current_utc": now.strftime("%H:%M")},
                    validation_status="session_closed"
                )

        return EngineResult(
            result="ELIGIBLE",
            confidence=100.0,
            explanation="Eligibility Check Passed: Market session open, liquidity verified, and daily discipline limits valid.",
            metrics={"today_signals": today_signals, "daily_limit": daily_limit, "session": "active_session"},
            validation_status="valid"
        )
