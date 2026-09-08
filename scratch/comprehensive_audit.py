import json
import math
import numpy as np
import pandas as pd
from collections import defaultdict

with open(r"c:\Users\HP\Desktop\trade-z\scratch\audit_target_backtest.json", "r", encoding="utf-8") as f:
    data = json.load(f)

summary = data.get("summary", {})
trades = data.get("trades", [])
curve = data.get("equity_curve", [])
params = data.get("parameters", {})

print("================================================================")
print("             TRADE-Z FULL BACKTEST FORENSIC AUDIT               ")
print("================================================================")
print(f"Total Trades in Ledger: {len(trades)}")
print(f"Reported Summary: {summary}")

# -------------------------------------------------------------
# 1. RECONCILE THE ENTIRE TRADE LEDGER
# -------------------------------------------------------------
print("\n>>> AUDIT 1: RECONCILE TRADE LEDGER <<<")
starting_bal = summary.get("starting_balance", 100.0)
ending_bal = summary.get("ending_balance", 121.49)
reported_net_pnl = summary.get("net_pnl", 21.49)

ledger_sum_net_pnl = sum(t["net_pnl"] for t in trades)
ledger_sum_gross_pnl = sum(t.get("gross_pnl", 0.0) for t in trades)
ledger_sum_spread = sum(t.get("spread_cost", 0.0) for t in trades)
ledger_sum_comm = sum(t.get("commission", 0.0) for t in trades)
ledger_sum_swap = sum(t.get("swap", 0.0) for t in trades)

print(f"Starting Balance: ${starting_bal:.2f}")
print(f"Ending Balance (Reported): ${ending_bal:.2f}")
print(f"Sum of Trade net_pnl: ${ledger_sum_net_pnl:.2f}")
print(f"Calculated Ending Balance: ${starting_bal + ledger_sum_net_pnl:.2f}")
print(f"Balance Mismatch: ${abs((starting_bal + ledger_sum_net_pnl) - ending_bal):.4f}")
print(f"Gross PnL Sum: ${ledger_sum_gross_pnl:.2f}")
print(f"Spread Cost Sum: ${ledger_sum_spread:.2f}")
print(f"Commission Sum: ${ledger_sum_comm:.2f}")
print(f"Swap Sum: ${ledger_sum_swap:.2f}")

# Check trade-by-trade balance continuity
balance_chain_errors = []
prev_balance = starting_bal
for i, t in enumerate(trades):
    b_before = t.get("balance_before")
    b_after = t.get("balance_after")
    net = t.get("net_pnl")
    expected_after = round(b_before + net, 2)
    if abs(expected_after - b_after) > 0.01:
        balance_chain_errors.append((i+1, t.get("trade_id"), b_before, net, b_after, expected_after))

print(f"Balance chain errors: {len(balance_chain_errors)}")
if balance_chain_errors:
    for err in balance_chain_errors[:5]:
        print(f"  Trade #{err[0]} ID {err[1]}: before={err[2]}, pnl={err[3]}, after={err[4]}, expected={err[5]}")

# -------------------------------------------------------------
# 2. RECONCILE SUMMARY STATISTICS
# -------------------------------------------------------------
print("\n>>> AUDIT 2: RECONCILE SUMMARY STATISTICS <<<")
wins = [t for t in trades if t["outcome"] == "WIN"]
losses = [t for t in trades if t["outcome"] == "LOSS"]
bes = [t for t in trades if t["outcome"] == "BREAKEVEN"]

total_recalc = len(trades)
n_wins = len(wins)
n_losses = len(losses)
n_bes = len(bes)

win_rate_recalc = (n_wins / total_recalc * 100.0) if total_recalc else 0.0
gross_profit_recalc = sum(t["net_pnl"] for t in wins)
gross_loss_recalc = abs(sum(t["net_pnl"] for t in losses))
pf_recalc = (gross_profit_recalc / gross_loss_recalc) if gross_loss_recalc > 0 else 0.0

avg_win_recalc = (gross_profit_recalc / n_wins) if n_wins else 0.0
avg_loss_recalc = (gross_loss_recalc / n_losses) if n_losses else 0.0

avg_r_recalc = sum(t["r_multiple"] for t in trades) / total_recalc if total_recalc else 0.0

# Formula used in simulator for expectancy_r:
# expectancy_r = round((win_rate / 100.0 * (avg_win / max(1.0, avg_loss))) - ((100.0 - win_rate) / 100.0 * 1.0), 2)
# Standard expectancy formula: sum(r_multiple) / total_trades, or (win_rate * avg_win_r) - (loss_rate * avg_loss_r)
r_wins = [t["r_multiple"] for t in wins]
r_losses = [t["r_multiple"] for t in losses]
r_bes = [t["r_multiple"] for t in bes]

avg_win_r = np.mean(r_wins) if r_wins else 0.0
avg_loss_r = np.mean(r_losses) if r_losses else 0.0
avg_be_r = np.mean(r_bes) if r_bes else 0.0

true_expectancy_r = sum(t["r_multiple"] for t in trades) / total_recalc

print(f"Recalculated Trades: {total_recalc} (Wins: {n_wins}, Losses: {n_losses}, BEs: {n_bes})")
print(f"Recalculated Win Rate: {win_rate_recalc:.2f}% (Reported: {summary.get('win_rate')}%)")
print(f"Recalculated Gross Profit: ${gross_profit_recalc:.2f}")
print(f"Recalculated Gross Loss: ${gross_loss_recalc:.2f}")
print(f"Recalculated Profit Factor: {pf_recalc:.2f} (Reported: {summary.get('profit_factor')})")
print(f"Recalculated Avg Win: ${avg_win_recalc:.2f} (Reported: ${summary.get('average_win')})")
print(f"Recalculated Avg Loss: ${avg_loss_recalc:.2f} (Reported: ${summary.get('average_loss')})")
print(f"Recalculated Avg R: {avg_r_recalc:.2f}R (Reported: {summary.get('average_r')}R)")
print(f"Avg Win R: {avg_win_r:.2f}R, Avg Loss R: {avg_loss_r:.2f}R, Avg BE R: {avg_be_r:.2f}R")
print(f"Reported Expectancy R: {summary.get('expectancy_r')}R")
print(f"True Mathematical Expectancy R (mean R): {true_expectancy_r:.2f}R")

# -------------------------------------------------------------
# 3. DRAWDOWN CALCULATION
# -------------------------------------------------------------
print("\n>>> AUDIT 3: DRAWDOWN CALCULATION <<<")
# Let's inspect bar-by-bar curve vs trade-by-trade balance curve
closed_balance_curve = [starting_bal]
for t in trades:
    closed_balance_curve.append(closed_balance_curve[-1] + t["net_pnl"])

# Closed trade peak-to-trough
peak_bal = starting_bal
max_bal_dd_dollars = 0.0
max_bal_dd_pct = 0.0
for b in closed_balance_curve:
    if b > peak_bal:
        peak_bal = b
    dd_d = peak_bal - b
    dd_p = (dd_d / peak_bal * 100.0) if peak_bal > 0 else 0.0
    if dd_d > max_bal_dd_dollars:
        max_bal_dd_dollars = dd_d
        max_bal_dd_pct = dd_p

print(f"Closed-Trade Balance Peak: ${peak_bal:.2f}")
print(f"Closed-Trade Balance Trough: ${min(closed_balance_curve):.2f}")
print(f"Closed-Trade Max Drawdown $: ${max_bal_dd_dollars:.2f}")
print(f"Closed-Trade Max Drawdown %: {max_bal_dd_pct:.2f}%")

# Bar-by-bar equity curve from JSON
curve_equities = [p["equity"] for p in curve]
curve_peaks = []
c_peak = starting_bal
max_eq_dd_d = 0.0
max_eq_dd_p = 0.0
eq_peak_at_max_dd = starting_bal
eq_trough_at_max_dd = starting_bal

for p in curve:
    eq = p["equity"]
    if eq > c_peak:
        c_peak = eq
    dd_d = c_peak - eq
    dd_p = (dd_d / c_peak * 100.0) if c_peak > 0 else 0.0
    if dd_d > max_eq_dd_d:
        max_eq_dd_d = dd_d
        max_eq_dd_p = dd_p
        eq_peak_at_max_dd = c_peak
        eq_trough_at_max_dd = eq

print(f"Bar Equity Peak: ${max(curve_equities):.2f}")
print(f"Bar Equity Trough: ${min(curve_equities):.2f}")
print(f"True Bar Equity Peak-to-Trough Max Drawdown $: ${max_eq_dd_d:.2f}")
print(f"True Bar Equity Peak-to-Trough Max Drawdown %: {max_eq_dd_p:.2f}%")
print(f"Occurred from Peak ${eq_peak_at_max_dd:.2f} down to Trough ${eq_trough_at_max_dd:.2f}")
print(f"Reported Drawdown in JSON curve endpoint: {curve[-1]['drawdown_pct']}%")

# Let's see why simulator reported 88.35%:
# In virtual_mt5_account: self.peak_equity = self.initial_balance
# It only updates if equity > peak_equity!
# What was the highest equity ever reached in VirtualMT5Account?
# Let's find out what maximum equity was recorded in update_bar during trade 61 or other trades!

# -------------------------------------------------------------
# 4. ANALYZE EACH SYMBOL SEPARATELY
# -------------------------------------------------------------
print("\n>>> AUDIT 4: SYMBOL SEPARATION <<<")
symbols = ["EURUSD", "GBPUSD", "XAUUSD"]
by_sym = {s: [t for t in trades if t.get("symbol") == s or t.get("pair") == s] for s in symbols}

for s, s_trades in by_sym.items():
    s_total = len(s_trades)
    s_wins = [t for t in s_trades if t["outcome"] == "WIN"]
    s_losses = [t for t in s_trades if t["outcome"] == "LOSS"]
    s_bes = [t for t in s_trades if t["outcome"] == "BREAKEVEN"]
    
    s_wr = (len(s_wins) / s_total * 100.0) if s_total else 0.0
    s_gp = sum(t["net_pnl"] for t in s_wins)
    s_gl = abs(sum(t["net_pnl"] for t in s_losses))
    s_pf = (s_gp / s_gl) if s_gl > 0 else (99.0 if s_gp > 0 else 0.0)
    s_net = sum(t["net_pnl"] for t in s_trades)
    s_spread = sum(t.get("spread_cost", 0.0) for t in s_trades)
    s_avg_r = (sum(t["r_multiple"] for t in s_trades) / s_total) if s_total else 0.0
    s_exp = s_avg_r
    s_mfe = np.mean([t.get("mfe_r", 0.0) for t in s_trades]) if s_trades else 0.0
    s_mae = np.mean([t.get("mae_r", 0.0) for t in s_trades]) if s_trades else 0.0
    
    # Calculate symbol-specific max DD
    s_bal_curve = [0.0]
    for t in s_trades:
        s_bal_curve.append(s_bal_curve[-1] + t["net_pnl"])
    s_peak = 0.0
    s_max_dd_d = 0.0
    for b in s_bal_curve:
        if b > s_peak: s_peak = b
        if s_peak - b > s_max_dd_d: s_max_dd_d = s_peak - b

    print(f"Symbol: {s}")
    print(f"  Trades: {s_total} | W: {len(s_wins)} | L: {len(s_losses)} | BE: {len(s_bes)}")
    print(f"  Win Rate: {s_wr:.2f}% | PF: {s_pf:.2f} | Net P&L: ${s_net:.2f}")
    print(f"  Avg R: {s_avg_r:.2f}R | Expectancy: {s_exp:.2f}R")
    print(f"  Spread Cost: ${s_spread:.2f} | Max DD $: ${s_max_dd_d:.2f}")
    print(f"  Avg MFE: {s_mfe:.2f}R | Avg MAE: {s_mae:.2f}R")

# -------------------------------------------------------------
# 5. ANALYZE SETUP TYPES
# -------------------------------------------------------------
print("\n>>> AUDIT 5: SETUP TYPE BREAKDOWN <<<")
by_setup = defaultdict(list)
for t in trades:
    fam = t.get("setup_family") or t.get("setup_id", "Unknown")
    by_setup[fam].append(t)

for fam, f_trades in sorted(by_setup.items(), key=lambda x: len(x[1]), reverse=True):
    f_total = len(f_trades)
    f_wins = [t for t in f_trades if t["outcome"] == "WIN"]
    f_losses = [t for t in f_trades if t["outcome"] == "LOSS"]
    f_bes = [t for t in f_trades if t["outcome"] == "BREAKEVEN"]
    
    f_wr = (len(f_wins) / f_total * 100.0) if f_total else 0.0
    f_ber = (len(f_bes) / f_total * 100.0) if f_total else 0.0
    f_gp = sum(t["net_pnl"] for t in f_wins)
    f_gl = abs(sum(t["net_pnl"] for t in f_losses))
    f_pf = (f_gp / f_gl) if f_gl > 0 else (99.0 if f_gp > 0 else 0.0)
    f_net = sum(t["net_pnl"] for t in f_trades)
    f_avg_r = (sum(t["r_multiple"] for t in f_trades) / f_total) if f_total else 0.0
    f_mfe = np.mean([t.get("mfe_r", 0.0) for t in f_trades]) if f_trades else 0.0
    f_mae = np.mean([t.get("mae_r", 0.0) for t in f_trades]) if f_trades else 0.0
    
    print(f"Setup: {fam} (N={f_total})")
    print(f"  WR: {f_wr:.1f}% | BE Rate: {f_ber:.1f}% | PF: {f_pf:.2f} | Net P&L: ${f_net:.2f}")
    print(f"  Avg R: {f_avg_r:.2f}R | Avg MFE: {f_mfe:.2f}R | Avg MAE: {f_mae:.2f}R")

# -------------------------------------------------------------
# 6. ANALYZE SENTINEL
# -------------------------------------------------------------
print("\n>>> AUDIT 6: SENTINEL ANALYSIS <<<")
be_trades_all = [t for t in trades if t["outcome"] == "BREAKEVEN"]
print(f"Total Breakeven Trades: {len(be_trades_all)}")

# MFE before BE distribution
mfe_distribution = {
    ">= 0.5R": len([t for t in be_trades_all if t.get("mfe_r", 0.0) >= 0.5]),
    ">= 1.0R": len([t for t in be_trades_all if t.get("mfe_r", 0.0) >= 1.0]),
    ">= 1.5R": len([t for t in be_trades_all if t.get("mfe_r", 0.0) >= 1.5]),
    ">= 2.0R": len([t for t in be_trades_all if t.get("mfe_r", 0.0) >= 2.0]),
    ">= 5.0R": len([t for t in be_trades_all if t.get("mfe_r", 0.0) >= 5.0]),
    ">= 10.0R": len([t for t in be_trades_all if t.get("mfe_r", 0.0) >= 10.0]),
}
print("MFE thresholds for BE trades:")
for thresh, count in mfe_distribution.items():
    print(f"  BE trades with MFE {thresh}: {count} ({count/len(be_trades_all)*100.0:.1f}%)")

# How many BE trades had MFE >= initial target (TP)?
tp_reached_by_be = []
for t in be_trades_all:
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    sl_dist = abs(entry - sl)
    target_r = abs(tp - entry) / sl_dist if sl_dist > 0 else 2.5
    mfe_r = t.get("mfe_r", 0.0)
    if mfe_r >= target_r:
        tp_reached_by_be.append((t["trade_id"], t["symbol"], mfe_r, target_r))

print(f"BE trades where MFE reached or exceeded initial TP: {len(tp_reached_by_be)}")
for item in tp_reached_by_be:
    print(f"  Trade {item[0]} ({item[1]}): MFE {item[2]}R >= Target {item[3]:.2f}R")

# Calculate potential P&L sacrificed
sacrificed_pnl = 0.0
for t in be_trades_all:
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    sl_dist = abs(entry - sl)
    target_r = abs(tp - entry) / sl_dist if sl_dist > 0 else 2.5
    mfe_r = t.get("mfe_r", 0.0)
    risk_dollars = t.get("initial_risk_money", 1.0)
    if mfe_r >= target_r:
        sacrificed_pnl += (target_r * risk_dollars)

print(f"Potentially sacrificed P&L by premature BE (trades reaching full TP): ${sacrificed_pnl:.2f}")

# -------------------------------------------------------------
# 7. SENTINEL COUNTERFACTUALS
# -------------------------------------------------------------
print("\n>>> AUDIT 7: SENTINEL COUNTERFACTUALS <<<")
# Test variants A through H on EXACT same trade candidates:
# A: Current Sentinel
# B: No BE (pure target or SL)
# C: BE at 0.5R
# D: BE at 1.0R
# E: BE at 1.5R
# F: Structure-confirmed BE (e.g. BE at 2.0R)
# G: Liquidity-confirmed BE (e.g. BE at 2.5R)
# H: ATR/volatility-based trailing stop (trailing behind MFE by 1.0R once MFE >= 1.5R)

def evaluate_variant(variant_name, resolve_trade_fn):
    variant_pnls = []
    variant_rs = []
    for t in trades:
        r, pnl = resolve_trade_fn(t)
        variant_rs.append(r)
        variant_pnls.append(pnl)
    
    total = len(variant_pnls)
    net_pnl = sum(variant_pnls)
    fin_bal = starting_bal + net_pnl
    v_wins = [p for p in variant_pnls if p > 0.01]
    v_losses = [p for p in variant_pnls if p < -0.01]
    v_bes = [p for p in variant_pnls if abs(p) <= 0.01]
    
    gp = sum(v_wins)
    gl = abs(sum(v_losses))
    pf = (gp / gl) if gl > 0 else (99.0 if gp > 0 else 0.0)
    exp_r = sum(variant_rs) / total if total else 0.0
    
    # Max DD
    bal_curve = [starting_bal]
    for p in variant_pnls:
        bal_curve.append(bal_curve[-1] + p)
    peak = starting_bal
    max_dd_d = 0.0
    max_dd_pct = 0.0
    for b in bal_curve:
        if b > peak: peak = b
        dd = peak - b
        dd_p = (dd / peak * 100.0) if peak > 0 else 0.0
        if dd > max_dd_d:
            max_dd_d = dd
            max_dd_pct = dd_p
            
    return {
        "variant": variant_name,
        "final_balance": round(fin_bal, 2),
        "net_pnl": round(net_pnl, 2),
        "wins": len(v_wins),
        "losses": len(v_losses),
        "bes": len(v_bes),
        "profit_factor": round(pf, 2),
        "expectancy_r": round(exp_r, 2),
        "max_dd_pct": round(max_dd_pct, 2)
    }

# Variant A: Current Actual
res_a = evaluate_variant("A. Current Sentinel", lambda t: (t["r_multiple"], t["net_pnl"]))

# Variant B: No BE (Pure Target or Initial SL)
# For BE trades: if mfe_r >= target_r -> WIN (+target_r * risk_money), else LOSS (-1.0R * risk_money)
def resolve_b(t):
    risk_money = t.get("initial_risk_money", 1.0)
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    sl_dist = abs(entry - sl)
    target_r = abs(tp - entry) / sl_dist if sl_dist > 0 else 2.5
    if t["outcome"] == "BREAKEVEN":
        if t.get("mfe_r", 0.0) >= target_r:
            return target_r, round(target_r * risk_money, 2)
        else:
            return -1.0, round(-1.0 * risk_money, 2)
    return t["r_multiple"], t["net_pnl"]
res_b = evaluate_variant("B. No BE (Pure Target/SL)", resolve_b)

# Variant C: BE at 0.5R
def resolve_c(t):
    risk_money = t.get("initial_risk_money", 1.0)
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    target_r = abs(tp - entry) / max(0.0001, abs(entry - sl))
    mfe = t.get("mfe_r", 0.0)
    if mfe >= target_r:
        return target_r, round(target_r * risk_money, 2)
    elif mfe >= 0.5:
        return 0.0, 0.0
    else:
        return -1.0, round(-1.0 * risk_money, 2)
res_c = evaluate_variant("C. BE at 0.5R", resolve_c)

# Variant D: BE at 1.0R
def resolve_d(t):
    risk_money = t.get("initial_risk_money", 1.0)
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    target_r = abs(tp - entry) / max(0.0001, abs(entry - sl))
    mfe = t.get("mfe_r", 0.0)
    if mfe >= target_r:
        return target_r, round(target_r * risk_money, 2)
    elif mfe >= 1.0:
        return 0.0, 0.0
    else:
        return -1.0, round(-1.0 * risk_money, 2)
res_d = evaluate_variant("D. BE at 1.0R", resolve_d)

# Variant E: BE at 1.5R (similar to actual logic)
def resolve_e(t):
    risk_money = t.get("initial_risk_money", 1.0)
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    target_r = abs(tp - entry) / max(0.0001, abs(entry - sl))
    mfe = t.get("mfe_r", 0.0)
    if mfe >= target_r:
        return target_r, round(target_r * risk_money, 2)
    elif mfe >= 1.5:
        return 0.0, 0.0
    else:
        return -1.0, round(-1.0 * risk_money, 2)
res_e = evaluate_variant("E. BE at 1.5R", resolve_e)

# Variant F: Structure-confirmed BE (requires MFE >= 2.0R)
def resolve_f(t):
    risk_money = t.get("initial_risk_money", 1.0)
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    target_r = abs(tp - entry) / max(0.0001, abs(entry - sl))
    mfe = t.get("mfe_r", 0.0)
    if mfe >= target_r:
        return target_r, round(target_r * risk_money, 2)
    elif mfe >= 2.0:
        return 0.0, 0.0
    else:
        return -1.0, round(-1.0 * risk_money, 2)
res_f = evaluate_variant("F. Structure-confirmed BE (2.0R)", resolve_f)

# Variant G: Liquidity-confirmed BE (requires MFE >= 2.5R)
def resolve_g(t):
    risk_money = t.get("initial_risk_money", 1.0)
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    target_r = abs(tp - entry) / max(0.0001, abs(entry - sl))
    mfe = t.get("mfe_r", 0.0)
    if mfe >= target_r:
        return target_r, round(target_r * risk_money, 2)
    elif mfe >= 2.5:
        return 0.0, 0.0
    else:
        return -1.0, round(-1.0 * risk_money, 2)
res_g = evaluate_variant("G. Liquidity-confirmed BE (2.5R)", resolve_g)

# Variant H: ATR/Volatility-based trailing stop (lock in MFE - 1.0R once MFE >= 1.5R)
def resolve_h(t):
    risk_money = t.get("initial_risk_money", 1.0)
    entry = t["entry_price"]
    sl = t["initial_stop_loss"] or t["sl"]
    tp = t["tp"]
    target_r = abs(tp - entry) / max(0.0001, abs(entry - sl))
    mfe = t.get("mfe_r", 0.0)
    if mfe >= target_r:
        return target_r, round(target_r * risk_money, 2)
    elif mfe >= 1.5:
        trailed_r = round(mfe - 1.0, 2)
        return trailed_r, round(trailed_r * risk_money, 2)
    else:
        return -1.0, round(-1.0 * risk_money, 2)
res_h = evaluate_variant("H. ATR/Trailing Stop Protection", resolve_h)

counterfactual_results = [res_a, res_b, res_c, res_d, res_e, res_f, res_g, res_h]
print(f"{'Variant':<35} | {'Balance':<9} | {'Net P&L':<8} | {'PF':<5} | {'Exp (R)':<7} | {'Max DD%':<7} | {'W/L/BE'}")
print("-" * 90)
for r in counterfactual_results:
    wlb = f"{r['wins']}/{r['losses']}/{r['bes']}"
    print(f"{r['variant']:<35} | ${r['final_balance']:<8.2f} | ${r['net_pnl']:<7.2f} | {r['profit_factor']:<5.2f} | {r['expectancy_r']:<7.2f} | {r['max_dd_pct']:<6.2f}% | {wlb}")

# -------------------------------------------------------------
# 8. DUPLICATE / REPEATED SETUPS & CLUSTERING
# -------------------------------------------------------------
print("\n>>> AUDIT 8: DUPLICATE / REPEATED SETUPS <<<")
# Check how many trades occur within short bar intervals on the same symbol or same entry
clusters = defaultdict(list)
for t in trades:
    sym = t.get("symbol")
    bar = t.get("open_bar_index", 0)
    clusters[sym].append(t)

repeated_entries = []
for sym, sym_t in clusters.items():
    sym_t_sorted = sorted(sym_t, key=lambda x: x.get("open_bar_index", 0))
    for i in range(len(sym_t_sorted) - 1):
        t1 = sym_t_sorted[i]
        t2 = sym_t_sorted[i+1]
        bar_gap = t2.get("open_bar_index", 0) - t1.get("close_bar_index", t1.get("open_bar_index", 0))
        entry_diff = abs(t2.get("entry_price", 0) - t1.get("entry_price", 0))
        if bar_gap <= 4 or entry_diff == 0:
            repeated_entries.append((sym, t1.get("trade_id"), t2.get("trade_id"), bar_gap, t1.get("entry_price"), t2.get("entry_price"), t1.get("direction"), t2.get("direction")))

print(f"Total closely clustered/rapid re-entries (gap <= 4 bars or identical entry): {len(repeated_entries)}")
for re in repeated_entries[:10]:
    print(f"  {re[0]}: Trade {re[1]} -> Trade {re[2]} | bar gap: {re[3]} | entries: {re[4]} -> {re[5]} | dir: {re[6]} -> {re[7]}")

# -------------------------------------------------------------
# 10. MARGIN VERIFICATION
# -------------------------------------------------------------
print("\n>>> AUDIT 10: MARGIN VERIFICATION <<<")
margin_anomalies = []
for t in trades:
    mb = t.get("margin_before")
    ma = t.get("margin_after")
    rm = t.get("required_margin")
    vol = t.get("volume")
    sym = t.get("symbol")
    eq_b = t.get("equity_before")
    # Check if required margin formula holds: vol * contract_size * price / 2000
    if mb is None or ma is None or rm is None:
        margin_anomalies.append((t.get("trade_id"), "Missing margin fields"))
    elif rm <= 0:
        margin_anomalies.append((t.get("trade_id"), f"Required margin <= 0: {rm}"))

print(f"Margin anomalies found: {len(margin_anomalies)}")
sample_margins = [(t["trade_id"], t["symbol"], t["volume"], t["entry_price"], t["required_margin"], t["margin_before"], t["margin_after"]) for t in trades[:5]]
print("Sample trade margins (trade_id, sym, vol, entry, req_margin, margin_before, margin_after):")
for sm in sample_margins:
    print(f"  {sm}")

# -------------------------------------------------------------
# 11. COST ACCOUNTING
# -------------------------------------------------------------
print("\n>>> AUDIT 11: COST ACCOUNTING <<<")
# Check if net_pnl = gross_pnl - spread_cost - commission - swap
cost_mismatches = []
for t in trades:
    gross = t.get("gross_pnl", 0.0)
    net = t.get("net_pnl", 0.0)
    spread = t.get("spread_cost", 0.0)
    comm = t.get("commission", 0.0)
    swap = t.get("swap", 0.0)
    
    # In virtual_mt5_account:
    # Does gross_pnl already include spread in entry price?
    # Long: points = (exit_price - entry_price) / tick_size.
    # Notice: entry_price was actual_entry = top_cand.entry_price + spread/2 + slippage!
    # And exit_price was bid = mid - spread/2.
    # So the spread is ALREADY baked into (exit_price - entry_price)!
    # Let's check if spread_cost was ALSO separately subtracted or if net_pnl == gross_pnl!
    diff = round(gross - net, 2)
    cost_mismatches.append((t["trade_id"], gross, net, spread, comm, swap, diff))

# Check whether net_pnl == gross_pnl or net_pnl == gross_pnl - spread_cost
double_count_count = 0
exact_gross_equals_net = 0
for cm in cost_mismatches:
    if abs(cm[1] - cm[2]) < 0.01:
        exact_gross_equals_net += 1
    elif abs(cm[1] - cm[3] - cm[2]) < 0.01:
        double_count_count += 1

print(f"Trades where gross_pnl == net_pnl: {exact_gross_equals_net} of {len(trades)}")
print(f"Trades where gross_pnl - spread_cost == net_pnl: {double_count_count} of {len(trades)}")
print(f"Sample cost check (trade_id, gross, net, spread, diff):")
for cm in cost_mismatches[:5]:
    print(f"  ID {cm[0]}: gross={cm[1]}, net={cm[2]}, spread={cm[3]}, diff={cm[6]}")

# -------------------------------------------------------------
# 12. POSITION SIZING
# -------------------------------------------------------------
print("\n>>> AUDIT 12: POSITION SIZING <<<")
# For every trade: calculate intended risk %, actual risk %, equity, risk dollars, lot size, SL distance
sizing_records = []
for t in trades:
    eq = t.get("equity_before", starting_bal)
    intended_risk_pct = 1.0
    intended_risk_dollars = eq * 0.01
    actual_risk_dollars = t.get("initial_risk_money", 0.0)
    actual_risk_pct = (actual_risk_dollars / eq * 100.0) if eq > 0 else 0.0
    lot = t.get("volume", 0.01)
    sl_dist = abs(t.get("entry_price", 0.0) - (t.get("initial_stop_loss") or t.get("sl", 0.0)))
    sym = t.get("symbol")
    sizing_records.append({
        "trade_id": t["trade_id"],
        "symbol": sym,
        "equity": eq,
        "intended_risk_pct": intended_risk_pct,
        "intended_risk_dollars": round(intended_risk_dollars, 2),
        "actual_risk_dollars": actual_risk_dollars,
        "actual_risk_pct": round(actual_risk_pct, 2),
        "lot": lot,
        "sl_dist": round(sl_dist, 5)
    })

sizing_df = pd.DataFrame(sizing_records)
print(sizing_df.groupby("symbol")[["intended_risk_dollars", "actual_risk_dollars", "actual_risk_pct", "lot", "sl_dist"]].mean())

# -------------------------------------------------------------
# 13. PORTFOLIO RISK
# -------------------------------------------------------------
print("\n>>> AUDIT 13: PORTFOLIO RISK <<<")
# Check overlapping trades in time
# Determine max concurrent open positions across simulation bars
bar_occupancy = defaultdict(list)
for t in trades:
    o = t.get("open_bar_index", 0)
    c = t.get("close_bar_index", o + 1)
    for b in range(o, c + 1):
        bar_occupancy[b].append(t)

max_concurrent = max(len(v) for v in bar_occupancy.values())
bars_with_multiple = sum(1 for v in bar_occupancy.values() if len(v) > 1)
print(f"Max concurrent open positions: {max_concurrent}")
print(f"Total bars with > 1 simultaneous open positions: {bars_with_multiple}")

# Correlated EURUSD + GBPUSD open at same time
correlated_bars = 0
for b, b_trades in bar_occupancy.items():
    b_syms = {t["symbol"] for t in b_trades}
    if "EURUSD" in b_syms and "GBPUSD" in b_syms:
        correlated_bars += 1
print(f"Bars with simultaneous EURUSD and GBPUSD exposure: {correlated_bars}")
