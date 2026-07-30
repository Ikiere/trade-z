'use client';

import { useEffect, useState } from 'react';
import MarketSentimentWidget from '@/components/dashboard/sentiment-widget';
import AIStatusWidget from '@/components/dashboard/ai-status-widget';
import LiveScannerWidget from '@/components/dashboard/live-scanner';
import EconomicCalendarWidget from '@/components/dashboard/economic-calendar-widget';
import LatestSignalsWidget from '@/components/dashboard/latest-signals';
import TradingViewChart from '@/components/charts/tradingview-chart';
import { TrendingUp, Award, DollarSign, Wallet, ShieldAlert, ArrowUpRight } from 'lucide-react';
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
          // Fallback if none created
          setStats(prev => ({ ...prev, winRate }));
        }

        if (activePositions) {
          // Cast database results to Trade type
          setOpenTrades(activePositions as unknown as Trade[]);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Set up realtime channel for updates
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portfolios' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AI Command Center</h1>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            LIVE MARKET WORKSPACE • {openTrades.length} ACTIVE POSITIONS
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
          { label: 'Total Equity', value: `$${stats.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Wallet, desc: `Balance: $${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Today P&L', value: `${stats.todayPnl >= 0 ? '+' : ''}$${stats.todayPnl.toFixed(2)}`, icon: TrendingUp, desc: 'Realtime daily shift', color: stats.todayPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Win Rate', value: `${stats.winRate}%`, icon: Award, desc: 'Win/loss ratio of completed trades' },
          { label: 'Active Drawdown', value: `${stats.drawdown.toFixed(2)}%`, icon: ShieldAlert, desc: 'Max limit: 5.0%', color: 'text-[#64748b]' },
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
                  <th className="pb-2 text-right">Size</th>
                  <th className="pb-2 text-right">Entry</th>
                  <th className="pb-2 text-right">Current</th>
                  <th className="pb-2 text-right">P&L ($)</th>
                  <th className="pb-2 text-right">P&L (Pips)</th>
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
          )}
        </div>
      </div>
    </div>
  );
}
