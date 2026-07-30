'use client';

import { useEffect, useState } from 'react';
import MarketSentimentWidget from '@/components/dashboard/sentiment-widget';
import AIStatusWidget from '@/components/dashboard/ai-status-widget';
import LiveScannerWidget from '@/components/dashboard/live-scanner';
import EconomicCalendarWidget from '@/components/dashboard/economic-calendar-widget';
import LatestSignalsWidget from '@/components/dashboard/latest-signals';
import TradingViewChart from '@/components/charts/tradingview-chart';
import { TrendingUp, Award, DollarSign, Wallet, ShieldAlert, BookOpen, GraduationCap, X } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import type { Trade } from '@trade-z/types';

interface PortfolioStats {
  totalEquity: number;
  balance: number;
  todayPnl: number;
  winRate: number;
  drawdown: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<PortfolioStats>({
    totalEquity: 10000.00,
    balance: 10000.00,
    todayPnl: 0,
    winRate: 0,
    drawdown: 0,
  });
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Beginner Mode State to simplify explanations
  const [isBeginnerMode, setIsBeginnerMode] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Fetch default portfolio
        const { data: portfolio } = await supabase
          .from('portfolios')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_default', true)
          .maybeSingle();

        // 2. Fetch open positions
        const { data: activePositions } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'open');

        // 3. Fetch completed positions for stats
        const { data: closedTrades } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['closed', 'stopped_out', 'take_profit', 'partially_closed']);

        // Calculate win rate
        let winRate = 0;
        if (closedTrades && closedTrades.length > 0) {
          const profitable = closedTrades.filter(t => (t.pnl || 0) > 0).length;
          winRate = Math.round((profitable / closedTrades.length) * 100);
        }

        if (portfolio) {
          setStats({
            totalEquity: Number(portfolio.equity),
            balance: Number(portfolio.balance),
            todayPnl: Number(portfolio.today_pnl),
            winRate,
            drawdown: Number(portfolio.margin_level) > 0 ? Number(portfolio.margin_level) : 0,
          });
        } else {
          setStats(prev => ({ ...prev, winRate }));
        }

        if (activePositions) {
          setOpenTrades(activePositions as unknown as Trade[]);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolios' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">AI Command Center</h1>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            LIVE MARKET WORKSPACE • {openTrades.length} ACTIVE POSITIONS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsBeginnerMode(!isBeginnerMode)}
            className={`btn px-3 py-1.5 text-xs flex items-center gap-1.5 font-semibold transition-all ${
              isBeginnerMode 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-bg-secondary text-[#94a3b8] border border-[#1e293b] hover:text-white'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            {isBeginnerMode ? 'Beginner Guide: ON' : 'Show Beginner Explanations'}
          </button>
          <Link
            href="/chat"
            className="btn btn-primary text-xs"
          >
            Ask AI Assistant
          </Link>
        </div>
      </div>

      {/* Forex Beginner Welcome Board */}
      {isBeginnerMode && showGuide && (
        <div className="card p-5 border-emerald-500/20 bg-emerald-500/5 relative animate-fade-in">
          <button 
            onClick={() => setShowGuide(false)}
            className="absolute top-4 right-4 text-[#64748b] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex gap-3">
            <BookOpen className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white">New to Forex Trading? Quick Start Guide:</h3>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                This dashboard shows what the Trade-Z AI Engine is doing. The AI monitors the market for you, 
                detects trade opportunities (called <strong>Signals</strong>), and automatically executes them. 
                You can manage active trades, view metrics, and chat with the AI assistant.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-[11px] font-mono">
                <div className="bg-bg-secondary/40 p-2.5 rounded border border-emerald-500/10">
                  <span className="text-emerald-400 font-bold block mb-0.5">1. AI Signals</span>
                  Signals are alerts generated by the AI when it spots a high probability trade.
                </div>
                <div className="bg-bg-secondary/40 p-2.5 rounded border border-emerald-500/10">
                  <span className="text-emerald-400 font-bold block mb-0.5">2. Active Positions</span>
                  Once a signal is triggered, it becomes a live trade (Position) running in your account.
                </div>
                <div className="bg-bg-secondary/40 p-2.5 rounded border border-emerald-500/10">
                  <span className="text-emerald-400 font-bold block mb-0.5">3. Protection (SL / TP)</span>
                  SL (Stop Loss) limits potential losses. TP (Take Profit) sets target profit goals.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick stats cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { 
            label: 'Total Equity', 
            value: `$${stats.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
            icon: Wallet, 
            desc: `Balance: $${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            explanation: 'Your total account value, including open trade profits/losses.'
          },
          { 
            label: 'Today P&L', 
            value: `${stats.todayPnl >= 0 ? '+' : ''}$${stats.todayPnl.toFixed(2)}`, 
            icon: TrendingUp, 
            desc: 'Realtime daily shift', 
            color: stats.todayPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
            explanation: 'Profit or loss you made today (Profit & Loss).'
          },
          { 
            label: 'Win Rate', 
            value: `${stats.winRate}%`, 
            icon: Award, 
            desc: 'Completed trades ratio',
            explanation: 'Percentage of completed trades that closed with profit.'
          },
          { 
            label: 'Active Drawdown', 
            value: `${stats.drawdown.toFixed(2)}%`, 
            icon: ShieldAlert, 
            desc: 'Max limit: 5.0%', 
            color: 'text-[#64748b]',
            explanation: 'Safety check. Shows how much your account has dipped today.'
          },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="card p-4 flex flex-col justify-between gap-3 min-h-[110px]">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-mono font-semibold">
                    {stat.label}
                  </span>
                  <p className={`text-lg md:text-xl font-bold font-mono text-white ${stat.color || ''}`}>{stat.value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center text-[#64748b] shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-[#94a3b8] font-mono">{stat.desc}</p>
                {isBeginnerMode && (
                  <p className="text-[9px] text-emerald-400 font-mono italic">{stat.explanation}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Live Analytics Chart & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Chart & Latest Signals */}
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
          <h3 className="text-sm font-semibold text-white">Active Positions ({openTrades.length})</h3>
          <Link
            href="/trades"
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
          >
            Manage Trades
          </Link>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          {loading ? (
            <div className="text-center py-6 text-xs text-[#64748b]">Loading open positions...</div>
          ) : openTrades.length === 0 ? (
            <div className="text-center py-6 text-xs text-[#64748b]">No active positions. AI scanning active.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono">
                  <th className="pb-2">Asset</th>
                  <th className="pb-2 text-right hidden sm:table-cell">Size</th>
                  <th className="pb-2 text-right hidden md:table-cell">Entry</th>
                  <th className="pb-2 text-right hidden md:table-cell">Current</th>
                  <th className="pb-2 text-right">P&L ($)</th>
                  <th className="pb-2 text-right hidden sm:table-cell">Pips</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b] text-xs">
                {openTrades.map((trade) => {
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
                      <td className="py-3 text-right font-mono text-[#94a3b8] hidden sm:table-cell">
                        {trade.lotSize.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-mono text-white hidden md:table-cell">
                        {trade.entryPrice.toFixed(5)}
                      </td>
                      <td className="py-3 text-right font-mono text-white hidden md:table-cell">
                        {(trade.currentPrice || 0).toFixed(5)}
                      </td>
                      <td className={`py-3 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${(trade.pnl || 0).toFixed(2)}
                      </td>
                      <td className={`py-3 text-right font-mono font-medium hidden sm:table-cell ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{(trade.pips || 0).toFixed(1)}
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
