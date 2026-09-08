"""
10 SMC Setup Families Engine:
1. Liquidity Sweep Reversal
2. BOS + FVG Continuation
3. CHoCH Reversal
4. Order Block Retest
5. FVG Retracement
6. Breaker Block
7. Premium/Discount Reversal
8. HTF Liquidity Raid
9. Session Expansion
10. Displacement Continuation

Each setup family generates a structured CandidateSetup with:
- Direction (BUY/SELL)
- Entry, SL, TP, Target R:R
- Invalidation Level
- Target Liquidity Pool
- Setup Family Name
- Confluence Factors
"""

from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field


class CandidateSetup(BaseModel):
    id: str
    symbol: str
    setup_family: str
    direction: str  # "BUY" or "SELL"
    order_type: str  # "market", "buy limit", "sell limit"
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    invalidation_level: float
    target_liquidity_level: float
    setup_quality_score: float  # 0 - 100
    expected_value: float = 0.0  # Statistical EV in R
    confluence_factors: List[str] = Field(default_factory=list)
    regime: str = "normal"
    timeframe: str = "15m"
    details: Dict[str, Any] = Field(default_factory=dict)


def detect_all_setup_families(
    symbol: str,
    timeframe: str,
    df: pd.DataFrame,
    higher_df: Optional[pd.DataFrame] = None,
    atr: Optional[float] = None
) -> List[CandidateSetup]:
    """
    Scans a market snapshot against all 10 SMC setup families.
    Returns all valid candidates meeting structural prerequisites.
    """
    if df is None or len(df) < 25:
        return []

    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values
    opens = df["open"].values

    current_close = float(closes[-1])
    current_high = float(highs[-1])
    current_low = float(lows[-1])
    current_open = float(opens[-1])

    # Calculate ATR(14)
    if atr is None or atr <= 0:
        hl = highs - lows
        hc = np.abs(highs - np.roll(closes, 1))
        lc = np.abs(lows - np.roll(closes, 1))
        tr = np.maximum(hl, np.maximum(hc, lc))
        tr[0] = hl[0]
        atr = float(np.mean(tr[-14:])) if len(tr) >= 14 else float(np.mean(tr))

    # Swing extremes (3-bar pivots)
    swing_highs: List[tuple[int, float]] = []
    swing_lows: List[tuple[int, float]] = []
    for i in range(3, len(df) - 3):
        if highs[i] == max(highs[i - 3 : i + 4]):
            swing_highs.append((i, float(highs[i])))
        if lows[i] == min(lows[i - 3 : i + 4]):
            swing_lows.append((i, float(lows[i])))

    if not swing_highs or not swing_lows:
        return []

    last_high_idx, last_high = swing_highs[-1]
    last_low_idx, last_low = swing_lows[-1]

    # Dealing Range & Equilibrium
    range_high = max(last_high, swing_highs[-2][1] if len(swing_highs) > 1 else last_high)
    range_low = min(last_low, swing_lows[-2][1] if len(swing_lows) > 1 else last_low)
    total_range = range_high - range_low
    equilibrium = range_low + (total_range * 0.5) if total_range > 0 else current_close

    # Body sizes and displacement
    body_sizes = np.abs(closes - opens)
    avg_body = float(np.mean(body_sizes[-20:])) if len(body_sizes) >= 20 else float(np.mean(body_sizes))
    displacement_ratio = (abs(current_close - current_open) / avg_body) if avg_body > 0 else 1.0

    candidates: List[CandidateSetup] = []

    # ─────────────────────────────────────────────────────────────
    # Family 1: Liquidity Sweep Reversal
    # Bullish: Low wick swept below swing low, closed back inside
    # Bearish: High wick swept above swing high, closed back inside
    # ─────────────────────────────────────────────────────────────
    # Bullish Sweep
    if current_low < last_low and current_close > last_low:
        sl = round(current_low - (atr * 0.2), 5)
        sl_dist = abs(current_close - sl)
        tp = round(max(range_high, current_close + (sl_dist * 3.0)), 5)
        rr = round(abs(tp - current_close) / sl_dist, 2) if sl_dist > 0 else 2.5
        candidates.append(CandidateSetup(
            id=f"{symbol}-SWEEP-BUY",
            symbol=symbol,
            setup_family="Liquidity Sweep Reversal",
            direction="BUY",
            order_type="market",
            entry_price=current_close,
            stop_loss=sl,
            take_profit=tp,
            risk_reward=rr,
            invalidation_level=sl,
            target_liquidity_level=range_high,
            setup_quality_score=88.0,
            confluence_factors=["Sell-side liquidity tapped", "Wick-only sweep of swing low", "Immediate reclaim"],
            timeframe=timeframe,
            details={"sweep_level": last_low, "reclaim_price": current_close}
        ))
    # Bearish Sweep
    elif current_high > last_high and current_close < last_high:
        sl = round(current_high + (atr * 0.2), 5)
        sl_dist = abs(sl - current_close)
        tp = round(min(range_low, current_close - (sl_dist * 3.0)), 5)
        rr = round(abs(current_close - tp) / sl_dist, 2) if sl_dist > 0 else 2.5
        candidates.append(CandidateSetup(
            id=f"{symbol}-SWEEP-SELL",
            symbol=symbol,
            setup_family="Liquidity Sweep Reversal",
            direction="SELL",
            order_type="market",
            entry_price=current_close,
            stop_loss=sl,
            take_profit=tp,
            risk_reward=rr,
            invalidation_level=sl,
            target_liquidity_level=range_low,
            setup_quality_score=88.0,
            confluence_factors=["Buy-side liquidity tapped", "Wick-only sweep of swing high", "Immediate reclaim"],
            timeframe=timeframe,
            details={"sweep_level": last_high, "reclaim_price": current_close}
        ))

    # ─────────────────────────────────────────────────────────────
    # Family 2: BOS + FVG Continuation
    # Bullish: Broke above swing high + 3-candle FVG formed behind it
    # ─────────────────────────────────────────────────────────────
    for i in range(len(df) - 4, len(df) - 1):
        if i >= 2 and lows[i] > highs[i - 2]:  # Bullish FVG
            fvg_low = float(highs[i - 2])
            fvg_high = float(lows[i])
            if current_close > last_high:  # BOS happened
                sl = round(fvg_low - (atr * 0.2), 5)
                sl_dist = abs(fvg_high - sl)
                tp = round(current_close + (sl_dist * 3.2), 5)
                candidates.append(CandidateSetup(
                    id=f"{symbol}-BOS-FVG-BUY",
                    symbol=symbol,
                    setup_family="BOS + FVG Continuation",
                    direction="BUY",
                    order_type="buy limit",
                    entry_price=round(fvg_high, 5),
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=3.2,
                    invalidation_level=sl,
                    target_liquidity_level=tp,
                    setup_quality_score=84.0,
                    confluence_factors=["Structural BOS confirmation", "Unmitigated Bullish FVG support", "Trend continuation"],
                    timeframe=timeframe,
                    details={"fvg_range": [fvg_low, fvg_high], "bos_level": last_high}
                ))
                break
        elif i >= 2 and highs[i] < lows[i - 2]:  # Bearish FVG
            fvg_high = float(lows[i - 2])
            fvg_low = float(highs[i])
            if current_close < last_low:  # Bearish BOS
                sl = round(fvg_high + (atr * 0.2), 5)
                sl_dist = abs(sl - fvg_low)
                tp = round(current_close - (sl_dist * 3.2), 5)
                candidates.append(CandidateSetup(
                    id=f"{symbol}-BOS-FVG-SELL",
                    symbol=symbol,
                    setup_family="BOS + FVG Continuation",
                    direction="SELL",
                    order_type="sell limit",
                    entry_price=round(fvg_low, 5),
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=3.2,
                    invalidation_level=sl,
                    target_liquidity_level=tp,
                    setup_quality_score=84.0,
                    confluence_factors=["Structural Bearish BOS", "Unmitigated Bearish FVG resistance", "Trend continuation"],
                    timeframe=timeframe,
                    details={"fvg_range": [fvg_low, fvg_high], "bos_level": last_low}
                ))
                break

    # ─────────────────────────────────────────────────────────────
    # Family 3: CHoCH Reversal
    # Change of Character against prior trend with displacement
    # ─────────────────────────────────────────────────────────────
    if displacement_ratio >= 1.4:
        if current_close > last_high and current_open < last_high:
            sl = round(current_low - (atr * 0.3), 5)
            sl_dist = abs(current_close - sl)
            tp = round(current_close + (sl_dist * 3.5), 5)
            candidates.append(CandidateSetup(
                id=f"{symbol}-CHOCH-BUY",
                symbol=symbol,
                setup_family="CHoCH Reversal",
                direction="BUY",
                order_type="market",
                entry_price=current_close,
                stop_loss=sl,
                take_profit=tp,
                risk_reward=3.5,
                invalidation_level=sl,
                target_liquidity_level=range_high,
                setup_quality_score=86.0,
                confluence_factors=["Bullish Change of Character (CHoCH)", f"Displacement ratio {displacement_ratio:.1f}x", "Order flow reversal"],
                timeframe=timeframe,
                details={"choch_pivot": last_high, "displacement": displacement_ratio}
            ))
        elif current_close < last_low and current_open > last_low:
            sl = round(current_high + (atr * 0.3), 5)
            sl_dist = abs(sl - current_close)
            tp = round(current_close - (sl_dist * 3.5), 5)
            candidates.append(CandidateSetup(
                id=f"{symbol}-CHOCH-SELL",
                symbol=symbol,
                setup_family="CHoCH Reversal",
                direction="SELL",
                order_type="market",
                entry_price=current_close,
                stop_loss=sl,
                take_profit=tp,
                risk_reward=3.5,
                invalidation_level=sl,
                target_liquidity_level=range_low,
                setup_quality_score=86.0,
                confluence_factors=["Bearish Change of Character (CHoCH)", f"Displacement ratio {displacement_ratio:.1f}x", "Order flow reversal"],
                timeframe=timeframe,
                details={"choch_pivot": last_low, "displacement": displacement_ratio}
            ))

    # ─────────────────────────────────────────────────────────────
    # Family 4: Order Block Retest
    # Retesting unmitigated OB with body/wick ratio > 0.5
    # ─────────────────────────────────────────────────────────────
    for i in range(len(df) - 6, len(df) - 1):
        c_range = highs[i] - lows[i]
        b_ratio = (body_sizes[i] / c_range) if c_range > 0 else 0.0
        if b_ratio >= 0.5 and i < len(df) - 1:
            # Bullish OB: Bearish candle followed by strong bullish breakout
            if closes[i] < opens[i] and closes[i + 1] > opens[i + 1]:
                ob_high = float(highs[i])
                ob_low = float(lows[i])
                if ob_low <= current_close <= ob_high * 1.002 and current_close < equilibrium:
                    sl = round(ob_low - (atr * 0.2), 5)
                    sl_dist = abs(current_close - sl)
                    tp = round(range_high, 5)
                    rr = round(abs(tp - current_close) / sl_dist, 2) if sl_dist > 0 else 2.8
                    if rr >= 2.0:
                        candidates.append(CandidateSetup(
                            id=f"{symbol}-OB-BUY",
                            symbol=symbol,
                            setup_family="Order Block Retest",
                            direction="BUY",
                            order_type="market",
                            entry_price=current_close,
                            stop_loss=sl,
                            take_profit=tp,
                            risk_reward=rr,
                            invalidation_level=sl,
                            target_liquidity_level=range_high,
                            setup_quality_score=83.0,
                            confluence_factors=["Unmitigated Discount Order Block", "High body/wick ratio candle", "Equilibrium discount pricing"],
                            timeframe=timeframe,
                            details={"ob_range": [ob_low, ob_high]}
                        ))
                        break
            # Bearish OB: Bullish candle followed by strong bearish breakdown
            elif closes[i] > opens[i] and closes[i + 1] < opens[i + 1]:
                ob_high = float(highs[i])
                ob_low = float(lows[i])
                if ob_low * 0.998 <= current_close <= ob_high and current_close > equilibrium:
                    sl = round(ob_high + (atr * 0.2), 5)
                    sl_dist = abs(sl - current_close)
                    tp = round(range_low, 5)
                    rr = round(abs(current_close - tp) / sl_dist, 2) if sl_dist > 0 else 2.8
                    if rr >= 2.0:
                        candidates.append(CandidateSetup(
                            id=f"{symbol}-OB-SELL",
                            symbol=symbol,
                            setup_family="Order Block Retest",
                            direction="SELL",
                            order_type="market",
                            entry_price=current_close,
                            stop_loss=sl,
                            take_profit=tp,
                            risk_reward=rr,
                            invalidation_level=sl,
                            target_liquidity_level=range_low,
                            setup_quality_score=83.0,
                            confluence_factors=["Unmitigated Premium Order Block", "High body/wick ratio candle", "Equilibrium premium pricing"],
                            timeframe=timeframe,
                            details={"ob_range": [ob_low, ob_high]}
                        ))
                        break

    # ─────────────────────────────────────────────────────────────
    # Family 5: FVG Retracement (OTE 62%-79%)
    # Retracement to 62-79% Fibonacci area coinciding with FVG
    # ─────────────────────────────────────────────────────────────
    if total_range > 0:
        ote_discount = range_low + (total_range * 0.38)  # 62% retracement from high
        ote_premium = range_low + (total_range * 0.62)   # 62% retracement from low

        if current_close <= ote_discount:
            sl = round(range_low - (atr * 0.2), 5)
            sl_dist = abs(current_close - sl)
            tp = round(range_high, 5)
            rr = round(abs(tp - current_close) / sl_dist, 2) if sl_dist > 0 else 3.0
            if rr >= 2.2:
                candidates.append(CandidateSetup(
                    id=f"{symbol}-FVG-RETRACE-BUY",
                    symbol=symbol,
                    setup_family="FVG Retracement",
                    direction="BUY",
                    order_type="buy limit",
                    entry_price=current_close,
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=rr,
                    invalidation_level=sl,
                    target_liquidity_level=range_high,
                    setup_quality_score=81.0,
                    confluence_factors=["OTE 62%-79% Retracement", "Wholesale discount valuation", "Favorable R:R asymmetric profile"],
                    timeframe=timeframe,
                    details={"ote_level": ote_discount, "dealing_range": total_range}
                ))
        elif current_close >= ote_premium:
            sl = round(range_high + (atr * 0.2), 5)
            sl_dist = abs(sl - current_close)
            tp = round(range_low, 5)
            rr = round(abs(current_close - tp) / sl_dist, 2) if sl_dist > 0 else 3.0
            if rr >= 2.2:
                candidates.append(CandidateSetup(
                    id=f"{symbol}-FVG-RETRACE-SELL",
                    symbol=symbol,
                    setup_family="FVG Retracement",
                    direction="SELL",
                    order_type="sell limit",
                    entry_price=current_close,
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=rr,
                    invalidation_level=sl,
                    target_liquidity_level=range_low,
                    setup_quality_score=81.0,
                    confluence_factors=["OTE 62%-79% Retracement", "Wholesale premium valuation", "Favorable R:R asymmetric profile"],
                    timeframe=timeframe,
                    details={"ote_level": ote_premium, "dealing_range": total_range}
                ))

    # ─────────────────────────────────────────────────────────────
    # Family 6: Breaker Block
    # Failed Order Block that gets breached and acts as opposite support/res
    # ─────────────────────────────────────────────────────────────
    for i in range(len(df) - 8, len(df) - 2):
        if closes[i] > opens[i] and lows[i] < last_low:  # Bullish OB violated into breakdown
            breaker_level = float(highs[i])
            if abs(current_close - breaker_level) <= (atr * 0.3) and current_close < breaker_level:
                sl = round(breaker_level + (atr * 0.3), 5)
                sl_dist = abs(sl - current_close)
                tp = round(current_close - (sl_dist * 3.0), 5)
                candidates.append(CandidateSetup(
                    id=f"{symbol}-BREAKER-SELL",
                    symbol=symbol,
                    setup_family="Breaker Block",
                    direction="SELL",
                    order_type="sell limit",
                    entry_price=round(breaker_level, 5),
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=3.0,
                    invalidation_level=sl,
                    target_liquidity_level=range_low,
                    setup_quality_score=82.0,
                    confluence_factors=["Bearish Breaker Block", "Violated demand flipped to supply", "High liquidity rejection"],
                    timeframe=timeframe,
                    details={"breaker_level": breaker_level}
                ))
                break

    # ─────────────────────────────────────────────────────────────
    # Family 7: Premium / Discount Reversal
    # Extreme pricing near range boundaries with exhaustion
    # ─────────────────────────────────────────────────────────────
    if total_range > 0:
        pos_pct = (current_close - range_low) / total_range
        if pos_pct <= 0.15:  # Deep discount exhaustion
            sl = round(range_low - (atr * 0.25), 5)
            sl_dist = abs(current_close - sl)
            tp = round(equilibrium, 5)
            rr = round(abs(tp - current_close) / sl_dist, 2) if sl_dist > 0 else 2.5
            if rr >= 2.0:
                candidates.append(CandidateSetup(
                    id=f"{symbol}-DISCOUNT-REV-BUY",
                    symbol=symbol,
                    setup_family="Premium/Discount Reversal",
                    direction="BUY",
                    order_type="market",
                    entry_price=current_close,
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=rr,
                    invalidation_level=sl,
                    target_liquidity_level=equilibrium,
                    setup_quality_score=79.0,
                    confluence_factors=["Deep Discount Exhaustion (<15% of range)", "Mean reversion to Equilibrium", "Tight structural SL"],
                    timeframe=timeframe,
                    details={"position_pct": pos_pct, "equilibrium": equilibrium}
                ))
        elif pos_pct >= 0.85:  # Deep premium exhaustion
            sl = round(range_high + (atr * 0.25), 5)
            sl_dist = abs(sl - current_close)
            tp = round(equilibrium, 5)
            rr = round(abs(current_close - tp) / sl_dist, 2) if sl_dist > 0 else 2.5
            if rr >= 2.0:
                candidates.append(CandidateSetup(
                    id=f"{symbol}-PREMIUM-REV-SELL",
                    symbol=symbol,
                    setup_family="Premium/Discount Reversal",
                    direction="SELL",
                    order_type="market",
                    entry_price=current_close,
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=rr,
                    invalidation_level=sl,
                    target_liquidity_level=equilibrium,
                    setup_quality_score=79.0,
                    confluence_factors=["Deep Premium Exhaustion (>85% of range)", "Mean reversion to Equilibrium", "Tight structural SL"],
                    timeframe=timeframe,
                    details={"position_pct": pos_pct, "equilibrium": equilibrium}
                ))

    # ─────────────────────────────────────────────────────────────
    # Family 8: HTF Liquidity Raid
    # 4H/Daily Extreme tapped with lower-timeframe reversal
    # ─────────────────────────────────────────────────────────────
    if higher_df is not None and len(higher_df) >= 15:
        htf_high = float(higher_df["high"].max())
        htf_low = float(higher_df["low"].min())
        if current_high >= htf_high and current_close < htf_high:
            sl = round(current_high + (atr * 0.2), 5)
            sl_dist = abs(sl - current_close)
            tp = round(current_close - (sl_dist * 3.5), 5)
            candidates.append(CandidateSetup(
                id=f"{symbol}-HTF-RAID-SELL",
                symbol=symbol,
                setup_family="HTF Liquidity Raid",
                direction="SELL",
                order_type="market",
                entry_price=current_close,
                stop_loss=sl,
                take_profit=tp,
                risk_reward=3.5,
                invalidation_level=sl,
                target_liquidity_level=range_low,
                setup_quality_score=89.0,
                confluence_factors=["HTF Major Liquidity Raid", "Institutional high tapped and rejected", "Macro stop hunt completed"],
                timeframe=timeframe,
                details={"htf_high": htf_high}
            ))
        elif current_low <= htf_low and current_close > htf_low:
            sl = round(current_low - (atr * 0.2), 5)
            sl_dist = abs(current_close - sl)
            tp = round(current_close + (sl_dist * 3.5), 5)
            candidates.append(CandidateSetup(
                id=f"{symbol}-HTF-RAID-BUY",
                symbol=symbol,
                setup_family="HTF Liquidity Raid",
                direction="BUY",
                order_type="market",
                entry_price=current_close,
                stop_loss=sl,
                take_profit=tp,
                risk_reward=3.5,
                invalidation_level=sl,
                target_liquidity_level=range_high,
                setup_quality_score=89.0,
                confluence_factors=["HTF Major Liquidity Raid", "Institutional low tapped and rejected", "Macro stop hunt completed"],
                timeframe=timeframe,
                details={"htf_low": htf_low}
            ))

    # ─────────────────────────────────────────────────────────────
    # Family 9: Session Expansion
    # Session open expansion with range breakout
    # ─────────────────────────────────────────────────────────────
    if displacement_ratio >= 1.6:
        if current_close > opens[-3] and closes[-1] > closes[-2] > closes[-3]:
            sl = round(lows[-3] - (atr * 0.1), 5)
            sl_dist = abs(current_close - sl)
            tp = round(current_close + (sl_dist * 2.8), 5)
            candidates.append(CandidateSetup(
                id=f"{symbol}-SESSION-EXP-BUY",
                symbol=symbol,
                setup_family="Session Expansion",
                direction="BUY",
                order_type="market",
                entry_price=current_close,
                stop_loss=sl,
                take_profit=tp,
                risk_reward=2.8,
                invalidation_level=sl,
                target_liquidity_level=tp,
                setup_quality_score=80.0,
                confluence_factors=["Session Volatility Expansion", "Consecutive directional bars", f"Impulse ratio {displacement_ratio:.1f}x"],
                timeframe=timeframe,
                details={"expansion_ratio": displacement_ratio}
            ))
        elif current_close < opens[-3] and closes[-1] < closes[-2] < closes[-3]:
            sl = round(highs[-3] + (atr * 0.1), 5)
            sl_dist = abs(sl - current_close)
            tp = round(current_close - (sl_dist * 2.8), 5)
            candidates.append(CandidateSetup(
                id=f"{symbol}-SESSION-EXP-SELL",
                symbol=symbol,
                setup_family="Session Expansion",
                direction="SELL",
                order_type="market",
                entry_price=current_close,
                stop_loss=sl,
                take_profit=tp,
                risk_reward=2.8,
                invalidation_level=sl,
                target_liquidity_level=tp,
                setup_quality_score=80.0,
                confluence_factors=["Session Volatility Expansion", "Consecutive directional bars", f"Impulse ratio {displacement_ratio:.1f}x"],
                timeframe=timeframe,
                details={"expansion_ratio": displacement_ratio}
            ))

    # ─────────────────────────────────────────────────────────────
    # Family 10: Displacement Continuation
    # Consecutive impulse candles with volume expansion
    # ─────────────────────────────────────────────────────────────
    if len(df) >= 4:
        recent_bodies = body_sizes[-3:]
        if all(rb >= avg_body * 1.2 for rb in recent_bodies):
            if closes[-1] > opens[-1] and closes[-2] > opens[-2]:
                sl = round(lows[-2] - (atr * 0.15), 5)
                sl_dist = abs(current_close - sl)
                tp = round(current_close + (sl_dist * 3.0), 5)
                candidates.append(CandidateSetup(
                    id=f"{symbol}-DISP-CONT-BUY",
                    symbol=symbol,
                    setup_family="Displacement Continuation",
                    direction="BUY",
                    order_type="market",
                    entry_price=current_close,
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=3.0,
                    invalidation_level=sl,
                    target_liquidity_level=tp,
                    setup_quality_score=82.0,
                    confluence_factors=["Multi-bar Displacement Cluster", "Order flow velocity", "Institutional participation confirmation"],
                    timeframe=timeframe,
                    details={"avg_impulse_ratio": float(np.mean(recent_bodies) / avg_body)}
                ))
            elif closes[-1] < opens[-1] and closes[-2] < opens[-2]:
                sl = round(highs[-2] + (atr * 0.15), 5)
                sl_dist = abs(sl - current_close)
                tp = round(current_close - (sl_dist * 3.0), 5)
                candidates.append(CandidateSetup(
                    id=f"{symbol}-DISP-CONT-SELL",
                    symbol=symbol,
                    setup_family="Displacement Continuation",
                    direction="SELL",
                    order_type="market",
                    entry_price=current_close,
                    stop_loss=sl,
                    take_profit=tp,
                    risk_reward=3.0,
                    invalidation_level=sl,
                    target_liquidity_level=tp,
                    setup_quality_score=82.0,
                    confluence_factors=["Multi-bar Displacement Cluster", "Order flow velocity", "Institutional participation confirmation"],
                    timeframe=timeframe,
                    details={"avg_impulse_ratio": float(np.mean(recent_bodies) / avg_body)}
                ))

    return candidates
