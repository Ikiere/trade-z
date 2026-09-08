import sys
sys.path.append(r"c:\Users\HP\Desktop\trade-z\apps\ai-service")

import numpy as np
import pandas as pd
from datetime import datetime
from app.services.real_market_simulator import real_market_simulator
import app.services.structure as structure

print("Testing candidate seeds/hours...")

# Let's see if we can find 61 trades, 1 win, 23 losses, 37 breakevens
# Let's test different fixed seeds for np.random.seed in generate_simulated_candles

# First let's test if there is an exact match for date/hour variations
original_func = structure.generate_simulated_candles

# Let's search over hour/day and generic seeds
found = None

# Let's test hours for today and yesterday
for day in [8, 7, 6, 9]:
    for hour in range(24):
        # We simulate what generate_simulated_candles did:
        def make_candles_for_datetime(d, h):
            def custom_gen(pair, tf):
                seed_str = f"{pair}_{tf}_2026_9_{d}_{h}"
                seed = abs(hash(seed_str)) % 1000000
                np.random.seed(seed)
                return original_func(pair, tf)
            return custom_gen

        structure.generate_simulated_candles = make_candles_for_datetime(day, hour)
        try:
            res = real_market_simulator.run_simulation(
                symbols=["EURUSD", "GBPUSD", "XAUUSD"],
                initial_balance=100.0,
                timeframe="15m",
                period_days=30,
                risk_percent=1.0,
                broker_name="exness"
            )
            t = res.get("total_trades")
            w = res.get("winning_trades")
            l = res.get("losing_trades")
            be = res.get("breakeven_trades")
            pnl = res.get("net_pnl")
            if t == 61 or (w == 1 and l == 23 and be == 37) or abs(pnl - 21.49) < 0.05:
                print(f"FOUND MATCH! Day {day}, Hour {hour}: trades={t}, W={w}, L={l}, BE={be}, PnL={pnl}")
                found = res
                break
            else:
                if t in [60, 61, 62]:
                    print(f"Close: Day {day}, Hour {hour}: trades={t}, W={w}, L={l}, BE={be}, PnL={pnl}")
        except Exception as e:
            pass
    if found:
        break

if not found:
    print("Direct date/hour hash did not match (likely python hash seed difference).")
