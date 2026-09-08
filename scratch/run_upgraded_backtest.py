"""
Execute Corrected Multi-Asset Simulation for Trade-Z v2.2-EmpiricalSMC
Runs EURUSD + GBPUSD + XAUUSD on $100 starting capital with 1% risk.
Compares results directly with the audited 61-trade benchmark.
"""

import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))
sys.path.insert(0, os.path.abspath("c:/Users/HP/Desktop/trade-z/apps/ai-service"))

import json
from collections import Counter
from app.services.real_market_simulator import real_market_simulator

def main():
    print("=" * 70)
    print("RUNNING TRADE-Z v2.2-EmpiricalSMC MULTI-ASSET SIMULATION")
    print("EURUSD + GBPUSD + XAUUSD | Balance: $100 | Risk: 1.0% | Timeframe: 15m")
    print("=" * 70)

    res = real_market_simulator.run_simulation(
        symbols=["EURUSD", "GBPUSD", "XAUUSD"],
        initial_balance=100.0,
        timeframe="15m",
        period_days=30,
        bars=600,
        risk_percent=1.0,
        broker_name="exness",
        ai_mode="ai_assisted"
    )

    summary = res["summary"]
    trades = res["trades"]

    print("\n[SUMMARY METRICS]")
    print(f"Starting Balance:           ${summary['starting_balance']:.2f}")
    print(f"Ending Balance:             ${summary['ending_balance']:.2f}")
    print(f"Ending Equity:              ${summary['ending_equity']:.2f}")
    print(f"Net P&L:                    ${summary['net_pnl']:.2f} ({summary['net_return_pct']:.2f}%)")
    print(f"Total Trades:               {summary['total_trades']}")
    print(f"Wins / Losses / BE:         {summary['winning_trades']} / {summary['losing_trades']} / {summary['breakeven_trades']}")
    print(f"Win Rate:                   {summary['win_rate']:.1f}%")
    print(f"Profit Factor:              {summary['profit_factor']:.2f}")
    print(f"Arithmetic Expectancy (R):  {summary['arithmetic_expectancy_r']:.2f}R")
    print(f"Realized Drawdown (Closed): {summary['max_closed_drawdown_pct']:.2f}%")
    print(f"Floating Excursion DD:      {summary['max_floating_drawdown_pct']:.2f}%")
    print(f"Peak Margin Utilization:    {summary['peak_margin_utilization']:.2f}%")
    print(f"Margin Calls / Stop-Outs:   {summary['margin_calls']} / {summary['stop_out_events']}")
    print(f"Unexecutable Setups Shield: {res['unexecutable_setups_count']}")
    print(f"Strategy Version:           {res['strategy_version']}")
    print(f"Promotion Gate:             {res['promotion_gate']}")

    # Symbol breakdown
    sym_counts = Counter(t["symbol"] for t in trades)
    print("\n[TRADE DISTRIBUTION BY SYMBOL]")
    for s, c in sym_counts.items():
        sym_trades = [t for t in trades if t["symbol"] == s]
        sym_pnl = sum(t["net_pnl"] for t in sym_trades)
        sym_wins = len([t for t in sym_trades if t["outcome"] == "WIN"])
        sym_losses = len([t for t in sym_trades if t["outcome"] == "LOSS"])
        sym_be = len([t for t in sym_trades if t["outcome"] == "BREAKEVEN"])
        print(f"- {s}: {c} trades (Wins: {sym_wins}, Losses: {sym_losses}, BE: {sym_be}) | P&L: ${sym_pnl:+.2f}")

    # Sentinel Counterfactual Audit
    sentinel = res.get("sentinel_audit", {})
    matrix = sentinel.get("counterfactual_expectancy_matrix", {})
    print("\n[SENTINEL COUNTERFACTUAL AUDIT (VARIANTS A-H)]")
    for var_name, data in matrix.items():
        print(f"- {var_name:30}: Expectancy = {data['expectancy_r']:+.2f}R | Stopped at BE = {data.get('stopped_at_be_pct', 0.0)}%")
    print(f"Recommended Sentinel Method: {sentinel.get('recommended_sentinel_method', 'N/A')}")

    # Save output json
    with open("scratch/upgraded_simulation_results.json", "w") as f:
        # Avoid serializing non-serializable objects
        json.dump({
            "summary": summary,
            "symbol_distribution": dict(sym_counts),
            "sentinel_audit": sentinel,
            "sample_trades": trades[:10]
        }, f, indent=2)
    print("\nSaved full results to scratch/upgraded_simulation_results.json")

if __name__ == "__main__":
    main()
