'use client';

import { useCountdown } from '@trade-z/hooks';
import { Brain, ScanLine, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AIStatusWidget() {
  const { minutes, seconds } = useCountdown(new Date(Date.now() + 5 * 60 * 1000)); // mock scan reload

  return (
    <div className="card p-5 relative overflow-hidden">
      {/* Decorative gradient overlay */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-600/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white">AI Operating Status</h3>
        <span className="flex items-center gap-1 text-[10px] text-brand-400 bg-brand-600/10 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
          <ActivityPulse /> Live Analysis
        </span>
      </div>

      {/* Main Status Display */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 flex items-center justify-center text-white shrink-0 shadow-glow-sm">
          <Brain className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h4 className="text-base font-bold text-white">Scanning Markets</h4>
          <p className="text-xs text-[#94a3b8] mt-0.5 leading-relaxed">
            Active on 42 pairs across H4, H1, M15 timeframes. High liquidity NY session.
          </p>
        </div>
      </div>

      {/* Quick stats parameters */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div className="p-3 rounded-lg bg-bg-secondary border border-[#1e293b] font-mono">
          <p className="text-[#64748b] mb-1">REQ CONFIDENCE</p>
          <p className="text-base font-bold text-white">95.0%</p>
        </div>
        <div className="p-3 rounded-lg bg-bg-secondary border border-[#1e293b] font-mono">
          <p className="text-[#64748b] mb-1">SCAN TICKER</p>
          <p className="text-base font-bold text-brand-400 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {minutes}m {seconds}s
          </p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
        <AlertCircle className="w-4 h-4 shrink-0" /> No upcoming high-impact economic events block scan.
      </div>
    </div>
  );
}

function ActivityPulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
    </span>
  );
}
