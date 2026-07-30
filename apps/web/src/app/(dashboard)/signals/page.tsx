'use client';

import { useState } from 'react';
import { MOCK_SIGNALS } from '@/lib/mock-data';
import type { Signal } from '@trade-z/types';
import { TrendingUp, AlertCircle, ArrowUpRight, ArrowDownRight, Eye, Calendar, Sparkles, Award, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SignalsPage() {
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'rejected'>('all');

  const filteredSignals = MOCK_SIGNALS.filter((sig) => {
    if (filter === 'active') return sig.status === 'active';
    if (filter === 'rejected') return sig.status === 'rejected';
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AI Signals</h1>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            INSTITUTIONAL AI TRADE CONFLUENCES & REJECTIONS
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex bg-bg-secondary p-1 rounded-lg border border-[#1e293b] text-xs font-semibold shrink-0">
          {(['all', 'active', 'rejected'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-1.5 rounded-md uppercase tracking-wider transition-colors ${
                filter === type
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-[#64748b] hover:text-white'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Signals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSignals.map((signal) => {
          const isLong = signal.direction === 'long';
          const isRejected = signal.status === 'rejected';

          return (
            <div
              key={signal.id}
              className={`card p-5 flex flex-col justify-between gap-4 relative overflow-hidden ${
                isRejected ? 'border-red-500/20 bg-red-500/5 opacity-80' : 'hover:border-brand-500/20'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base font-mono">{signal.pair}</span>
                    <span className="text-[10px] bg-bg-elevated px-1.5 py-0.5 rounded text-[#94a3b8] font-mono">
                      {signal.timeframe}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    isRejected
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {signal.status}
                  </span>
                </div>

                {/* Strategy info */}
                <p className="text-xs text-[#94a3b8] font-mono mb-4">{signal.strategy}</p>

                {/* Grid levels */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-bg-secondary/50 border border-[#1e293b] font-mono text-[10px] text-center mb-4">
                  <div>
                    <span className="text-[#64748b]">ENTRY</span>
                    <p className="font-semibold text-white mt-0.5">{signal.entryPrice.toFixed(4)}</p>
                  </div>
                  <div>
                    <span className="text-red-400">SL</span>
                    <p className="font-semibold text-white mt-0.5">{signal.stopLoss.toFixed(4)}</p>
                  </div>
                  <div>
                    <span className="text-emerald-400">TP</span>
                    <p className="font-semibold text-white mt-0.5">{signal.takeProfit.toFixed(4)}</p>
                  </div>
                </div>

                {/* Tags row */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {signal.tags.map((tag) => (
                    <span key={tag} className="text-[9px] bg-bg-elevated text-[#64748b] px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action and Confidence */}
              <div className="flex justify-between items-center pt-3 border-t border-[#1e293b]">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-[#64748b]">CONF:</span>
                  <span className={`font-bold ${isRejected ? 'text-red-400' : 'text-emerald-400'}`}>
                    {signal.confidence}%
                  </span>
                </div>
                <button
                  onClick={() => setSelectedSignal(signal)}
                  className="btn btn-secondary py-1.5 px-3 text-[11px] font-semibold"
                >
                  Certificate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Trade Certificate Dialog Modal */}
      <AnimatePresence>
        {selectedSignal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto no-scrollbar">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-bg-secondary border border-[#1e293b] rounded-2xl shadow-xl overflow-hidden"
            >
              {/* Certificate Head */}
              <div className="p-6 bg-gradient-to-r from-brand-900/40 via-bg-card to-transparent border-b border-[#1e293b] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-600/25 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-brand-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white font-mono">AI TRADE CERTIFICATE</h3>
                    <p className="text-[9px] text-brand-400 font-mono tracking-widest uppercase">
                      ID: CERT-{selectedSignal.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSignal(null)}
                  className="text-[#64748b] hover:text-white text-xs font-semibold uppercase tracking-wider font-mono p-1"
                >
                  Close
                </button>
              </div>

              {/* Certificate Content */}
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
                {/* Levels Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-bg-card border border-[#1e293b] font-mono text-center">
                  <div className="space-y-0.5">
                    <span className="text-[#64748b] text-[9px]">ASSET</span>
                    <p className="text-sm font-bold text-white">{selectedSignal.pair}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[#64748b] text-[9px]">CONFIDENCE</span>
                    <p className={`text-sm font-bold ${selectedSignal.status === 'rejected' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {selectedSignal.confidence}%
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[#64748b] text-[9px]">RISK REWARD</span>
                    <p className="text-sm font-bold text-white">{selectedSignal.riskReward}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[#64748b] text-[9px]">DIRECTION</span>
                    <p className={`text-sm font-bold uppercase ${selectedSignal.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {selectedSignal.direction}
                    </p>
                  </div>
                </div>

                {/* Technical Levels Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">Target Parameters</h4>
                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-center p-3 rounded-lg bg-bg-card border border-[#1e293b]">
                    <div className="p-2 bg-bg-secondary rounded">
                      <span className="text-[#64748b] text-[9px] block mb-1">TRIGGER ENTRY</span>
                      <span className="text-white font-bold">{selectedSignal.entryPrice.toFixed(5)}</span>
                    </div>
                    <div className="p-2 bg-red-500/5 rounded border border-red-500/10">
                      <span className="text-red-400 text-[9px] block mb-1">STOP LOSS</span>
                      <span className="text-red-400 font-bold">{selectedSignal.stopLoss.toFixed(5)}</span>
                    </div>
                    <div className="p-2 bg-emerald-500/5 rounded border border-emerald-500/10">
                      <span className="text-emerald-400 text-[9px] block mb-1">TAKE PROFIT</span>
                      <span className="text-emerald-400 font-bold">{selectedSignal.takeProfit.toFixed(5)}</span>
                    </div>
                  </div>
                </div>

                {/* AI Explanation / Reasoning */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">AI Confluence Explanation</h4>
                  <div className="p-4 rounded-xl bg-bg-card border border-[#1e293b] text-xs text-[#94a3b8] leading-relaxed">
                    {selectedSignal.aiReasoning}
                  </div>
                </div>

                {/* Confidence Metrics breakdown bars */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">AI Factor Breakdown</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-4 rounded-xl bg-bg-card border border-[#1e293b]">
                    {[
                      { label: 'Market Structure', val: selectedSignal.confidenceBreakdown.marketStructure },
                      { label: 'Trend Alignment', val: selectedSignal.confidenceBreakdown.trend },
                      { label: 'Momentum Check', val: selectedSignal.confidenceBreakdown.momentum },
                      { label: 'Liquidity Sweep', val: selectedSignal.confidenceBreakdown.liquidity },
                      { label: 'Economic Impact', val: selectedSignal.confidenceBreakdown.economicNews },
                      { label: 'Risk/Reward Ratio', val: selectedSignal.confidenceBreakdown.riskReward },
                    ].map((factor) => (
                      <div key={factor.label} className="space-y-1 text-[11px]">
                        <div className="flex justify-between font-mono">
                          <span className="text-[#64748b]">{factor.label}</span>
                          <span className="text-white font-semibold">{factor.val}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${selectedSignal.status === 'rejected' ? 'bg-red-500' : 'bg-brand-500'}`}
                            style={{ width: `${factor.val}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Certificate Footer */}
              <div className="p-4 bg-bg-card border-t border-[#1e293b] flex items-center justify-between text-[10px] font-mono text-[#64748b]">
                <span>ISSUED BY TRADE-Z ENGINE v0.1.0</span>
                <span>SECURED BY SUPABASE CRYPTO LOGS</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
