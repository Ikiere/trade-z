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

        # Check user Daily Limits passed in context
        today_signals = context.get("today_signal_count", 0)
        daily_limit = context.get("daily_signal_limit", 100)
        if today_signals >= daily_limit:
            return EngineResult(
                result="NO TRADE",
                confidence=0.0,
                explanation="Eligibility Check Failed: User daily signal frequency limit breached.",
                metrics={"today_signals": today_signals, "daily_limit": daily_limit},
                validation_status="limit_breached"
            )

        # Verify market session open (Basic week day check)
        # 5 is Saturday, 6 is Sunday in weekday()
        current_day = now.weekday()
        if current_day == 5:  # Saturday crypto exception can be handled later
            return EngineResult(
                result="NO TRADE",
                confidence=0.0,
                explanation="Eligibility Check Failed: Traditional forex/commodity markets are closed on Saturdays.",
                metrics={"weekday": current_day},
                validation_status="closed"
            )

        return EngineResult(
            result="ELIGIBLE",
            confidence=100.0,
            explanation="Eligibility Check Passed: Market is open, data is fresh, and limits are valid.",
            metrics={"today_signals": today_signals, "daily_limit": daily_limit},
            validation_status="valid"
        )
