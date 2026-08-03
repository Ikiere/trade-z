import uuid
from datetime import datetime, timezone
from typing import Dict, Any
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class DecisionEngine(BaseEngine):
    """
    Layer 15: Concludes on trade execution path (BUY, SELL, WAIT, NO TRADE),
    calculates exact entry, SL, and TP, and generates a structured audit Trade Certificate.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        results: Dict[str, EngineResult] = context.get("engine_results", {})
        conf_res = results.get("confidence")
        
        final_confidence = conf_res.confidence if conf_res else 0.0

        # Hard-fail checks check
        failed_layer = None
        for key, res in results.items():
            if res.validation_status in ["invalid", "limit_breached", "closed"]:
                failed_layer = (key, res.explanation)
                break

        # Defaults
        decision = "no_trade"
        explanation = "Analysis pipeline concluded No Trade."
        
        current_price = float(snapshot.df["close"].iloc[-1])
        atr = float((snapshot.df["high"] - snapshot.df["low"]).tail(14).mean())
        if atr <= 0:
            atr = current_price * 0.0015

        # Determine directional bias
        struct_res = results.get("structure")
        higher_bias = results.get("higher_timeframe")
        
        direction = "neutral"
        if struct_res and struct_res.result in ["bullish", "bearish"]:
            direction = struct_res.result
        elif higher_bias and higher_bias.result in ["bullish", "bearish"]:
            direction = higher_bias.result

        # Decision Matrix
        if failed_layer:
            decision = "no_trade"
            explanation = f"NO TRADE: Hard fail at layer '{failed_layer[0]}'. Reason: {failed_layer[1]}"
        elif final_confidence < 85.0:
            if final_confidence >= 70.0:
                decision = "wait"
                explanation = f"WAIT: Setup is promising but confidence ({final_confidence:.1f}%) is below 85% threshold."
            else:
                decision = "no_trade"
                explanation = f"NO TRADE: Low quality confluence score ({final_confidence:.1f}%)."
        else:
            if direction == "bullish":
                decision = "buy"
                explanation = f"BUY setup approved with {final_confidence:.1f}% confidence."
            elif direction == "bearish":
                decision = "sell"
                explanation = f"SELL setup approved with {final_confidence:.1f}% confidence."

        # Target targets
        rr = context.get("risk_reward_ratio", 2.5)
        entry = current_price
        
        if decision == "buy":
            sl = current_price - (atr * 1.5)
            tp = current_price + (atr * 1.5 * rr)
        elif decision == "sell":
            sl = current_price + (atr * 1.5)
            tp = current_price - (atr * 1.5 * rr)
        else:
            sl = 0.0
            tp = 0.0

        # Construct Audit Trade Certificate
        cert_id = str(uuid.uuid4())
        certificate = {
            "trade_id": cert_id,
            "symbol": snapshot.symbol,
            "direction": decision.upper(),
            "entry_price": round(entry, 5),
            "stop_loss": round(sl, 5),
            "take_profit": round(tp, 5),
            "confidence": round(final_confidence, 2),
            "risk_reward": round(rr, 2),
            "higher_timeframe_bias": higher_bias.result if higher_bias else "neutral",
            "market_structure_summary": struct_res.explanation if struct_res else "",
            "liquidity_findings": results.get("liquidity").explanation if results.get("liquidity") else "",
            "institutional_zones": results.get("zones").explanation if results.get("zones") else "",
            "volume_summary": results.get("volume").explanation if results.get("volume") else "",
            "volatility_summary": results.get("volatility").explanation if results.get("volatility") else "",
            "fundamental_summary": results.get("fundamentals").explanation if results.get("fundamentals") else "",
            "correlation_summary": results.get("correlation").explanation if results.get("correlation") else "",
            "historical_pattern_summary": results.get("historical_pattern").explanation if results.get("historical_pattern") else "",
            "decision": decision.upper(),
            "full_explanation": explanation,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        return EngineResult(
            result=decision,
            confidence=final_confidence,
            explanation=explanation,
            metrics={"certificate": certificate},
            validation_status="valid"
        )
