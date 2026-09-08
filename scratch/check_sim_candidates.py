import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))

from app.services.structure import generate_simulated_candles
from app.services.setup_families import detect_all_setup_families
from app.services.asset_eligibility import evaluate_instrument_eligibility
from app.services.broker_profiles import get_broker_profile
import numpy as np

broker = get_broker_profile("exness")
dfs = {
    "EURUSD": generate_simulated_candles("EURUSD", "15m", seed_offset=0),
    "GBPUSD": generate_simulated_candles("GBPUSD", "15m", seed_offset=100),
    "XAUUSD": generate_simulated_candles("XAUUSD", "15m", seed_offset=200)
}

for i in range(36, 60, 4):
    print(f"\n=== Bar {i} ===")
    for sym, df in dfs.items():
        sub_df = df.iloc[:i+1].copy().reset_index(drop=True)
        if len(sub_df) >= 16:
            n_blocks = len(sub_df) // 4
            usable_sub = sub_df.iloc[:n_blocks * 4]
            higher_df = usable_sub.groupby(np.arange(len(usable_sub)) // 4).agg({
                'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'
            }).reset_index(drop=True)
        else:
            higher_df = sub_df.copy()
        cands = detect_all_setup_families(sym, "15m", sub_df, higher_df)
        viable = [c for c in cands if c.setup_quality_score >= 75 and c.risk_reward >= 1.8]
        print(f"  {sym}: {len(cands)} cands, {len(viable)} viable")
        for v in viable:
            spec = broker.get_symbol_spec(sym)
            sl_dist = abs(v.entry_price - v.stop_loss)
            elig = evaluate_instrument_eligibility(
                symbol=v.symbol,
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
            print(f"    {v.symbol} {v.setup_family}: Score={v.setup_quality_score}, RR={v.risk_reward:.1f}, SL_pts={sl_dist:.5f}, Eligible={elig.is_eligible}, Reason={elig.ineligibility_reason}")
