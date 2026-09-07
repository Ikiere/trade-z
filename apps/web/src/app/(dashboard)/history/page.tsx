'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import {
  History, ArrowUpRight, ArrowDownRight, RefreshCw, Loader2,
  WifiOff, Brain, TrendingUp, TrendingDown, CheckCircle2, XCircle
} from 'lucide-react';

const BRIDGE_URL = 'http://localhost:5001';

interface Mt5ClosedTrade {
  ticket: number;
  symbol: string;
  pair: string;
  direction: 'long' | 'short';
  volume: number;
  entry_price: number;
  exit_price: number;
  profit: number;
  status: string;
  commission: number;
  swap: number;
  comment: string;
  opened_at: string | null;
  closed_at: string;
}

interface SupaTrade {
  id: string;
  pair: string;
  direction: string;
  status: string;
  entry_price: number;
  exit_price: number;
  lot_size: number;
  pnl: number;
  pips: number;
  ai_confidence: number;
  ai_reasoning: string;
  opened_at: string;
  closed_at: string;
  broker_id: string | null;
}

type DataSource = 'mt5' | 'supabase' | 'both';

export default function TradeHistoryPage() {
  const [mt5Trades, setMt5Trades] = useState<Mt5ClosedTrade[]>([]);
  const [supaTrades, setSupaTrades] = useState<SupaTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [activeSource, setActiveSource] = useState<DataSource>('mt5');
  const [selectedTrade, setSelectedTrade] = useState<Mt5ClosedTrade | null>(null);

  const fetchMt5History = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/history?days=60`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('Bridge error');
      const data = await res.json();
      if (data.success) {
        setMt5Trades(data.trades || []);
        setBridgeConnected(true);
      }
    } catch {
      setBridgeConnected(false);
    }
  }, []);

  const fetchSupaHistory = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['closed', 'stopped_out', 'take_profit', 'cancelled', 'partially_closed', 'break_even'])
        .order('closed_at', { ascending: false });
      if (data) setSupaTrades(data as SupaTrade[]);
    } catch (err) {
      console.error('Error loading Supabase history:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchMt5History(), fetchSupaHistory()]).finally(() => setLoading(false));
  }, [fetchMt5History, fetchSupaHistory]);

  const refresh = async () => {
    setLoading(true);
    await Promise.all([fetchMt5History(), fetchSupaHistory()]);
    setLoading(false);
  };

  // Stats from MT5 data
  const totalMt5 = mt5Trades.length;
  const winners = mt5Trades.filter(t => t.profit > 0).length;
  const losers = mt5Trades.filter(t => t.profit < 0).length;
  const totalProfit = mt5Trades.reduce((sum, t) => sum + t.profit, 0);
  const winRate = totalMt5 > 0 ? Math.round((winners / totalMt5) * 100) : 0;

  const displayTrades = activeSource === 'mt5' ? mt5Trades : supaTrades as any[];

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Trade History</h1>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            CLOSED POSITIONS · LEDGER & AI LEARNING FEED
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full border ${
            bridgeConnected
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/20'
          }`}>
            {bridgeConnected ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> MT5 CONNECTED</>
            ) : (
              <><WifiOff className="w-3 h-3" /> BRIDGE OFFLINE</>
            )}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg bg-bg-secondary border border-[#1e293b] hover:border-brand-500/50 transition-colors text-[#64748b] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {bridgeConnected && !loading && totalMt5 > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Trades" value={totalMt5.toString()} color="brand" />
          <StatCard label="Win Rate" value={`${winRate}%`} color={winRate >= 50 ? 'green' : 'red'} />
          <StatCard label="Winners / Losers" value={`${winners} / ${losers}`} color="blue" />
          <StatCard
            label="Net Profit"
            value={`${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`}
            color={totalProfit >= 0 ? 'green' : 'red'}
          />
        </div>
      )}

      {/* AI Learning Banner */}
      {bridgeConnected && totalMt5 > 0 && (
        <div className="p-3 rounded-xl bg-brand-500/5 border border-brand-500/20 flex items-start gap-3">
          <Brain className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <div className="text-xs font-mono">
            <span className="text-brand-400 font-bold">AI LEARNING ACTIVE</span>
            <span className="text-[#64748b] ml-2">
              {totalMt5} trades synced to AI training pipeline. The engine analyzes your closed positions to improve future signal accuracy.
            </span>
          </div>
        </div>
      )}

      {/* Source Toggle */}
      <div className="flex gap-1 p-1 bg-bg-secondary border border-[#1e293b] rounded-xl w-fit">
        {(['mt5', 'supabase'] as DataSource[]).map((src) => (
          <button
            key={src}
            onClick={() => setActiveSource(src)}
            className={`px-4 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition-all ${
              activeSource === src
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                : 'text-[#64748b] hover:text-white'
            }`}
          >
            {src === 'mt5'
              ? `MT5 Live (${mt5Trades.length})`
              : `AI Journal (${supaTrades.length})`}
          </button>
        ))}
      </div>

      {/* Trades Table */}
      <motion.div
        key={activeSource}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-0 overflow-hidden"
      >
        {loading ? (
          <div className="text-center p-12 flex flex-col items-center gap-3 text-xs text-[#64748b]">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
            Loading trade history...
          </div>
        ) : displayTrades.length === 0 ? (
          <div className="text-center p-12 space-y-3">
            <div className="w-14 h-14 rounded-full bg-bg-secondary border border-[#1e293b] flex items-center justify-center mx-auto text-[#64748b]">
              <History className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-white">No closed trades found</p>
            <p className="text-xs text-[#64748b]">
              {activeSource === 'mt5'
                ? bridgeConnected
                  ? 'No closed trades in the last 60 days on MT5'
                  : 'Start the MT5 bridge to see live trade history'
                : 'No trades have been synced to your AI journal yet'}
            </p>
          </div>
        ) : activeSource === 'mt5' ? (
          // MT5 Table
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono bg-bg-secondary">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-3 text-right hidden sm:table-cell">Size</th>
                  <th className="py-3 px-3 text-right hidden md:table-cell">Entry</th>
                  <th className="py-3 px-3 text-right">Exit</th>
                  <th className="py-3 px-3">Result</th>
                  <th className="py-3 px-3 text-right">Net P&L</th>
                  <th className="py-3 px-3 text-right hidden sm:table-cell">Closed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f172a] text-xs">
                {(mt5Trades as Mt5ClosedTrade[]).map((trade) => {
                  const isLong = trade.direction === 'long';
                  const isWin = trade.profit > 0;
                  const net = trade.profit + trade.commission + trade.swap;
                  return (
                    <motion.tr
                      key={trade.ticket}
                      layout
                      onClick={() => setSelectedTrade(trade)}
                      className="hover:bg-bg-hover/20 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isWin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="font-bold text-white font-mono">{trade.pair}</div>
                            <div className="text-[9px] text-[#64748b] font-mono">#{trade.ticket}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-[#94a3b8] hidden sm:table-cell">{trade.volume.toFixed(2)} Lots</td>
                      <td className="py-3.5 px-3 text-right font-mono text-white hidden md:table-cell">{trade.entry_price.toFixed(5)}</td>
                      <td className="py-3.5 px-3 text-right font-mono text-white">{trade.exit_price.toFixed(5)}</td>
                      <td className="py-3.5 px-3">
                        <span className={`flex items-center gap-1 text-[9px] font-bold font-mono uppercase px-1.5 py-0.5 rounded w-fit ${
                          trade.status === 'take_profit'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : trade.status === 'stopped_out'
                            ? 'bg-red-500/10 text-red-400'
                            : isWin
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {isWin ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {trade.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={`py-3.5 px-3 text-right font-mono font-bold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {net >= 0 ? '+' : ''}${net.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-[#64748b] hidden sm:table-cell text-[10px]">
                        {new Date(trade.closed_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // Supabase/AI Journal Table
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono bg-bg-secondary">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-3 text-right hidden sm:table-cell">Entry</th>
                  <th className="py-3 px-3 text-right">Exit</th>
                  <th className="py-3 px-3">Result</th>
                  <th className="py-3 px-3 text-right">P&L</th>
                  <th className="py-3 px-3 text-right hidden sm:table-cell">Pips</th>
                  <th className="py-3 px-3 text-right hidden md:table-cell">AI Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f172a] text-xs">
                {(supaTrades as SupaTrade[]).map((trade) => {
                  const isLong = trade.direction === 'long';
                  const isWin = (trade.pnl || 0) > 0;
                  return (
                    <motion.tr key={trade.id} layout className="hover:bg-bg-hover/20 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isWin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="font-bold text-white font-mono">{trade.pair}</div>
                            <div className="text-[9px] text-[#64748b] font-mono">{isLong ? 'LONG' : 'SHORT'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-white hidden sm:table-cell">{(trade.entry_price || 0).toFixed(5)}</td>
                      <td className="py-3.5 px-3 text-right font-mono text-white">{(trade.exit_price || 0).toFixed(5)}</td>
                      <td className="py-3.5 px-3">
                        <span className={`text-[9px] font-bold font-mono uppercase px-1.5 py-0.5 rounded ${
                          trade.status === 'take_profit'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : trade.status === 'stopped_out'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-zinc-500/10 text-zinc-400'
                        }`}>
                          {trade.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`py-3.5 px-3 text-right font-mono font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWin ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                      </td>
                      <td className={`py-3.5 px-3 text-right font-mono hidden sm:table-cell ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWin ? '+' : ''}{(trade.pips || 0).toFixed(1)}
                      </td>
                      <td className="py-3.5 px-3 text-right hidden md:table-cell">
                        {trade.ai_confidence > 0 && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Brain className="w-3 h-3 text-brand-400" />
                            <span className="text-brand-400 font-mono font-bold">{Math.round(trade.ai_confidence * 100)}%</span>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* MT5 Trade Detail Modal */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setSelectedTrade(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-sm bg-bg-secondary border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#1e293b] bg-bg-card flex items-center justify-between">
              <div className="font-bold text-white font-mono text-sm flex items-center gap-2">
                {selectedTrade.direction === 'long' ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                {selectedTrade.pair} · #{selectedTrade.ticket}
              </div>
              <button onClick={() => setSelectedTrade(null)} className="text-[#64748b] hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-xs font-mono space-y-2.5">
              <DetailRow label="Direction" value={selectedTrade.direction.toUpperCase()} valueClass={selectedTrade.direction === 'long' ? 'text-emerald-400' : 'text-red-400'} />
              <DetailRow label="Volume" value={`${selectedTrade.volume.toFixed(2)} Lots`} />
              <DetailRow label="Entry Price" value={selectedTrade.entry_price.toFixed(5)} />
              <DetailRow label="Exit Price" value={selectedTrade.exit_price.toFixed(5)} />
              <DetailRow label="Status" value={selectedTrade.status.replace(/_/g, ' ').toUpperCase()} valueClass={selectedTrade.profit > 0 ? 'text-emerald-400' : 'text-red-400'} />
              {selectedTrade.comment && <DetailRow label="Comment" value={selectedTrade.comment} />}
              <div className="pt-2 border-t border-[#1e293b] space-y-2">
                <DetailRow label="Gross Profit" value={`${selectedTrade.profit >= 0 ? '+' : ''}$${selectedTrade.profit.toFixed(2)}`} valueClass={selectedTrade.profit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                {selectedTrade.commission !== 0 && <DetailRow label="Commission" value={`$${selectedTrade.commission.toFixed(2)}`} valueClass="text-[#94a3b8]" />}
                {selectedTrade.swap !== 0 && <DetailRow label="Swap" value={`$${selectedTrade.swap.toFixed(2)}`} valueClass="text-[#94a3b8]" />}
                <DetailRow
                  label="Net P&L"
                  value={`${(selectedTrade.profit + selectedTrade.commission + selectedTrade.swap) >= 0 ? '+' : ''}$${(selectedTrade.profit + selectedTrade.commission + selectedTrade.swap).toFixed(2)}`}
                  valueClass={`font-bold text-sm ${(selectedTrade.profit + selectedTrade.commission + selectedTrade.swap) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                />
              </div>
              {selectedTrade.closed_at && (
                <div className="pt-2 text-[10px] text-[#475569] text-right">
                  Closed: {new Date(selectedTrade.closed_at).toLocaleString()}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-500/10 border-brand-500/20 text-brand-400',
    green: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  };
  const cls = colorMap[color] || colorMap['brand'];
  return (
    <div className={`card p-3 border ${cls.split(' ').slice(0, 2).join(' ')}`}>
      <div className="text-[9px] font-mono uppercase tracking-wider text-[#64748b] mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${cls.split(' ')[2]}`}>{value}</div>
    </div>
  );
}

function DetailRow({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[#64748b]">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}


