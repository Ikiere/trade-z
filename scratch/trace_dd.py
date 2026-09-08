import json

with open(r"c:\Users\HP\Desktop\trade-z\scratch\audit_target_backtest.json", "r", encoding="utf-8") as f:
    data = json.load(f)

curve = data["equity_curve"]
# Print all curve points where drawdown_pct changes
prev_dd = -1
for p in curve:
    if p["drawdown_pct"] != prev_dd:
        # Calculate implied peak
        # dd_pct = (peak - eq) / peak * 100 => peak * (1 - dd_pct/100) = eq => peak = eq / (1 - dd_pct/100)
        implied_peak = p["equity"] / (1 - p["drawdown_pct"] / 100.0) if p["drawdown_pct"] < 100 else 0
        print(f"Bar {p['bar']:<5}: bal={p['balance']:<7.2f}, eq={p['equity']:<7.2f}, dd_pct={p['drawdown_pct']:<6.2f}%, implied_peak=${implied_peak:<7.2f}")
        prev_dd = p["drawdown_pct"]
