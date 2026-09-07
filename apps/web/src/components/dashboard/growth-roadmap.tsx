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
import { mt5Fetch } from '@/lib/mt5-client';

export default function GrowthRoadmapWidget() {
  const { bridgeStatus, account, summary, positions } = useMt5();

  const balance = account?.balance ?? summary?.balance ?? 10000;
  const equity = account?.equity ?? summary?.equity ?? balance;
  const floatingPnl = summary?.total_floating_pnl ?? 0;

  // Growth mode preset: 'aggressive' (+35%), 'momentum' (+20%), 'steady' (+10%), 'custom'
  const [growthMode, setGrowthMode] = useState<'aggressive' | 'momentum' | 'steady' | 'custom'>('aggressive');
  const [customGoal, setCustomGoal] = useState<number>(30);
  const [isEditingCustom, setIsEditingCustom] = useState(false);

  // Cool-down and today's loss detection
  const [hasLossToday, setHasLossToday] = useState(false);
  const [todayPnl, setTodayPnl] = useState(0);
  const [todayTradesCount, setTodayTradesCount] = useState(0);

  // Load saved growth mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('tradez_growth_mode') as any;
      if (savedMode && ['aggressive', 'momentum', 'steady', 'custom'].includes(savedMode)) {
        setGrowthMode(savedMode);
      }
      const savedCustom = localStorage.getItem('tradez_growth_custom_goal');
      if (savedCustom) {
        const val = parseFloat(savedCustom);
        if (!isNaN(val) && val > 0) setCustomGoal(val);
      }
    }
  }, []);

  const handleSelectMode = (mode: 'aggressive' | 'momentum' | 'steady' | 'custom') => {
    setGrowthMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tradez_growth_mode', mode);
    }
  };

  const handleSaveCustom = (val: number) => {
    setCustomGoal(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tradez_growth_custom_goal', String(val));
    }
    setIsEditingCustom(false);
  };

  useEffect(() => {
    const probeTodayPerformance = async () => {
      try {
        const data = await mt5Fetch('/history');
        if (data && data.success) {
          const trades = Array.isArray(data.trades) ? data.trades : [];
          const todayStr = new Date().toISOString().slice(0, 10);
          const todayTrades = trades.filter((t: any) => (t.time_close || t.time || '').startsWith(todayStr));
          setTodayTradesCount(todayTrades.length);

          const netPnl = todayTrades.reduce((acc: number, t: any) => acc + (Number(t.profit) || 0), 0);
          setTodayPnl(netPnl);

          // Only activate cool-down shield if today's NET closed P&L is negative (e.g. net loss > $2.00)
          // If the trader is in profit (like making $52), do NOT lock them out!
          const isNetDailyLoss = netPnl < -2.0 && todayTrades.length > 0;
          setHasLossToday(isNetDailyLoss);
        }
      } catch (_) {}
    };

    probeTodayPerformance();
    const interval = setInterval(probeTodayPerformance, 20000);
    return () => clearInterval(interval);
  }, []);

  // Growth target calculations
  let weeklyTargetPct = 35.0;
  let monthlyTargetPct = 140.0;
  let weeklyTargetDollars = (balance * (weeklyTargetPct / 100));
  let monthlyTargetDollars = (balance * (monthlyTargetPct / 100));

  if (growthMode === 'momentum') {
    weeklyTargetPct = 20.0;
    monthlyTargetPct = 80.0;
    weeklyTargetDollars = (balance * (weeklyTargetPct / 100));
    monthlyTargetDollars = (balance * (monthlyTargetPct / 100));
  } else if (growthMode === 'steady') {
    weeklyTargetPct = 10.0;
    monthlyTargetPct = 40.0;
    weeklyTargetDollars = (balance * (weeklyTargetPct / 100));
    monthlyTargetDollars = (balance * (monthlyTargetPct / 100));
  } else if (growthMode === 'custom') {
    weeklyTargetDollars = customGoal;
    monthlyTargetDollars = customGoal * 4;
    weeklyTargetPct = balance > 0 ? Number(((weeklyTargetDollars / balance) * 100).toFixed(1)) : 35;
    monthlyTargetPct = Number((weeklyTargetPct * 4).toFixed(1));
  }

  // Weekly progress calculation
  const currentWeekProfit = Math.max(0, todayPnl + (floatingPnl > 0 ? floatingPnl : 0));
  const weeklyProgressPct = Math.min(100, Math.round((currentWeekProfit / Math.max(1, weeklyTargetDollars)) * 100));

  // Determine user journey phase
  let phaseName = 'Phase 1: Capital Fortress';
  let phaseColor = 'text-brand-400 border-brand-500/30 bg-brand-500/10';
  let phaseDesc = 'Disciplined high-conviction growth. 1-2% calibrated risk per trade, max 2 trades/day.';
  let phaseMilestone = 'Target: Consistent execution & account milestone scaling';

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#1e293b]/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                AI Trader Growth Roadmap
              </h3>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${phaseColor}`}>
                {phaseName}
              </span>
            </div>
            <p className="text-[11px] text-[#94a3b8] font-mono mt-0.5">
              Target calibrated to MT5 balance: <strong className="text-white">${balance.toFixed(2)}</strong>
              {todayPnl > 0 && (
                <span className="text-emerald-400 font-bold ml-2">
                  (Today: +${todayPnl.toFixed(2)})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Growth Strategy Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-[#64748b] mr-1 hidden sm:inline">Pace:</span>
          <button
            onClick={() => handleSelectMode('aggressive')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
              growthMode === 'aggressive'
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 shadow-sm'
                : 'bg-[#111728] text-[#94a3b8] border-[#1e293b] hover:text-white'
            }`}
            title="Aggressive growth target: +35% weekly (+140% monthly)"
          >
            🔥 High Growth (+35%)
          </button>
          <button
            onClick={() => handleSelectMode('momentum')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
              growthMode === 'momentum'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-[#111728] text-[#94a3b8] border-[#1e293b] hover:text-white'
            }`}
            title="Momentum scaling: +20% weekly (+80% monthly)"
          >
            ⚡ Momentum (+20%)
          </button>
          <button
            onClick={() => handleSelectMode('steady')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
              growthMode === 'steady'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-sm'
                : 'bg-[#111728] text-[#94a3b8] border-[#1e293b] hover:text-white'
            }`}
            title="Steady compounding: +10% weekly (+40% monthly)"
          >
            🛡️ Steady (+10%)
          </button>
          <button
            onClick={() => {
              handleSelectMode('custom');
              setIsEditingCustom(true);
            }}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
              growthMode === 'custom'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-[#111728] text-[#94a3b8] border-[#1e293b] hover:text-white'
            }`}
            title="Set your custom weekly target in dollars"
          >
            ✏️ Custom (${weeklyTargetDollars.toFixed(0)}/wk)
          </button>
        </div>
      </div>

      {/* Custom Goal Input Popup/Row */}
      {isEditingCustom && (
        <div className="p-3 rounded-lg bg-bg-card border border-cyan-500/30 flex items-center justify-between gap-3">
          <span className="text-xs text-white font-mono">Set Weekly Goal ($):</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="50000"
              step="5"
              defaultValue={customGoal}
              id="custom-goal-input"
              className="px-2.5 py-1 rounded bg-[#090d16] border border-[#1e293b] text-xs text-cyan-300 font-mono w-28 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={() => {
                const el = document.getElementById('custom-goal-input') as HTMLInputElement;
                const val = parseFloat(el?.value || '30');
                handleSaveCustom(val);
              }}
              className="px-3 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold"
            >
              Save Target
            </button>
          </div>
        </div>
      )}

      {/* Cool-Down Alert Banner (only if true NET daily loss occurred) */}
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
              A net loss of -${Math.abs(todayPnl).toFixed(2)} was registered today.
              To preserve psychological discipline and eliminate emotional revenge trading, execution is paused for the remainder of the day.
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
              Achieved with high-conviction intraday scalps
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
