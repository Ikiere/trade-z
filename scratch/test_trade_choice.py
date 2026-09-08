import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))

from app.services.real_market_simulator import real_market_simulator

# Run simulation for 100 bars and trace candidate decisions
res = real_market_simulator.run_simulation(
    symbols=["EURUSD", "GBPUSD", "XAUUSD"],
    initial_balance=100.0,
    timeframe="15m",
    period_days=3,
    bars=100,
    risk_percent=1.0
)

for t in res['trades']:
    print(f"Bar {t.get('open_bar_index')} to {t.get('close_bar_index')}: {t['symbol']} {t['direction']} PnL=${t['net_pnl']}")
