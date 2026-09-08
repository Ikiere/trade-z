import json
import numpy as np
import pandas as pd
from collections import defaultdict, Counter

with open(r"c:\Users\HP\Desktop\trade-z\scratch\audit_target_backtest.json", "r", encoding="utf-8") as f:
    data = json.load(f)

summary = data.get("summary", {})
trades = data.get("trades", [])
curve = data.get("equity_curve", [])
params = data.get("parameters", {})

print("=== 1. TRADE RECONCILIATION SUMMARY ===")
starting_bal = summary["starting_balance"]
ending_bal = summary["ending_balance"]
sum_net_pnl = round(sum(t["net_pnl"] for t in trades), 2)
sum_gross_pnl = round(sum(t.get("gross_pnl", 0.0) for t in trades), 2)
sum_spread = round(sum(t.get("spread_cost", 0.0) for t in trades), 2)
sum_comm = round(sum(t.get("commission", 0.0) for t in trades), 2)
sum_swap = round(sum(t.get("swap", 0.0) for t in trades), 2)

print(f"Starting balance: ${starting_bal:.2f}")
print(f"Ending balance: ${ending_bal:.2f}")
print(f"Sum net PnL: ${sum_net_pnl:.2f}")
print(f"Ending - Starting: ${ending_bal - starting_bal:.2f}")
print(f"Sum Gross PnL: ${sum_gross_pnl:.2f}")
print(f"Sum Spread: ${sum_spread:.2f}")
print(f"Sum Comm: ${sum_comm:.2f}")
print(f"Sum Swap: ${sum_swap:.2f}")

# Check trade 61 specifically
t61 = trades[-1]
print("\n=== TRADE 61 (THE WINNER) ===")
for k in ["trade_id", "symbol", "direction", "volume", "entry_price", "exit_price", "sl", "tp", "initial_risk_money", "gross_pnl", "net_pnl", "r_multiple", "mfe_r", "mae_r", "exit_reason", "outcome", "balance_before", "balance_after", "open_bar_index", "close_bar_index"]:
    print(f"  {k}: {t61.get(k)}")

# Other 60 trades summary
closed_60 = trades[:-1]
pnl_60 = sum(t["net_pnl"] for t in closed_60)
losses_60 = [t for t in closed_60 if t["outcome"] == "LOSS"]
bes_60 = [t for t in closed_60 if t["outcome"] == "BREAKEVEN"]
wins_60 = [t for t in closed_60 if t["outcome"] == "WIN"]
print(f"\n=== TRADES 1 to 60 (Excluding Trade 61) ===")
print(f"Net PnL of first 60 trades: ${pnl_60:.2f}")
print(f"Wins: {len(wins_60)}, Losses: {len(losses_60)}, BEs: {len(bes_60)}")
print(f"Loss total: ${sum(t['net_pnl'] for t in losses_60):.2f}")

# Check drawdown details
print("\n=== DRAWDOWN FORENSICS ===")
# Find peak and trough in curve
peak_eq = 0.0
peak_bar = 0
max_dd_dollars = 0.0
max_dd_pct = 0.0
trough_eq = 0.0
trough_bar = 0

for p in curve:
    eq = p["equity"]
    b = p["bar"]
    if eq > peak_eq:
        peak_eq = eq
        peak_bar = b
    dd_d = peak_eq - eq
    dd_p = (dd_d / peak_eq * 100.0) if peak_eq > 0 else 0.0
    if dd_d > max_dd_dollars:
        max_dd_dollars = dd_d
        max_dd_pct = dd_p
        trough_eq = eq
        trough_bar = b

print(f"Highest Peak Equity: ${peak_eq:.2f} at Bar {peak_bar}")
print(f"Deepest Trough Equity: ${trough_eq:.2f} at Bar {trough_bar}")
print(f"Maximum Equity Drawdown $: ${max_dd_dollars:.2f}")
print(f"Maximum Equity Drawdown %: {max_dd_pct:.2f}%")

# What about the reported 88.35%?
# In virtual_mt5_account:
# Let's see what peak_equity was inside VirtualMT5Account during simulation:
# On every bar (not just every 8th bar):
print(f"Reported final max_drawdown_pct in curve: {curve[-1]['drawdown_pct']}%")

# Setup families breakdown
print("\n=== SETUP FAMILIES SUMMARY ===")
# Map setup_id or setup_family to standard SMC families
setup_stats = defaultdict(lambda: {"count": 0, "wins": 0, "losses": 0, "bes": 0, "net_pnl": 0.0, "rs": [], "mfes": [], "maes": [], "gp": 0.0, "gl": 0.0})

for t in trades:
    sid = t.get("setup_id", "")
    # extract family from setup_id, e.g. SETUP-XAUUSD-ORDER_BLOCK_RETEST-B48 -> Order Block retest
    if "ORDER_BLOCK_RETEST" in sid or "ORDER_BLOCK" in sid:
        fam = "Order Block retest"
    elif "FVG_RETRACEMENT" in sid or "FVG" in sid:
        fam = "FVG retracement"
    elif "LIQUIDITY_SWEEP" in sid or "SWEEP" in sid:
        fam = "Liquidity sweep"
    elif "BOS" in sid:
        fam = "BOS + FVG continuation"
    elif "CHOCH" in sid:
        fam = "CHoCH reversal"
    elif "DISPLACEMENT" in sid:
        fam = "displacement continuation"
    elif "BREAKER" in sid:
        fam = "breaker"
    else:
        fam = "other"
    
    st = setup_stats[fam]
    st["count"] += 1
    if t["outcome"] == "WIN":
        st["wins"] += 1
        st["gp"] += t["net_pnl"]
    elif t["outcome"] == "LOSS":
        st["losses"] += 1
        st["gl"] += abs(t["net_pnl"])
    else:
        st["bes"] += 1
    st["net_pnl"] += t["net_pnl"]
    st["rs"].append(t["r_multiple"])
    st["mfes"].append(t.get("mfe_r", 0.0))
    st["maes"].append(t.get("mae_r", 0.0))

for fam, s in setup_stats.items():
    cnt = s["count"]
    wr = s["wins"] / cnt * 100.0
    ber = s["bes"] / cnt * 100.0
    pf = (s["gp"] / s["gl"]) if s["gl"] > 0 else (99.0 if s["gp"] > 0 else 0.0)
    avg_r = np.mean(s["rs"])
    avg_mfe = np.mean(s["mfes"])
    avg_mae = np.mean(s["maes"])
    print(f"Family: {fam} | N={cnt} | WR={wr:.1f}% | BER={ber:.1f}% | Net=${s['net_pnl']:.2f} | PF={pf:.2f} | Avg R={avg_r:.2f}R | Avg MFE={avg_mfe:.2f}R | Avg MAE={avg_mae:.2f}R")

# Look-ahead bias check
print("\n=== LOOK-AHEAD BIAS AUDIT ===")
# Check trade timestamps and bar indices
lookahead_issues = []
for t in trades:
    o_bar = t.get("open_bar_index", 0)
    c_bar = t.get("close_bar_index", 0)
    if c_bar < o_bar:
        lookahead_issues.append((t["trade_id"], "close_bar < open_bar"))
    # check if setup used future candles
    # In real_market_simulator: sub_df = df.iloc[:i+1] -> strictly historical
print(f"Chronological bar ordering violations: {len(lookahead_issues)}")

# Position sizing audit
print("\n=== POSITION SIZING AUDIT ===")
actual_risks = [t.get("initial_risk_money", 0.0) for t in trades]
equity_befores = [t.get("equity_before", 100.0) for t in trades]
risk_pcts = [r / eq * 100.0 for r, eq in zip(actual_risks, equity_befores)]
print(f"Intended Risk: 1.00%")
print(f"Actual Risk Dollars: Min=${min(actual_risks):.2f}, Max=${max(actual_risks):.2f}, Mean=${np.mean(actual_risks):.2f}")
print(f"Actual Risk % of Equity: Min={min(risk_pcts):.2f}%, Max={max(risk_pcts):.2f}%, Mean={np.mean(risk_pcts):.2f}%")
print(f"Lot size across all trades: {set(t.get('volume') for t in trades)}")

# Portfolio Risk
print("\n=== PORTFOLIO RISK AUDIT ===")
# Max simultaneous positions
bar_positions = defaultdict(int)
for t in trades:
    o = t.get("open_bar_index", 0)
    c = t.get("close_bar_index", o)
    for b in range(o, c + 1):
        bar_positions[b] += 1
max_sim = max(bar_positions.values()) if bar_positions else 0
print(f"Maximum simultaneous open positions: {max_sim}")
print(f"Margin per position: $1.42 - $1.48 (at 1:2000 leverage)")
print(f"Peak used margin: ${max_sim * 1.48:.2f} out of ~$55-$100 equity (utilization {max_sim * 1.48 / 55.0 * 100.0:.2f}%)")
