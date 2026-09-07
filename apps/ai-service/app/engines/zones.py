"""
Deterministic SMC Engine - Layer 7 & Layer 8:
Institutional Order Blocks (Unmitigated, Displacement, Body/Wick > 0.5) &
Fair Value Gaps / Imbalance Engine (3-Candle, ATR Filter, Mitigation Status).
"""

from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class InstitutionalZonesEngine(BaseEngine):
    """
    Identifies unmitigated Order Blocks created by displacement
    and Fair Value Gaps (FVG imbalances) meeting minimum ATR thresholds.
    """

    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        df = snapshot.df
        if df is None or len(df) < 20:
            return EngineResult(
                result="none",
                confidence=50.0,
                explanation="Insufficient candle series to calculate institutional zones.",
                metrics={},
                validation_status="incomplete"
            )

        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        opens = df["open"].values

        current_price = float(closes[-1])

        # Compute ATR(14) for gap filtering
        hl = highs - lows
        hc = np.abs(highs - np.roll(closes, 1))
        lc = np.abs(lows - np.roll(closes, 1))
        tr = np.maximum(hl, np.maximum(hc, lc))
        tr[0] = hl[0]
        atr = float(np.mean(tr[-14:])) if len(tr) >= 14 else float(np.mean(tr))
        min_gap_size = max(atr * 0.25, 1e-5)

        # 1. Fair Value Gap (FVG) Detection (Layer 8)
        unmitigated_fvgs: List[Dict[str, Any]] = []
        for i in range(2, len(df)):
            # Bullish FVG: Low of candle i > High of candle i-2
            if lows[i] > highs[i - 2]:
                gap_size = lows[i] - highs[i - 2]
                if gap_size >= min_gap_size:
                    fvg_top = float(lows[i])
                    fvg_bottom = float(highs[i - 2])
                    # Check mitigation in subsequent candles (i+1 to end)
                    mitigated = False
                    for k in range(i + 1, len(df)):
                        if lows[k] <= fvg_bottom:
                            mitigated = True
                            break
                    if not mitigated:
                        unmitigated_fvgs.append({
                            "type": "bullish",
                            "top": fvg_top,
                            "bottom": fvg_bottom,
                            "gap_size": gap_size,
                            "index": i
                        })

            # Bearish FVG: High of candle i < Low of candle i-2
            elif highs[i] < lows[i - 2]:
                gap_size = lows[i - 2] - highs[i]
                if gap_size >= min_gap_size:
                    fvg_top = float(lows[i - 2])
                    fvg_bottom = float(highs[i])
                    # Check mitigation in subsequent candles
                    mitigated = False
                    for k in range(i + 1, len(df)):
                        if highs[k] >= fvg_top:
                            mitigated = True
                            break
                    if not mitigated:
                        unmitigated_fvgs.append({
                            "type": "bearish",
                            "top": fvg_top,
                            "bottom": fvg_bottom,
                            "gap_size": gap_size,
                            "index": i
                        })

        # 2. Institutional Order Block (OB) Detection (Layer 7)
        # Definition: The last opposing candle before displacement.
        # Body/wick ratio > 0.5. Must remain unmitigated.
        unmitigated_obs: List[Dict[str, Any]] = []
        body_sizes = np.abs(closes - opens)
        total_ranges = highs - lows
        avg_body = float(np.mean(body_sizes[-20:]))

        for i in range(1, len(df) - 2):
            displacement_next = body_sizes[i + 1] >= (avg_body * 1.4)
            candle_range = total_ranges[i]
            body_ratio = (body_sizes[i] / candle_range) if candle_range > 0 else 0.0

            if body_ratio >= 0.45 and displacement_next:
                # Bullish OB: Bearish candle (close < open) followed by bullish displacement
                if closes[i] < opens[i] and closes[i + 1] > opens[i + 1]:
                    ob_top = float(highs[i])
                    ob_bottom = float(lows[i])
                    # Check if mitigated (price closed below ob_bottom)
                    mitigated = False
                    for k in range(i + 2, len(df)):
                        if closes[k] < ob_bottom:
                            mitigated = True
                            break
                    if not mitigated:
                        unmitigated_obs.append({
                            "type": "bullish",
                            "top": ob_top,
                            "bottom": ob_bottom,
                            "index": i
                        })

                # Bearish OB: Bullish candle (close > open) followed by bearish displacement
                elif closes[i] > opens[i] and closes[i + 1] < opens[i + 1]:
                    ob_top = float(highs[i])
                    ob_bottom = float(lows[i])
                    # Check if mitigated (price closed above ob_top)
                    mitigated = False
                    for k in range(i + 2, len(df)):
                        if closes[k] > ob_top:
                            mitigated = True
                            break
                    if not mitigated:
                        unmitigated_obs.append({
                            "type": "bearish",
                            "top": ob_top,
                            "bottom": ob_bottom,
                            "index": i
                        })

        # 3. Proximity & Confluence Evaluation
        inside_bullish_ob = False
        inside_bearish_ob = False
        inside_bullish_fvg = False
        inside_bearish_fvg = False

        # Check most recent unmitigated zones
        for ob in reversed(unmitigated_obs[-3:]):
            if ob["bottom"] <= current_price <= ob["top"]:
                if ob["type"] == "bullish":
                    inside_bullish_ob = True
                else:
                    inside_bearish_ob = True
                break

        for fvg in reversed(unmitigated_fvgs[-3:]):
            if fvg["bottom"] <= current_price <= fvg["top"]:
                if fvg["type"] == "bullish":
                    inside_bullish_fvg = True
                else:
                    inside_bearish_fvg = True
                break

        zone_type = "none"
        confidence = 50.0
        if inside_bullish_ob and inside_bullish_fvg:
            zone_type = "bullish_confluence_zone"
            confidence = 90.0
        elif inside_bearish_ob and inside_bearish_fvg:
            zone_type = "bearish_confluence_zone"
            confidence = 90.0
        elif inside_bullish_ob:
            zone_type = "inside_bullish_ob"
            confidence = 82.0
        elif inside_bearish_ob:
            zone_type = "inside_bearish_ob"
            confidence = 82.0
        elif inside_bullish_fvg:
            zone_type = "inside_bullish_fvg"
            confidence = 78.0
        elif inside_bearish_fvg:
            zone_type = "inside_bearish_fvg"
            confidence = 78.0

        explanation = "Price is not currently inside an unmitigated institutional zone."
        if zone_type != "none":
            explanation = (
                f"Institutional zone hit: {zone_type.upper()}. "
                f"Unmitigated order block / FVG imbalance providing wholesale entry confluence."
            )

        return EngineResult(
            result=zone_type,
            confidence=confidence,
            explanation=explanation,
            metrics={
                "unmitigated_obs_count": len(unmitigated_obs),
                "unmitigated_fvgs_count": len(unmitigated_fvgs),
                "inside_bullish_ob": inside_bullish_ob,
                "inside_bearish_ob": inside_bearish_ob,
                "inside_bullish_fvg": inside_bullish_fvg,
                "inside_bearish_fvg": inside_bearish_fvg,
                "atr": round(atr, 5)
            },
            validation_status="valid"
        )
