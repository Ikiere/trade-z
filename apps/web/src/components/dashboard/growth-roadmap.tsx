'use client';

import { useState, useEffect } from 'react';
import {
  Compass,
  TrendingUp,
  Shield,
  Snowflake,
  CheckCircle2,
  Target,
  Sparkles,
  Calendar,
  Lock,
  ArrowRight,
  Award,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useMt5 } from '@/lib/mt5-sync-context';

export default function GrowthRoadmapWidget() {
  const { bridgeStatus, account, summary, positions } = useMt5();

  const balance = account?.balance ?? summary?.balance ?? 10000;
  const equity = account?.equity ?? summary?.equity ?? balance;
  const floatingPnl = summary?.total_floating_pnl ?? 0;

  // Cool-down and today's loss detection
  const [hasLossToday, setHasLossToday] = useState(false);
  const [todayPnl, setTodayPnl] = useState(0);
  const [todayTradesCount, setTodayTradesCount] = useState(0);

  useEffect(() => {
    const probeTodayPerformance = async () => {
      try {
        const res = await fetch('http://127.0.0.1:5001/history', { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          const trades = Array.isArray(data.trades) ? data.trades : [];
          const todayStr = new Date().toISOString().slice(0, 10);
          const todayTrades = trades.filter((t: any) => (t.time_close || t.time || '').startsWith(todayStr));
          setTodayTradesCount(todayTrades.length);

          const netPnl = todayTrades.reduce((acc: number, t: any) => acc + (Number(t.profit) || 0), 0);
          setTodayPnl(netPnl);

          const hadLoss = todayTrades.some((t: any) => typeof t.profit === 'number' && t.profit < 0);
          setHasLossToday(hadLoss || netPnl < 0);
        }
      } catch (_) {}
    };

    probeTodayPerformance();
    const interval = setInterval(probeTodayPerformance, 20000);
    return () => clearInterval(interval);
  }, []);

  // Growth target calculations calibrated to current balance
  // Target weekly: +4.0% of balance; Target monthly: +16.0% of balance
  const weeklyTargetPct = 4.0;
  const monthlyTargetPct = 16.0;

  const weeklyTargetDollars = (balance * (weeklyTargetPct / 100));
  const monthlyTargetDollars = (balance * (monthlyTargetPct / 100));

  // Weekly progress calculation
  const currentWeekProfit = Math.max(0, todayPnl + (floatingPnl > 0 ? floatingPnl : 0));
  const weeklyProgressPct = Math.min(100, Math.round((currentWeekProfit / Math.max(1, weeklyTargetDollars)) * 100));

  // Determine user journey phase
  let phaseName = 'Phase 1: Capital Fortress';
  let phaseColor = 'text-brand-400 border-brand-500/30 bg-brand-500/10';
  let phaseDesc = 'Disciplined capital preservation, 1-2% calibrated risk per trade, max 2 trades/day.';
  let phaseMilestone = 'Target: Initial account safety & milestone consistency';

  if (balance >= 50000) {
    phaseName = 'Phase 3: Institutional Scale';
    phaseColor = 'text-purple-400 border-purple-500/30 bg-purple-500/10';
    phaseDesc = 'Prop-firm institutional sizing, sub-2% drawdowns, high-conviction order block executions.';
    phaseMilestone = 'Target: Scaled liquidity & institutional consistency';
  } else if (balance >= 5000) {
    phaseName = 'Phase 2: Compounding Engine';
    phaseColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    phaseDesc = 'Multi-session compounding, smart trailing stops, disciplined growth toward funded scale.';
    phaseMilestone = 'Target: 50% compound asset growth';
  }

  return (
    <div className="card p-4 sm:p-5 border border-[#1e293b] bg-bg-secondary/70 relative overflow-hidden space-y-4">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-brand-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#1e293b]/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                AI Trader Growth Roadmap
              </h3>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${phaseColor}`}>
                {phaseName}
              </span>
            </div>
            <p className="text-[11px] text-[#94a3b8] font-mono mt-0.5">
              Target calibrated to MT5 balance: <strong className="text-white">${balance.toFixed(2)}</strong>
            </p>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasLossToday ? (
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-2.5 py-1 rounded-lg">
              <Snowflake className="w-3.5 h-3.5 animate-pulse" />
              <span>COOL-DOWN SHIELD ACTIVE (RESTING TODAY)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              <Shield className="w-3.5 h-3.5" />
              <span>CAPITAL PROTECTION VERIFIED</span>
            </div>
          )}
        </div>
      </div>

      {/* Cool-Down Alert Banner (if loss occurred) */}
      {hasLossToday && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-xs font-mono flex items-start gap-2.5"
        >
          <Snowflake className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
          <div>
            <div className="font-bold text-white mb-0.5">
              Capital Defense Shield Active: System Paused for Today
            </div>
            <p className="text-[11px] text-cyan-200/90 leading-relaxed">
              A trade loss was registered today ({todayPnl < 0 ? `-$${Math.abs(todayPnl).toFixed(2)}` : 'stop-out'}).
              To preserve psychological discipline and eliminate revenge trading, the AI will not place new trades today.
              System recovers and unlocks automatically tomorrow at next session open.
            </p>
          </div>
        </motion.div>
      )}

      {/* Target Roadmap Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Weekly Target Card */}
        <div className="p-3 rounded-lg border border-[#1e293b] bg-bg-card/70 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] uppercase font-mono text-[#64748b] font-semibold flex items-center gap-1">
              <Target className="w-3 h-3 text-brand-400" /> Weekly Target (+{weeklyTargetPct}%)
            </span>
            <span className="text-[10px] font-mono font-bold text-brand-400">
              {weeklyProgressPct}% Hit
            </span>
          </div>
          <div>
            <div className="text-base sm:text-lg font-mono font-bold text-white">
              +${weeklyTargetDollars.toFixed(2)}
            </div>
            <div className="w-full bg-[#1e293b] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-brand-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${weeklyProgressPct}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] font-mono text-[#64748b] mt-1.5">
              <span>Current: ${currentWeekProfit.toFixed(2)}</span>
              <span>Goal: ${weeklyTargetDollars.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Monthly Target Card */}
        <div className="p-3 rounded-lg border border-[#1e293b] bg-bg-card/70 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] uppercase font-mono text-[#64748b] font-semibold flex items-center gap-1">
              <Calendar className="w-3 h-3 text-blue-400" /> Monthly Target (+{monthlyTargetPct}%)
            </span>
            <span className="text-[10px] font-mono font-bold text-blue-400">Compounded</span>
          </div>
          <div>
            <div className="text-base sm:text-lg font-mono font-bold text-white">
              +${monthlyTargetDollars.toFixed(2)}
            </div>
            <p className="text-[10px] font-mono text-[#94a3b8] mt-1">
              Projected balance: ${(balance + monthlyTargetDollars).toFixed(2)}
            </p>
            <p className="text-[9px] font-mono text-[#64748b] mt-0.5">
              Achieved by 1:2 R:R at max 2 trades/day
            </p>
          </div>
        </div>

        {/* Discipline Shield Guard Card */}
        <div className="p-3 rounded-lg border border-[#1e293b] bg-bg-card/70 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] uppercase font-mono text-[#64748b] font-semibold flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-400" /> Institutional Limits
            </span>
            <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              LOCKED
            </span>
          </div>
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex justify-between items-center">
              <span className="text-[#94a3b8]">Daily Trade Limit:</span>
              <strong className="text-white font-bold">{todayTradesCount} / 2 Trades</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94a3b8]">MT5 Open Positions:</span>
              <strong className={positions.length >= 2 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                {positions.length} / 2 Max
              </strong>
            </div>
            <div className="flex justify-between items-center text-[10px] text-[#64748b] pt-1 border-t border-[#1e293b]">
              <span>Risk Sizing:</span>
              <span className="text-brand-400 font-semibold">1.0% Auto-Calibrated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Roadmap Guidance Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-[#94a3b8] pt-1 border-t border-[#1e293b]/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          <span>{phaseDesc}</span>
        </div>
        <div className="text-[10px] text-[#64748b] shrink-0 font-semibold">
          {phaseMilestone}
        </div>
      </div>
    </div>
  );
}
