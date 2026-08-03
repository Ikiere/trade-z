import numpy as np
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot
from app.services.indicators import calculate_vwap


class VolumeEngine(BaseEngine):
    """
    Layer 8: Evaluates Relative Volume (RVol), VWAP levels, and
    participation strength to validate breakouts.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        volumes = df["volume"].values
        closes = df["close"].values

        # If volume is mostly zero (standard forex decentralized feeds), allow fallback
        if np.all(volumes == 0):
            return EngineResult(
                result="accepted_forex_fallback",
                confidence=70.0,
                explanation="Volume participation is valid (decentralized forex tick volume fallback).",
                metrics={"relative_volume": 1.0},
                validation_status="valid"
            )

        # Calculate Relative Volume (RVol)
        recent_vol = volumes[-1]
        mean_vol = np.mean(volumes[-20:-1]) if len(volumes) >= 20 else np.mean(volumes)
        rvol = recent_vol / (mean_vol + 1e-10)

        # VWAP confirmation
        vwap = calculate_vwap(df).values
        last_vwap = vwap[-1]
        above_vwap = closes[-1] > last_vwap

        vol_bias = "neutral"
        score = 50.0
        if rvol > 1.5:
            vol_bias = "high_participation"
            score = 90.0
        elif rvol < 0.7:
            vol_bias = "low_participation"
            score = 40.0
        else:
            vol_bias = "normal"
            score = 70.0

        explanation = f"Volume engine registers {vol_bias.upper()} participation (RVol: {rvol:.2f}). Close is {'above' if above_vwap else 'below'} VWAP."

        return EngineResult(
            result=vol_bias,
            confidence=score,
            explanation=explanation,
            metrics={
                "relative_volume": float(rvol),
                "above_vwap": bool(above_vwap),
                "vwap_value": float(last_vwap)
            },
            validation_status="valid"
        )
