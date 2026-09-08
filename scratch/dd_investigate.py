import json

with open(r"c:\Users\HP\Desktop\trade-z\scratch\audit_target_backtest.json", "r", encoding="utf-8") as f:
    data = json.load(f)

curve = data["equity_curve"]
for p in curve:
    if p["drawdown_pct"] > 85:
        print(p)
        break

# Let's inspect the math of 88.35%
# In virtual_mt5_account.py:
# self.peak_equity
# dd_dollars = self.peak_equity - self.equity
# dd_pct = (dd_dollars / self.peak_equity * 100.0)
# If dd_pct == 88.35%, what was peak_equity and equity?
# 1 - equity / peak_equity = 0.8835 => equity / peak_equity = 0.1165
# Or did peak_equity reach something higher during an intermediate bar that wasn't logged in equity_curve?
# Notice: equity_curve only logs every 8th bar! (i % 8 == 0)
# What if on bar i (not a multiple of 8), equity spiked to ~486, or equity dropped to ~18?
# Let's check!
print("First point where dd_pct == 88.35:")
for p in curve:
    if abs(p["drawdown_pct"] - 88.35) < 0.1:
        print(p)
