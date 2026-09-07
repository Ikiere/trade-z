import uuid
from datetime import datetime, timezone
from typing import Dict, Any
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot
from app.config import settings


class DecisionEngine(BaseEngine):
    """
    Layer 15: Concludes on trade execution path (BUY, SELL, WAIT, NO TRADE),
    calculates exact institutional entry, SL, and TP, and generates a structured audit Trade Certificate.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        results: Dict[str, EngineResult] = context.get("engine_results", {})
        conf_res = results.get("confidence")
        
        final_confidence = conf_res.confidence if conf_res else 0.0

        # Hard-fail checks
        failed_layer = None
        for key, res in results.items():
            if res.validation_status in ["invalid", "limit_breached", "closed"]:
                failed_layer = (key, res.explanation)
                break

        current_price = float(snapshot.df["close"].iloc[-1])
        symbol = snapshot.symbol.upper().replace("/", "")

        # Determine asset-specific decimal precision and fallback ATR
        if "JPY" in symbol:
            decimals = 3
            fallback_atr = 0.35
        elif "XAU" in symbol or "GOLD" in symbol:
            decimals = 2
            fallback_atr = 6.50
        elif any(crypto in symbol for crypto in ["BTC", "ETH", "SOL"]):
            decimals = 2
            fallback_atr = current_price * 0.015
        else:
            decimals = 5
            fallback_atr = 0.0018

        # Calculate true ATR (Average True Range)
        highs = snapshot.df["high"]
        lows = snapshot.df["low"]
        closes = snapshot.df["close"]
        hl = highs - lows
        hc = (highs - closes.shift()).abs()
        lc = (lows - closes.shift()).abs()
        tr = hl.combine(hc, max).combine(lc, max)
        atr_val = tr.tail(14).mean()
        atr = float(atr_val) if (atr_val is not None and not pd_isna(atr_val) and atr_val > 0) else fallback_atr

        # Multi-layer directional bias resolution (guaranteed deterministic direction)
        struct_res = results.get("structure")
        higher_bias = results.get("higher_timeframe")
        trend_res = results.get("trend_quality")
        mom_res = results.get("momentum")
        liq_res = results.get("liquidity")

        direction = None

        if struct_res and struct_res.result in ["bullish", "bearish"]:
            direction = struct_res.result
        elif higher_bias and higher_bias.result in ["bullish", "bearish"]:
            direction = higher_bias.result
        elif trend_res and "bullish" in trend_res.result:
            direction = "bullish"
        elif trend_res and "bearish" in trend_res.result:
            direction = "bearish"
        elif mom_res and mom_res.result in ["bullish", "bearish"]:
            direction = mom_res.result
        elif liq_res and liq_res.result in ["bullish_sweep", "bearish_sweep"]:
            direction = "bullish" if liq_res.result == "bullish_sweep" else "bearish"
        else:
            # Check trading zone or 50 EMA
            zone = struct_res.metrics.get("trading_zone") if struct_res else None
            if zone == "discount":
                direction = "bullish"
            elif zone == "premium":
                direction = "bearish"
            else:
                # Compare current price to 20-period moving average
                ma20 = float(closes.tail(20).mean())
                direction = "bullish" if current_price >= ma20 else "bearish"

        # Config threshold evaluation
        min_threshold = getattr(settings, 'min_confidence_threshold', 65.0) or 65.0
        if min_threshold > 80.0:
            min_threshold = 70.0  # sensible threshold cap for high quality confluences

        # Decision Matrix
        if failed_layer:
            decision = "reject"
            explanation = f"NO TRADE: Hard fail at layer '{failed_layer[0]}'. Reason: {failed_layer[1]}"
        elif final_confidence >= min_threshold:
            decision = "approve"
            action = "BUY" if direction == "bullish" else "SELL"
            explanation = f"{action} setup approved with {final_confidence:.1f}% confidence confluence."
        elif final_confidence >= (min_threshold - 15.0):
            decision = "wait"
            explanation = f"WAIT: Setup is promising ({direction.upper()}) but confidence ({final_confidence:.1f}%) is below {min_threshold:.0f}% threshold."
        else:
            decision = "reject"
            explanation = f"REJECTED: Low confluence score ({final_confidence:.1f}%) for {direction.upper()} setup."

        # Risk-to-Reward ratio
        rr = float(context.get("risk_reward_ratio", 2.5) or 2.5)
        if rr < 1.5:
            rr = 2.0

        entry = current_price

        # Structural levels from StructureEngine
        swing_high = struct_res.metrics.get("swing_high") if struct_res else None
        swing_low = struct_res.metrics.get("swing_low") if struct_res else None

        # Precision-engineered Stop Loss and Take Profit levels
        if direction == "bullish":
            # Institutional SL below swing low with buffer
            if swing_low and float(swing_low) < entry:
                raw_dist = (entry - float(swing_low)) + (atr * 0.2)
                sl_dist = max(atr * 1.0, min(atr * 2.8, raw_dist))
            else:
                sl_dist = atr * 1.5

            sl = entry - sl_dist
            tp = entry + (sl_dist * rr)
            order_type = "buy limit" if entry < current_price * 1.0005 else "buy"

        else:  # bearish
            # Institutional SL above swing high with buffer
            if swing_high and float(swing_high) > entry:
                raw_dist = (float(swing_high) - entry) + (atr * 0.2)
                sl_dist = max(atr * 1.0, min(atr * 2.8, raw_dist))
            else:
                sl_dist = atr * 1.5

            sl = entry + sl_dist
            tp = entry - (sl_dist * rr)
            order_type = "sell limit" if entry > current_price * 0.9995 else "sell"

        # Strictly enforce directional invariants:
        # For bullish: SL MUST be < entry, TP MUST be > entry
        # For bearish: SL MUST be > entry, TP MUST be < entry
        if direction == "bullish":
            if sl >= entry:
                sl = entry - (atr * 1.5)
            if tp <= entry:
                tp = entry + (abs(entry - sl) * rr)
        else:
            if sl <= entry:
                sl = entry + (atr * 1.5)
            if tp >= entry:
                tp = entry - (abs(sl - entry) * rr)

        # Expected trigger horizon
        timeframe = snapshot.timeframe
        if timeframe in ["15m", "30m"]:
            expected_trigger = "Trigger zone entry within 15-45 minutes."
        elif timeframe in ["1h"]:
            expected_trigger = "Trigger zone entry within 1-3 hours."
        else:
            expected_trigger = "Trigger zone entry within 4-12 hours."

        # Construct Audit Trade Certificate
        cert_id = str(uuid.uuid4())
        certificate = {
            "trade_id": cert_id,
            "symbol": snapshot.symbol,
            "direction": "BUY" if direction == "bullish" else "SELL",
            "order_type": order_type,
            "entry_price": round(entry, decimals),
            "stop_loss": round(sl, decimals),
            "take_profit": round(tp, decimals),
            "confidence": round(final_confidence, 2),
            "risk_reward": round(rr, 2),
            "higher_timeframe_bias": higher_bias.result if higher_bias else "neutral",
            "market_structure_summary": struct_res.explanation if struct_res else "",
            "liquidity_findings": liq_res.explanation if liq_res else "",
            "institutional_zones": results.get("zones").explanation if results.get("zones") else "",
            "volume_summary": results.get("volume").explanation if results.get("volume") else "",
            "volatility_summary": results.get("volatility").explanation if results.get("volatility") else "",
            "fundamental_summary": results.get("fundamentals").explanation if results.get("fundamentals") else "",
            "correlation_summary": results.get("correlation").explanation if results.get("correlation") else "",
            "historical_pattern_summary": results.get("historical_pattern").explanation if results.get("historical_pattern") else "",
            "pattern_memory_verdict": results.get("historical_pattern").metrics.get("verdict", "APPROVED") if results.get("historical_pattern") else "APPROVED",
            "loss_autopsy_count": results.get("historical_pattern").metrics.get("diagnosed_failures", 0) if results.get("historical_pattern") else 0,
            "decision": decision.upper(),
            "expected_trigger": expected_trigger,
            "full_explanation": explanation,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        return EngineResult(
            result=decision,
            confidence=final_confidence,
            explanation=explanation,
            metrics={"certificate": certificate, "direction": direction, "order_type": order_type},
            validation_status="valid"
        )


def pd_isna(val) -> bool:
    try:
        import math
        return val is None or math.isnan(val)
    except Exception:
        return False
