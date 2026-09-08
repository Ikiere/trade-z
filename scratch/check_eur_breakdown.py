import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))

from app.services.real_market_simulator import real_market_simulator
from app.services.structure import generate_simulated_candles
from app.services.setup_families import detect_all_setup_families
from app.services.empirical_expectancy import empirical_expectancy_engine
from app.services.duplicate_detector import duplicate_detector
from app.services.asset_eligibility import evaluate_instrument_eligibility
from app.services.broker_profiles import get_broker_profile
import numpy as np

broker = get_broker_profile("exness")
dfs = {
    "EURUSD": generate_simulated_candles("EURUSD", "15m", seed_offset=0),
    "GBPUSD": generate_simulated_candles("GBPUSD", "15m", seed_offset=100),
    "XAUUSD": generate_simulated_candles("XAUUSD", "15m", seed_offset=200)
}

eur_passed = 0
eur_rejected_qual = 0
eur_rejected_dup = 0
eur_rejected_elig = 0

for i in range(36, 300, 4):
    sub_df = dfs["EURUSD"].iloc[:i+1].copy().reset_index(drop=True)
    if len(sub_df) >= 16:
        n_blocks = len(sub_df) // 4
        usable_sub = sub_df.iloc[:n_blocks * 4]
        higher_df = usable_sub.groupby(np.arange(len(usable_sub)) // 4).agg({
            'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'
        }).reset_index(drop=True)
    else:
        higher_df = sub_df.copy()

    cands = detect_all_setup_families("EURUSD", "15m", sub_df, higher_df)
    spec = broker.get_symbol_spec("EURUSD")
    spread_pts = spec.typical_spread_pips * spec.tick_size * spec.pip_multiplier

    for c in cands:
        if c.setup_quality_score < 75 or c.risk_reward < 1.8:
            eur_rejected_qual += 1
            continue

        sl_dist = abs(c.entry_price - c.stop_loss)
        spread_cost_r = spread_pts / max(0.0001, sl_dist)
        emp = empirical_expectancy_engine.calculate_expectancy(
            symbol=c.symbol,
            setup_family=c.setup_family,
            spread_cost_r=spread_cost_r
        )
        c.expected_value = emp.empirical_ev_r

        is_dup, _ = duplicate_detector.is_duplicate(
            symbol=c.symbol,
            setup_family=c.setup_family,
            direction=c.direction,
            zone_price=c.entry_price,
            current_bar=i
        )
        if is_dup:
            eur_rejected_dup += 1
            continue

        elig = evaluate_instrument_eligibility(
            symbol=c.symbol,
            equity=100.0,
            stop_distance_points=sl_dist,
            risk_percent=1.0,
            broker_min_volume=spec.min_volume,
            broker_vol_step=spec.vol_step,
            broker_tick_value=spec.tick_value,
            broker_tick_size=spec.tick_size,
            leverage=2000.0,
            strict_risk_enforcement=True
        )
        if not elig.is_eligible:
            eur_rejected_elig += 1
            continue

        eur_passed += 1

print(f"EURUSD Passed: {eur_passed}, Rejected Qual: {eur_rejected_qual}, Dup: {eur_rejected_dup}, Elig: {eur_rejected_elig}")
