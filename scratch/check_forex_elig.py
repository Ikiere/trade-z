import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))

from app.services.structure import generate_simulated_candles
from app.services.setup_families import detect_all_setup_families
from app.services.asset_eligibility import evaluate_instrument_eligibility
from app.services.broker_profiles import get_broker_profile

broker = get_broker_profile("exness")
for sym in ["EURUSD", "GBPUSD", "XAUUSD"]:
    df = generate_simulated_candles(sym, "15m", seed_offset=10)
    cands = detect_all_setup_families(sym, "15m", df)
    spec = broker.get_symbol_spec(sym)
    print(f"--- {sym} ---")
    for c in cands:
        sl_dist = abs(c.entry_price - c.stop_loss)
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
        print(f"  {c.setup_family}: Score={c.setup_quality_score}, SL_pts={sl_dist:.5f}, Eligible={elig.is_eligible}, Reason={elig.ineligibility_reason}")
