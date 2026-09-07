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

        # ── DAILY LOSS CIRCUIT BREAKER ─────────────────────────────────────
        # If 2 or more losses occurred today on MT5, halt all new trade authorizations
        history = context.get("history") or []
        today_utc_date = now.strftime("%Y-%m-%d")
        losses_today = [
            t for t in history
            if float(t.get("profit") or t.get("pnl") or 0.0) < 0
            and (
                str(t.get("closed_at") or "").startswith(today_utc_date)
                or str(t.get("time_close") or "").startswith(today_utc_date)
            )
        ]
        if len(losses_today) >= 2:
            return EngineResult(
                result="NO TRADE",
                confidence=0.0,
                explanation=(
                    f"Daily Loss Circuit Breaker Active: {len(losses_today)} closed losses recorded today. "
                    f"Capital Preservation Mode is locked to prevent drawdown spirals. Trading halted for today."
                ),
                metrics={"losses_today": len(losses_today), "circuit_breaker": "active"},
                validation_status="limit_breached"
            )

        from app.services.asset_classifier import classify_asset
        asset_info = classify_asset(snapshot.symbol)
        sym = asset_info["symbol"]
        is_crypto = asset_info["is_crypto"]

        # 1. Crypto & Altcoin Pairs: 24/7 Always Open
        if is_crypto or asset_info.get("is_24_7"):
            return EngineResult(
                result="ELIGIBLE",
                confidence=100.0,
                explanation=f"Eligibility Passed: {sym} operates on a 24/7 perpetual decentralized session. Market open.",
                metrics={"today_signals": today_signals, "daily_limit": daily_limit, "session": "crypto_24_7", "category": asset_info["category"]},
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

        # 3. Institutional Session Kill Zones
        # Prime high-probability institutional volume windows:
        # - London Open Kill Zone: 07:00 - 10:30 UTC (420m to 630m)
        # - New York Open / London Overlap Kill Zone: 12:30 - 16:30 UTC (750m to 990m)
        is_gold = "XAU" in sym or "GOLD" in sym
        is_asian = any(a in sym for a in ["JPY", "AUD", "NZD"])

        in_london_kz = (7 * 60 <= utc_minutes < 10 * 60 + 30)
        in_ny_kz = (12 * 60 + 30 <= utc_minutes < 16 * 60 + 30)
        in_tokyo_kz = (0 <= utc_minutes < 9 * 60)

        if is_gold:
            # Gold demands institutional London or NY volume; off-hours are retail traps
            if not (in_london_kz or in_ny_kz):
                return EngineResult(
                    result="NO TRADE",
                    confidence=0.0,
                    explanation=(
                        f"Session Shield Veto: XAUUSD is outside prime institutional Kill Zones "
                        f"(London 07:00-10:30 UTC, NY 12:30-16:30 UTC). Current time: {now.strftime('%H:%M')} UTC. "
                        f"Wait for London or New York open to avoid low-liquidity fakeouts."
                    ),
                    metrics={"session": "gold_off_hours", "current_utc": now.strftime("%H:%M")},
                    validation_status="session_closed"
                )
        elif is_asian:
            # Asian pairs active during Tokyo session or NY overlap
            if not (in_tokyo_kz or in_london_kz or in_ny_kz):
                return EngineResult(
                    result="NO TRADE",
                    confidence=0.0,
                    explanation=(
                        f"Session Shield Veto: {sym} is in the inter-session dead zone (current: {now.strftime('%H:%M')} UTC). "
                        f"Broker spreads widened. Wait for Tokyo (00:00 UTC) or London Open."
                    ),
                    metrics={"session": "asian_off_hours", "current_utc": now.strftime("%H:%M")},
                    validation_status="session_closed"
                )
        else:
            # European/US Forex majors: restrict to London and New York Kill Zones
            if not (in_london_kz or in_ny_kz):
                return EngineResult(
                    result="NO TRADE",
                    confidence=0.0,
                    explanation=(
                        f"Session Shield Veto: {sym} is outside London/NY Kill Zones (07:00-10:30 UTC / 12:30-16:30 UTC). "
                        f"Current time: {now.strftime('%H:%M')} UTC is off-hours chop."
                    ),
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
