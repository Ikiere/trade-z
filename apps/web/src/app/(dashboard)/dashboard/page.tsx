'use client';

import MarketSentimentWidget from '@/components/dashboard/sentiment-widget';
import AIStatusWidget from '@/components/dashboard/ai-status-widget';
import LiveScannerWidget from '@/components/dashboard/live-scanner';
import EconomicCalendarWidget from '@/components/dashboard/economic-calendar-widget';
import LatestSignalsWidget from '@/components/dashboard/latest-signals';
import TradingViewChart from '@/components/charts/tradingview-chart';
import { MOCK_PORTFOLIO_STATS, MOCK_OPEN_TRADES } from '@/lib/mock-data';
import { TrendingUp, Award, DollarSign, Wallet, ShieldAlert, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AI Command Center</h1>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            LIVE MARKET WORKSPACE • 42 SCANNERS ACTIVE
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/chat"
            className="btn btn-primary text-xs"
          >
            Ask AI Assistant
          </Link>
        </div>
      </div>

      {/* Quick stats cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Equity', value: `$${MOCK_PORTFOLIO_STATS.totalEquity.toLocaleString()}`, icon: Wallet, desc: 'Balance: $104,520.50' },
          { label: 'Today P&L', value: `+$${MOCK_PORTFOLIO_STATS.todayPnl.toFixed(2)}`, icon: TrendingUp, desc: '+0.33% daily change', color: 'text-emerald-400' },
          { label: 'Win Rate', value: `${MOCK_PORTFOLIO_STATS.winRate}%`, icon: Award, desc: '58 total trades executed' },
          { label: 'Active Drawdown', value: '0.00%', icon: ShieldAlert, desc: 'Max limit: 5.0%', color: 'text-[#64748b]' },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="card p-4 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-mono font-semibold">
                  {stat.label}
                </span>
                <p className={`text-xl font-bold font-mono text-white ${stat.color || ''}`}>{stat.value}</p>
                <p className="text-[10px] text-[#94a3b8] font-mono">{stat.desc}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center text-[#64748b] shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Live Analytics Chart & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Chart */}
        <div className="lg:col-span-2 space-y-6">
          <TradingViewChart pair="EURUSD" />
          <LatestSignalsWidget />
        </div>

        {/* Right 1 Column: Widgets */}
        <div className="space-y-6">
          <AIStatusWidget />
          <MarketSentimentWidget />
          <LiveScannerWidget />
          <EconomicCalendarWidget />
        </div>
      </div>

      {/* Open Trades Summary Panel */}
      <div className="card p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-white">Active Positions ({MOCK_OPEN_TRADES.length})</h3>
          <Link
            href="/trades"
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
          >
            Manage Trades
          </Link>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono">
                <th className="pb-2">Asset</th>
                <th className="pb-2 text-right">Size</th>
                <th className="pb-2 text-right">Entry</th>
                <th className="pb-2 text-right">Current</th>
                <th className="pb-2 text-right">P&L ($)</th>
                <th className="pb-2 text-right">P&L (Pips)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b] text-xs">
              {MOCK_OPEN_TRADES.map((trade) => {
                const isLong = trade.direction === 'long';
                const isProfit = (trade.pnl || 0) >= 0;
                return (
                  <tr key={trade.id} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-3 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                      <span className="font-bold text-white font-mono">{trade.pair}</span>
                    </td>
                    <td className="py-3 text-right font-mono text-[#94a3b8]">{trade.lotSize.toFixed(2)} Lots</td>
                    <td className="py-3 text-right font-mono text-white">{trade.entryPrice.toFixed(5)}</td>
                    <td className="py-3 text-right font-mono text-white">{(trade.currentPrice || 0).toFixed(5)}</td>
                    <td className={`py-3 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${(trade.pnl || 0).toFixed(2)}
                    </td>
                    <td className={`py-3 text-right font-mono font-medium ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{(trade.pips || 0).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
