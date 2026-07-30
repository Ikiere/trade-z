'use client';

import { MOCK_SIGNALS } from '@/lib/mock-data';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Eye } from 'lucide-react';
import Link from 'next/link';

export default function LatestSignalsWidget() {
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
        {MOCK_SIGNALS.map((signal) => {
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
                </div>
              </div>

              {/* Center — Entry Levels */}
              <div className="grid grid-cols-3 gap-4 text-center font-mono text-[11px] flex-1 max-w-xs">
                <div>
                  <p className="text-[#64748b] text-[9px] uppercase">ENTRY</p>
                  <p className="font-semibold text-white mt-0.5">{signal.entryPrice.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-red-400 text-[9px] uppercase">SL</p>
                  <p className="font-semibold text-white mt-0.5">{signal.stopLoss.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-emerald-400 text-[9px] uppercase">TP</p>
                  <p className="font-semibold text-white mt-0.5">{signal.takeProfit.toFixed(4)}</p>
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
        })}
      </div>
    </div>
  );
}
