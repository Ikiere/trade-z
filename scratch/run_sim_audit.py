import sys
sys.path.append(r"c:\Users\HP\Desktop\trade-z\apps\ai-service")

from app.services.real_market_simulator import real_market_simulator
import json

res = real_market_simulator.run_simulation(
    symbols=["EURUSD", "GBPUSD", "XAUUSD"],
    initial_balance=100.0,
    timeframe="15m",
    period_days=30,
    risk_percent=1.0,
    broker_name="exness"
)

summary_keys = [
    "initial_balance", "final_balance", "final_equity", "net_pnl", "net_return_pct",
    "total_trades", "winning_trades", "losing_trades", "breakeven_trades",
    "win_rate", "profit_factor", "average_win", "average_loss", "average_r",
    "expectancy_r", "total_spread_cost", "total_commission", "total_swap",
    "max_drawdown_dollars", "max_drawdown_pct"
]

print("=== SIMULATION RESULT ===")
for k in summary_keys:
    print(f"{k}: {res.get(k)}")

with open(r"c:\Users\HP\Desktop\trade-z\scratch\latest_sim_result.json", "w") as f:
    # Save the full result for inspection
    json.dump(res, f, indent=2)

print(f"Saved {len(res.get('trades', []))} trades to latest_sim_result.json")
