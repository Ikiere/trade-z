import json

with open(r"c:\Users\HP\Desktop\trade-z\scratch\audit_target_backtest.json", "r", encoding="utf-8") as f:
    d = json.load(f)

curve = d.get("equity_curve", [])
print(f"Total curve points: {len(curve)}")
min_eq = min(p["equity"] for p in curve)
max_eq = max(p["equity"] for p in curve)
print(f"Min equity in curve: {min_eq}, Max equity in curve: {max_eq}")

for i, p in enumerate(curve):
    if p["drawdown_pct"] > 50 or p["equity"] < 50:
        print(f"Point {i}: bar={p['bar']}, bal={p['balance']}, eq={p['equity']}, dd_pct={p['drawdown_pct']}")

# Let's inspect the trades
trades = d.get("trades", [])
print(f"\nTotal trades: {len(trades)}")
win_trades = [t for t in trades if t["outcome"] == "WIN"]
loss_trades = [t for t in trades if t["outcome"] == "LOSS"]
be_trades = [t for t in trades if t["outcome"] == "BREAKEVEN"]
print(f"Wins: {len(win_trades)}, Losses: {len(loss_trades)}, BEs: {len(be_trades)}")

if win_trades:
    w = win_trades[0]
    print("\n--- THE SINGLE WINNING TRADE ---")
    for k in ["trade_id", "symbol", "direction", "volume", "entry_price", "exit_price", "sl", "tp", "net_pnl", "r_multiple", "gross_pnl", "spread_cost", "exit_reason"]:
        print(f"  {k}: {w.get(k)}")
