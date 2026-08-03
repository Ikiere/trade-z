'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Wifi,
  RefreshCw,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Sparkles,
  BarChart2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DbSignal {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  status: 'pending' | 'active' | 'executed' | 'expired' | 'rejected' | 'cancelled';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  confidence: number;
  confidence_breakdown: {
    marketStructure?: number;
    trend?: number;
    momentum?: number;
    liquidity?: number;
    economicNews?: number;
    riskReward?: number;
  } | null;
  ai_reasoning: string | null;
  timeframe: string;
  risk_reward: number | null;
  strategy: string | null;
  tags: string[] | null;
  created_at: string;
}

const STATUS_CONFIG = {
  active:    { label: 'ACTIVE',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  pending:   { label: 'PENDING',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     dot: 'bg-amber-400' },
  rejected:  { label: 'REJECTED',  color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         dot: 'bg-red-400' },
  executed:  { label: 'EXECUTED',  color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',       dot: 'bg-blue-400' },
  expired:   { label: 'EXPIRED',   color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20',    dot: 'bg-slate-400' },
  cancelled: { label: 'CANCELLED', color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20',    dot: 'bg-slate-400' },
};

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function calcRR(entry: number, sl: number, tp: number) {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (!risk) return '—';
  return `${(reward / risk).toFixed(1)}R`;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<DbSignal[]>([]);
  const [selected, setSelected] = useState<DbSignal | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'rejected' | 'executed'>('all');
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadSignals = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('signals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        setSignals(data as DbSignal[]);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error('Error loading signals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSignals();

    // Real-time subscription — auto-refresh when scanner writes a new signal
    const supabase = createClient();
    const channel = supabase
      .channel('signals-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, () => {
        setNewCount(n => n + 1);
        loadSignals();
      })
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [loadSignals]);

  const filtered = signals.filter(s => {
    if (filter === 'active') return s.status === 'active';
    if (filter === 'rejected') return s.status === 'rejected';
    if (filter === 'executed') return s.status === 'executed';
    return true;
  });

  const activeCount = signals.filter(s => s.status === 'active').length;
  const rejectedCount = signals.filter(s => s.status === 'rejected').length;
  const avgConf = signals.length
    ? Math.round(signals.reduce((a, s) => a + Number(s.confidence), 0) / signals.length)
    : 0;

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">AI Signal Feed</h1>
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${isLive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-500/10 border-slate-500/30 text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {isLive ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <p className="text-xs text-[#64748b] font-mono">
            All AI confluence & rejection signals from the scanner — updated in real time
          </p>
          <p className="text-[10px] text-[#475569] font-mono mt-1">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setLoading(true); loadSignals(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-[#1e293b] text-[11px] font-mono text-[#94a3b8] hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>

          {/* Filter pills */}
          <div className="flex bg-bg-secondary p-1 rounded-lg border border-[#1e293b] text-xs font-semibold">
            {(['all', 'active', 'rejected', 'executed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md uppercase tracking-wider transition-colors text-[10px] ${
                  filter === f ? 'bg-brand-600 text-white shadow-md' : 'text-[#64748b] hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Signals', value: signals.length, icon: BarChart2, color: 'text-brand-400' },
          { label: 'Active',        value: activeCount,    icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Rejected',      value: rejectedCount,  icon: XCircle,      color: 'text-red-400' },
          { label: 'Avg Confidence',value: `${avgConf}%`,  icon: Sparkles,     color: 'text-amber-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-[#64748b] font-mono uppercase">{label}</p>
              <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Signals Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-3 animate-pulse">
              <div className="h-4 bg-bg-secondary rounded w-1/2" />
              <div className="h-3 bg-bg-secondary rounded w-3/4" />
              <div className="h-12 bg-bg-secondary rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <Sparkles className="w-10 h-10 text-[#334155] mx-auto" />
          <div>
            <p className="text-sm font-semibold text-white font-mono">No signals yet{filter !== 'all' ? ` for filter: ${filter}` : ''}</p>
            <p className="text-xs text-[#64748b] font-mono mt-1">
              {filter !== 'all'
                ? 'Try switching the filter to "all" to see all your signals.'
                : 'Go to the Dashboard and start the AI Scanner to generate signals. They will appear here in real time.'}
            </p>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')}
                className="mt-3 px-4 py-1.5 rounded-lg bg-brand-600/20 text-brand-400 border border-brand-500/20 text-xs font-mono hover:bg-brand-600/30 transition-colors">
                Show All Signals
              </button>
            )}
          </div>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((sig) => {
              const isLong = sig.direction === 'long';
              const isRejected = sig.status === 'rejected';
              const cfg = STATUS_CONFIG[sig.status] || STATUS_CONFIG.pending;
              const rr = calcRR(Number(sig.entry_price), Number(sig.stop_loss), Number(sig.take_profit));

              return (
                <motion.div
                  key={sig.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  className={`card p-5 flex flex-col gap-4 relative overflow-hidden cursor-pointer group transition-all hover:shadow-lg hover:shadow-black/30 ${
                    isRejected
                      ? 'border-red-500/15 bg-red-500/3 opacity-75 hover:opacity-100'
                      : 'hover:border-brand-500/30'
                  }`}
                  onClick={() => setSelected(sig)}
                >
                  {/* Direction accent bar */}
                  <div className={`absolute top-0 left-0 w-full h-0.5 ${isLong ? 'bg-gradient-to-r from-emerald-500 to-transparent' : 'bg-gradient-to-r from-red-500 to-transparent'}`} />

                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isLong ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                        {isLong ? (
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-white text-sm font-mono">{sig.pair}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] bg-bg-elevated px-1.5 py-0.5 rounded text-[#64748b] font-mono">{sig.timeframe}</span>
                          <span className={`text-[9px] font-mono font-bold uppercase ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isLong ? '▲ LONG' : '▼ SHORT'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase border ${cfg.bg} ${cfg.color}`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1`} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Price levels */}
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-bg-secondary/60 border border-[#1e293b] font-mono text-[10px] text-center">
                    <div>
                      <span className="text-[#64748b] block mb-0.5">ENTRY</span>
                      <span className="font-semibold text-white">{Number(sig.entry_price).toFixed(4)}</span>
                    </div>
                    <div>
                      <span className="text-red-400 block mb-0.5">SL</span>
                      <span className="font-semibold text-red-300">{Number(sig.stop_loss).toFixed(4)}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 block mb-0.5">TP</span>
                      <span className="font-semibold text-emerald-300">{Number(sig.take_profit).toFixed(4)}</span>
                    </div>
                  </div>

                  {/* AI Reasoning Preview */}
                  {sig.ai_reasoning && (
                    <p className="text-[10px] text-[#64748b] font-mono leading-relaxed line-clamp-2 bg-bg-secondary/40 rounded-lg px-2.5 py-2 border border-[#1e293b]/50">
                      {sig.ai_reasoning}
                    </p>
                  )}

                  {/* Tags */}
                  {sig.tags && sig.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sig.tags.map(t => (
                        <span key={t} className="text-[9px] bg-bg-elevated text-[#64748b] px-1.5 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex justify-between items-center pt-2 border-t border-[#1e293b] mt-auto">
                    <div className="flex items-center gap-3 font-mono text-[10px]">
                      <div>
                        <span className="text-[#475569]">CONF </span>
                        <span className={`font-bold ${isRejected ? 'text-red-400' : 'text-emerald-400'}`}>
                          {Number(sig.confidence).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569]">RR </span>
                        <span className="font-bold text-amber-400">{rr}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[#475569] font-mono text-[9px]">
                      <Clock className="w-3 h-3" />
                      {timeAgo(sig.created_at)}
                      <ChevronRight className="w-3 h-3 text-[#334155] group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Signal Detail Modal / "AI Trade Certificate" ── */}
      <AnimatePresence>
        {selected && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto no-scrollbar"
            onClick={(e) => e.target === e.currentTarget && setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-2xl bg-bg-secondary border border-[#1e293b] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
            >
              {/* Modal Header */}
              <div className={`p-5 border-b border-[#1e293b] flex items-center justify-between ${
                selected.status === 'rejected'
                  ? 'bg-gradient-to-r from-red-900/20 to-transparent'
                  : 'bg-gradient-to-r from-brand-900/30 to-transparent'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    selected.status === 'rejected' ? 'bg-red-500/20' : 'bg-brand-600/20'
                  }`}>
                    <ShieldCheck className={`w-5 h-5 ${selected.status === 'rejected' ? 'text-red-400' : 'text-brand-400'}`} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-mono">AI TRADE CERTIFICATE</h3>
                    <p className="text-[9px] text-[#64748b] font-mono tracking-widest">
                      ID: CERT-{selected.id.slice(0, 8).toUpperCase()} · {new Date(selected.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-[#475569] hover:text-white text-xs font-semibold font-mono px-3 py-1.5 rounded-lg bg-bg-card hover:bg-bg-elevated transition-colors"
                >
                  CLOSE
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto no-scrollbar">

                {/* Overview grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
                  {[
                    { label: 'ASSET',      value: selected.pair,                                  color: 'text-white' },
                    { label: 'DIRECTION',  value: selected.direction.toUpperCase(),               color: selected.direction === 'long' ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'CONFIDENCE', value: `${Number(selected.confidence).toFixed(1)}%`,  color: selected.status === 'rejected' ? 'text-red-400' : 'text-emerald-400' },
                    { label: 'RISK/REWARD',value: calcRR(Number(selected.entry_price), Number(selected.stop_loss), Number(selected.take_profit)), color: 'text-amber-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-bg-card border border-[#1e293b] rounded-xl p-3">
                      <span className="text-[9px] text-[#64748b] block mb-1">{label}</span>
                      <span className={`text-sm font-bold ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Price levels */}
                <div>
                  <h4 className="text-[10px] font-bold text-[#64748b] font-mono uppercase tracking-widest mb-2">Price Parameters</h4>
                  <div className="grid grid-cols-3 gap-3 font-mono text-[11px] text-center">
                    <div className="p-3 bg-bg-card border border-[#1e293b] rounded-xl">
                      <span className="text-[#64748b] text-[9px] block mb-1">TRIGGER ENTRY</span>
                      <span className="text-white font-bold">{Number(selected.entry_price).toFixed(5)}</span>
                    </div>
                    <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                      <span className="text-red-400 text-[9px] block mb-1">STOP LOSS</span>
                      <span className="text-red-300 font-bold">{Number(selected.stop_loss).toFixed(5)}</span>
                    </div>
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
                      <span className="text-emerald-400 text-[9px] block mb-1">TAKE PROFIT</span>
                      <span className="text-emerald-300 font-bold">{Number(selected.take_profit).toFixed(5)}</span>
                    </div>
                  </div>
                </div>

                {/* Strategy & tags */}
                {(selected.strategy || (selected.tags && selected.tags.length > 0)) && (
                  <div>
                    <h4 className="text-[10px] font-bold text-[#64748b] font-mono uppercase tracking-widest mb-2">Strategy & Tags</h4>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.strategy && (
                        <span className="text-[10px] font-mono bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2.5 py-1 rounded-lg">
                          {selected.strategy}
                        </span>
                      )}
                      {selected.tags?.map(t => (
                        <span key={t} className="text-[10px] bg-bg-card text-[#64748b] px-2.5 py-1 rounded-lg border border-[#1e293b] font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Reasoning */}
                <div>
                  <h4 className="text-[10px] font-bold text-[#64748b] font-mono uppercase tracking-widest mb-2">AI Confluence Analysis</h4>
                  <div className="p-4 rounded-xl bg-bg-card border border-[#1e293b] text-xs text-[#94a3b8] leading-relaxed font-mono whitespace-pre-wrap">
                    {selected.ai_reasoning || 'No AI reasoning recorded for this signal.'}
                  </div>
                </div>

                {/* Confidence breakdown bars */}
                {selected.confidence_breakdown && (
                  <div>
                    <h4 className="text-[10px] font-bold text-[#64748b] font-mono uppercase tracking-widest mb-3">AI Factor Breakdown</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-bg-card border border-[#1e293b]">
                      {Object.entries({
                        'Market Structure': selected.confidence_breakdown.marketStructure ?? 80,
                        'Trend Alignment':  selected.confidence_breakdown.trend ?? 80,
                        'Momentum Check':   selected.confidence_breakdown.momentum ?? 75,
                        'Liquidity Sweep':  selected.confidence_breakdown.liquidity ?? 85,
                        'Economic Impact':  selected.confidence_breakdown.economicNews ?? 70,
                        'Risk/Reward':      selected.confidence_breakdown.riskReward ?? 85,
                      }).map(([label, val]) => (
                        <div key={label} className="space-y-1 text-[10px]">
                          <div className="flex justify-between font-mono">
                            <span className="text-[#64748b]">{label}</span>
                            <span className="text-white font-semibold">{val}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${val}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                              className={`h-full rounded-full ${selected.status === 'rejected' ? 'bg-red-500' : 'bg-brand-500'}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status explanation */}
                <div className={`flex items-start gap-3 p-3 rounded-xl border text-xs font-mono ${
                  selected.status === 'active'
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                    : selected.status === 'rejected'
                    ? 'bg-red-500/5 border-red-500/20 text-red-300'
                    : 'bg-bg-card border-[#1e293b] text-[#64748b]'
                }`}>
                  {selected.status === 'active' ? (
                    <><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>Signal approved — AI found sufficient confluence. Consider this a valid setup for a manual or automated entry.</span></>
                  ) : selected.status === 'rejected' ? (
                    <><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>Signal rejected — AI confluence was insufficient. Avoid this setup until market structure improves.</span></>
                  ) : (
                    <><Clock className="w-4 h-4 shrink-0 mt-0.5" /><span>Signal is {selected.status}.</span></>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-bg-card border-t border-[#1e293b] flex items-center justify-between text-[9px] font-mono text-[#334155]">
                <span>ISSUED BY TRADE-Z ENGINE v1.0</span>
                <span>PAIR: {selected.pair} · TF: {selected.timeframe} · {new Date(selected.created_at).toLocaleDateString()}</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
