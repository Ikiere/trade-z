import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))

from app.services.structure import generate_simulated_candles
from app.services.setup_families import detect_all_setup_families

eur_df = generate_simulated_candles("EURUSD", "15m", seed_offset=0)
gbp_df = generate_simulated_candles("GBPUSD", "15m", seed_offset=100)
xau_df = generate_simulated_candles("XAUUSD", "15m", seed_offset=200)

eur_cands = detect_all_setup_families("EURUSD", "15m", eur_df)
gbp_cands = detect_all_setup_families("GBPUSD", "15m", gbp_df)
xau_cands = detect_all_setup_families("XAUUSD", "15m", xau_df)

print(f"EURUSD candidates found: {len(eur_cands)}")
for c in eur_cands:
    print(f"  {c.setup_family}: Quality={c.setup_quality_score}, RR={c.risk_reward:.2f}")

print(f"GBPUSD candidates found: {len(gbp_cands)}")
for c in gbp_cands:
    print(f"  {c.setup_family}: Quality={c.setup_quality_score}, RR={c.risk_reward:.2f}")

print(f"XAUUSD candidates found: {len(xau_cands)}")
for c in xau_cands:
    print(f"  {c.setup_family}: Quality={c.setup_quality_score}, RR={c.risk_reward:.2f}")
