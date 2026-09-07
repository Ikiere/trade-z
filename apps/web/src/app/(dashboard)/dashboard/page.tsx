'use client';

import { useState } from 'react';
import LiveScannerWidget from '@/components/dashboard/live-scanner';
import TradingViewChart from '@/components/charts/tradingview-chart';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Activity,
  ShieldCheck, Loader2, XCircle, ArrowUpRight, WifiOff, Zap
} from 'lucide-react';
import Link from 'next/link';
import { useMt5, Mt5Position } from '@/lib/mt5-sync-context';

export default function DashboardPage() {
  const {
    bridgeStatus,
    positions,
    summary,
    account,
    closePosition,
  } = useMt5();

  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [activeChartPair, setActiveChartPair] = useState('EURUSD');

  // Handle direct close from dashboard table
  const handleDirectClose = async (ticket: number) => {
    setClosingTicket(ticket);
    try {
      await closePosition(ticket);
    } finally {
      setClosingTicket(null);
    }
  };

  const balance = account?.balance ?? summary?.balance ?? 0;
  const equity = account?.equity ?? summary?.equity ?? 0;
  const floatingPnl = summary?.total_floating_pnl ?? 0;
  const freeMargin = account?.free_margin ?? balance;
  const marginLevel = account?.margin_level ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Trading Command Center</h1>
            {bridgeStatus === 'connected' ? (
              <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                MT5 LIVE
              </span>
            ) : bridgeStatus === 'disconnected' ? (
              <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                <WifiOff className="w-3 h-3" />
                BRIDGE OFFLINE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-0.5 rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
                CONNECTING
              </span>
            )}
          </div>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            {bridgeStatus === 'connected'
              ? `CONNECTED TO MT5 ACCOUNT #${account?.login || 'ACTIVE'} · AUTO-EXECUTION READY`
              : 'LOCAL BRIDGE OFFLINE · LAUNCH START_MT5_BRIDGE.BAT FOR LIVE TRADING'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/trades"
            className="btn btn-secondary text-xs font-mono font-bold flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-brand-400" />
            Positions ({positions.length})
          </Link>
          <Link
            href="/history"
            className="btn btn-secondary text-xs font-mono font-bold"
          >
            Trade History
          </Link>
          <Link
            href="/chat"
            className="btn btn-primary text-xs font-mono font-bold flex items-center gap-1"
          >
            AI Assistant
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Live Account Strip Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Balance */}
        <div className="card p-4 flex flex-col justify-between min-h-[96px] border border-[#1e293b] bg-bg-secondary/60">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-mono font-semibold">
              Account Balance
            </span>
            <div className="w-7 h-7 rounded-lg bg-bg-elevated flex items-center justify-center text-brand-400 shrink-0">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold font-mono text-white">
              {bridgeStatus === 'connected' ? `$${balance.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
            <div className="text-[10px] text-[#64748b] font-mono mt-0.5">
              {account?.currency || 'USD'} Core Capital
            </div>
          </div>
        </div>

        {/* Equity */}
        <div className="card p-4 flex flex-col justify-between min-h-[96px] border border-[#1e293b] bg-bg-secondary/60">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-mono font-semibold">
              Current Equity
            </span>
            <div className="w-7 h-7 rounded-lg bg-bg-elevated flex items-center justify-center text-blue-400 shrink-0">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold font-mono text-white">
              {bridgeStatus === 'connected' ? `$${equity.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
            <div className="text-[10px] text-[#64748b] font-mono mt-0.5">
              Real-time Net Asset Value
            </div>
          </div>
        </div>

        {/* Floating P&L */}
        <div className={`card p-4 flex flex-col justify-between min-h-[96px] border ${
          floatingPnl >= 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-mono font-semibold">
              Floating P&L
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              floatingPnl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className={`text-lg md:text-xl font-bold font-mono ${floatingPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {bridgeStatus === 'connected' ? `${floatingPnl >= 0 ? '+' : ''}$${floatingPnl.toFixed(2)}` : '—'}
            </div>
            <div className="text-[10px] text-[#64748b] font-mono mt-0.5">
              {positions.length} Active {positions.length === 1 ? 'Trade' : 'Trades'}
            </div>
          </div>
        </div>

        {/* Free Margin & Health */}
        <div className="card p-4 flex flex-col justify-between min-h-[96px] border border-[#1e293b] bg-bg-secondary/60">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-mono font-semibold">
              Free Margin
            </span>
            <div className="w-7 h-7 rounded-lg bg-bg-elevated flex items-center justify-center text-yellow-400 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold font-mono text-white">
              {bridgeStatus === 'connected' ? `$${freeMargin.toLocaleString('en', { minimumFractionDigits: 2 })}` : '—'}
            </div>
            <div className="text-[10px] text-[#64748b] font-mono mt-0.5">
              {marginLevel > 0 ? `Margin Level: ${marginLevel.toFixed(0)}%` : 'No open margin used'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Core Grid: AI Scanner & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: AI Scanner & Auto-Execution */}
        <div className="lg:col-span-7 space-y-4">
          <LiveScannerWidget />
        </div>

        {/* Right: Live TradingView Chart */}
        <div className="lg:col-span-5 space-y-3 flex flex-col">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Market Action &bull; {activeChartPair}
            </span>
            <div className="flex gap-1">
              {['EURUSD', 'XAUUSD', 'GBPUSD'].map((pair) => (
                <button
                  key={pair}
                  onClick={() => setActiveChartPair(pair)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                    activeChartPair === pair
                      ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                      : 'text-[#64748b] hover:text-white'
                  }`}
                >
                  {pair}
                </button>
              ))}
            </div>
          </div>
          <div className="card p-3 flex-1 min-h-[380px] overflow-hidden border border-[#1e293b]">
            <TradingViewChart pair={activeChartPair} />
          </div>
        </div>
      </div>

      {/* Live Active Positions Table with Direct 1-Click Close */}
      <div className="card p-5 border border-[#1e293b]">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Live MT5 Open Positions</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
              {positions.length} Active
            </span>
          </div>
          <Link
            href="/trades"
            className="text-xs text-brand-400 hover:text-brand-300 font-mono font-semibold flex items-center gap-1"
          >
            Manage All Trades
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          {bridgeStatus === 'loading' ? (
            <div className="text-center py-8 text-xs text-[#64748b] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
              Connecting to MT5 terminal...
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <div className="w-10 h-10 rounded-full bg-bg-secondary border border-[#1e293b] flex items-center justify-center mx-auto text-[#64748b]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-white">No active open positions</p>
              <p className="text-[11px] text-[#64748b] font-mono">
                The AI scanner is actively monitoring your watchlist for institutional entries.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse font-mono">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Asset</th>
                  <th className="py-2.5 px-3 text-right hidden sm:table-cell">Size</th>
                  <th className="py-2.5 px-3 text-right hidden md:table-cell">Entry</th>
                  <th className="py-2.5 px-3 text-right">Live Price</th>
                  <th className="py-2.5 px-3 text-right hidden sm:table-cell">Stop Loss</th>
                  <th className="py-2.5 px-3 text-right hidden sm:table-cell">Take Profit</th>
                  <th className="py-2.5 px-3 text-right">Floating P&L</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b] text-xs">
                {positions.map((pos) => {
                  const isLong = pos.direction === 'long';
                  const isProfit = pos.profit >= 0;
                  const priceDiff = pos.price_current - pos.price_open;
                  const priceIsGood = isLong ? priceDiff >= 0 : priceDiff <= 0;
                  const isClosing = closingTicket === pos.ticket;

                  return (
                    <tr key={pos.ticket} className="hover:bg-bg-hover/20 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                            isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                          }`}>
                            {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          </span>
                          <div>
                            <span className="font-bold text-white">{pos.pair}</span>
                            <span className="text-[9px] text-[#64748b] ml-1.5">#{pos.ticket}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-[#94a3b8] hidden sm:table-cell">
                        {pos.volume.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right text-white hidden md:table-cell">
                        {pos.price_open.toFixed(5)}
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${priceIsGood ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.price_current.toFixed(5)}
                      </td>
                      <td className="py-3 px-3 text-right text-red-400 hidden sm:table-cell">
                        {pos.sl > 0 ? pos.sl.toFixed(5) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400 hidden sm:table-cell">
                        {pos.tp > 0 ? pos.tp.toFixed(5) : '—'}
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}${pos.profit.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {/* Direct Close Button on Dashboard */}
                        <button
                          disabled={isClosing}
                          onClick={() => handleDirectClose(pos.ticket)}
                          className="px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/25 text-[10px] font-bold font-mono transition-all disabled:opacity-50 inline-flex items-center gap-1"
                          title="Close position immediately at market"
                        >
                          {isClosing ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
