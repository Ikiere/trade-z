'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Eye } from 'lucide-react';
import Link from 'next/link';

interface DBClientSignal {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  status: 'pending' | 'active' | 'executed' | 'expired' | 'rejected' | 'cancelled';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  confidence: number;
  timeframe: string;
  strategy: string;
}

export default function LatestSignalsWidget() {
  const [signals, setSignals] = useState<DBClientSignal[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSignals() {
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(4);

      if (data) {
        setSignals(data as unknown as DBClientSignal[]);
      }
    } catch (err) {
      console.error('Error fetching latest signals:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSignals();

    // Listen to realtime signals changes
    const supabase = createClient();
    const channel = supabase
      .channel('latest-signals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signals' },
        () => loadSignals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="card p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-white">Latest AI Signals</h3>
        <Link
          href="/signals"
          className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
        >
          View All
        </Link>
      </div>

      <div className="space-y-3.5">
        {loading ? (
          <div className="text-center py-4 text-xs text-[#64748b]">Loading signals...</div>
        ) : signals.length === 0 ? (
          <div className="text-center py-4 text-xs text-[#64748b]">No signals generated yet. AI is monitoring.</div>
        ) : (
          signals.map((signal) => {
            const isLong = signal.direction === 'long';
            const isRejected = signal.status === 'rejected';

            return (
              <div
                key={signal.id}
                className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                  isRejected
                    ? 'bg-red-500/5 border-red-500/10 opacity-70'
                    : 'bg-bg-secondary border-[#1e293b] hover:border-[#334155]'
                }`}
              >
                {/* Left — Asset Details */}
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isRejected
                      ? 'bg-zinc-500/10 text-zinc-400'
                      : isLong
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {isRejected ? (
                      <Eye className="w-5 h-5" />
                    ) : isLong ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono">{signal.pair}</span>
                      <span className="text-[10px] bg-bg-elevated px-1.5 py-0.5 rounded text-[#94a3b8] font-mono">
                        {signal.timeframe}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#64748b] font-mono mt-0.5">{signal.strategy}</p>
                    <div className="flex items-center gap-1 mt-1 font-mono text-[8px] font-bold tracking-wider uppercase">
                      <span className={`w-1.5 h-1.5 rounded-full ${isRejected ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
                      <span className={isRejected ? 'text-red-400' : 'text-emerald-400'}>
                        {isRejected ? 'RISKY SETUP (AVOID)' : 'GOOD TRADE (VALID)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Center — Entry Levels */}
                <div className="grid grid-cols-3 gap-4 text-center font-mono text-[11px] flex-1 max-w-xs">
                  <div>
                    <p className="text-[#64748b] text-[9px] uppercase">ENTRY</p>
                    <p className="font-semibold text-white mt-0.5">{Number(signal.entry_price).toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-red-400 text-[9px] uppercase">SL</p>
                    <p className="font-semibold text-white mt-0.5">{Number(signal.stop_loss).toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-emerald-400 text-[9px] uppercase">TP</p>
                    <p className="font-semibold text-white mt-0.5">{Number(signal.take_profit).toFixed(4)}</p>
                  </div>
                </div>

                {/* Right — Confidence */}
                <div className="text-right shrink-0 flex items-center sm:flex-col sm:items-end justify-between sm:justify-center gap-2">
                  <span className="text-[#64748b] text-[9px] uppercase hidden sm:block">Confidence</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    isRejected
                      ? 'bg-red-500/15 text-red-400'
                      : signal.confidence >= 90
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-brand-500/15 text-brand-400'
                  }`}>
                    {isRejected ? 'REJECTED' : `${signal.confidence}%`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
