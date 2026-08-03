import numpy as np
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot
from app.services.indicators import calculate_atr


class VolatilityEngine(BaseEngine):
    """
    Layer 9: Measures Average True Range (ATR) expansion and session volatility
    spikes to reject trades under abnormal market environments.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        
        # Calculate ATR
        atr_series = calculate_atr(df, period=14)
        current_atr = float(atr_series.iloc[-1])

        # Compute average historical ATR to detect spikes
        avg_atr = float(atr_series.iloc[-20:-1].mean()) if len(atr_series) >= 20 else current_atr
        volatility_ratio = current_atr / (avg_atr + 1e-10)

        # Classify volatility environments
        vol_state = "normal"
        score = 80.0
        if volatility_ratio > 2.5:
            # Dangerous market condition: extreme news expansion
            vol_state = "extreme_spike"
            score = 30.0
        elif volatility_ratio < 0.5:
            # Low volatility contraction
            vol_state = "compression"
            score = 60.0

        explanation = f"Market volatility is classified as {vol_state.upper()} (ATR ratio: {volatility_ratio:.2f})."

        return EngineResult(
            result=vol_state,
            confidence=score,
            explanation=explanation,
            metrics={
                "current_atr": current_atr,
                "atr_ratio": volatility_ratio,
                "volatility_state": vol_state
            },
            validation_status="valid"
        )
