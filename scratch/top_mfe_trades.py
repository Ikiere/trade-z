import json

with open(r"c:\Users\HP\Desktop\trade-z\scratch\audit_target_backtest.json", "r", encoding="utf-8") as f:
    data = json.load(f)

trades = data["trades"]
print("Top 15 trades by MFE in R:")
sorted_mfe = sorted(trades, key=lambda t: t.get("mfe_r", 0.0), reverse=True)
for t in sorted_mfe[:15]:
    sl = t.get("initial_stop_loss") or t.get("sl")
    sl_dist = abs(t["entry_price"] - sl) if sl else 0.001
    mfe_dollars = t.get("mfe_r", 0.0) * t.get("initial_risk_money", 1.0)
    print(f"Trade {t['trade_id']} ({t['symbol']} {t['direction']}): entry={t['entry_price']}, exit={t.get('exit_price')}, SL={sl}, TP={t.get('tp')}, MFE={t.get('mfe_r')}R (${mfe_dollars:.2f}), Outcome={t['outcome']}, ExitReason={t.get('exit_reason')}")
