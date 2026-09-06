'use client';

import { useState } from 'react';
import {
  FlaskConical,
  Play,
  RotateCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Award,
  CheckCircle2,
  XCircle,
  BarChart3,
  Sliders,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  BrainCircuit,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/api';

interface BacktestTrade {
  id: number;
  bar_index: number;
  pair: string;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  exit_price: number;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exit_reason: string;
  confidence: number;
  pnl_pips: number;
  pnl_dollars: number;
  equity_after: number;
  factors: Record<string, boolean>;
}

interface BacktestSummary {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  net_pnl: number;
  net_return_pct: number;
  total_pips: number;
  max_drawdown: number;
  average_win: number;
  average_loss: number;
  starting_balance: number;
  ending_balance: number;
}

interface LearningReport {
  pair: string;
  current_win_rate: number;
  projected_win_rate: number;
  optimized_weights: Record<string, number>;
  min_confidence_recommended: number;
  insights: string[];
}

export default function BacktestPage() {
  const [pair, setPair] = useState('EURUSD');
  const [timeframe, setTimeframe] = useState('15m');
  const [bars, setBars] = useState(150);
  const [riskReward, setRiskReward] = useState(2.5);
  const [minConfidence, setMinConfidence] = useState(65);

  const [loading, setLoading] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [equityCurve, setEquityCurve] = useState<{ trade: number; equity: number }[]>([]);
  const [learningReport, setLearningReport] = useState<LearningReport | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [rulesApplied, setRulesApplied] = useState(false);

  const runBacktest = async () => {
    setLoading(true);
    setRulesApplied(false);
    setLearningReport(null);

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          timeframe,
          bars,
          risk_reward: riskReward,
          min_confidence: minConfidence,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      const data = body.data || body;
      if (data && data.summary) {
        setSummary(data.summary);
        setTrades(data.trades || []);
        setEquityCurve(data.equity_curve || []);
      }
    } catch (err) {
      console.error('Backtest error:', err);
    } finally {
      setLoading(false);
    }
  };

  const teachAI = async () => {
    if (!summary || trades.length === 0) return;
    setTeaching(true);

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/backtest/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backtest_data: {
            pair,
            summary,
            trades,
          },
        }),
      });

      if (res.ok) {
        const body = await res.json();
        const data = body.data || body;
        setLearningReport(data);
        setRulesApplied(true);
      }
    } catch (err) {
      console.error('Teach AI error:', err);
    } finally {
      setTeaching(false);
    }
  };

  const filteredTrades = trades.filter((t) => {
    if (activeFilter === 'wins') return t.outcome === 'WIN';
    if (activeFilter === 'losses') return t.outcome === 'LOSS';
    return true;
  });

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <FlaskConical className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">AI Strategy Backtester & Learning Engine</h1>
          </div>
          <p className="text-xs text-[#64748b] font-mono">
            Test the 15-layer confluence engine across past market candles, audit exact Entry/SL/TP accuracy, and train optimal rules.
          </p>
        </div>

        {summary && (
          <button
            onClick={teachAI}
            disabled={teaching}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-lg ${
              rulesApplied
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                : 'bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-brand-500/20'
            }`}
          >
            {teaching ? (
              <RotateCw className="w-4 h-4 animate-spin" />
            ) : rulesApplied ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <BrainCircuit className="w-4 h-4" />
            )}
            {rulesApplied ? 'OPTIMAL RULES APPLIED' : teaching ? 'OPTIMIZING WEIGHTS...' : 'TEACH AI & APPLY RULES'}
          </button>
        )}
      </div>

      {/* ── Controls Panel ── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono text-[#94a3b8] font-semibold border-b border-[#1e293b] pb-3">
          <Sliders className="w-4 h-4 text-brand-400" />
          <span>SIMULATION PARAMETERS</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Pair */}
          <div className="space-y-1">
            <label className="text-[10px] text-[#64748b] font-mono uppercase">Asset / Pair</label>
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="w-full bg-bg-secondary border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
            >
              <option value="EURUSD">EUR/USD (Euro)</option>
              <option value="GBPUSD">GBP/USD (Pound)</option>
              <option value="USDJPY">USD/JPY (Yen)</option>
              <option value="XAUUSD">XAU/USD (Gold)</option>
              <option value="BTCUSD">BTC/USD (Bitcoin)</option>
              <option value="ETHUSD">ETH/USD (Ethereum)</option>
              <option value="AUDUSD">AUD/USD (Aussie)</option>
              <option value="USDCAD">USD/CAD (Loonie)</option>
            </select>
          </div>

          {/* Timeframe */}
          <div className="space-y-1">
            <label className="text-[10px] text-[#64748b] font-mono uppercase">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-bg-secondary border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
            >
              <option value="15m">15 Minutes (M15 Scalp)</option>
              <option value="1h">1 Hour (H1 Intraday)</option>
              <option value="4h">4 Hours (H4 Swing)</option>
            </select>
          </div>

          {/* Historical Sample Depth */}
          <div className="space-y-1">
            <label className="text-[10px] text-[#64748b] font-mono uppercase">Sample Bars</label>
            <select
              value={bars}
              onChange={(e) => setBars(Number(e.target.value))}
              className="w-full bg-bg-secondary border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
            >
              <option value={100}>100 Candles</option>
              <option value={150}>150 Candles (Standard)</option>
              <option value={250}>250 Candles (Deep Test)</option>
            </select>
          </div>

          {/* Target Risk:Reward */}
          <div className="space-y-1">
            <label className="text-[10px] text-[#64748b] font-mono uppercase">Target R:R</label>
            <select
              value={riskReward}
              onChange={(e) => setRiskReward(Number(e.target.value))}
              className="w-full bg-bg-secondary border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
            >
              <option value={2.0}>1:2.0 Risk-Reward</option>
              <option value={2.5}>1:2.5 Risk-Reward (Recommended)</option>
              <option value={3.0}>1:3.0 Risk-Reward</option>
            </select>
          </div>

          {/* Run Action */}
          <div className="flex items-end">
            <button
              onClick={runBacktest}
              disabled={loading}
              className="w-full h-[38px] bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-600/30"
            >
              {loading ? <RotateCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
              {loading ? 'SIMULATING...' : 'RUN BACKTEST'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            {
              label: 'Win Rate',
              value: `${summary.win_rate}%`,
              sub: `${summary.winning_trades}W / ${summary.losing_trades}L`,
              color: summary.win_rate >= 60 ? 'text-emerald-400' : 'text-amber-400',
            },
            {
              label: 'Profit Factor',
              value: `${summary.profit_factor}x`,
              sub: 'Gross Win / Gross Loss',
              color: summary.profit_factor >= 1.8 ? 'text-emerald-400' : 'text-amber-400',
            },
            {
              label: 'Net Return',
              value: `${summary.net_return_pct >= 0 ? '+' : ''}${summary.net_return_pct}%`,
              sub: `$${summary.net_pnl.toFixed(2)}`,
              color: summary.net_pnl >= 0 ? 'text-emerald-400' : 'text-red-400',
            },
            {
              label: 'Total Pips',
              value: `${summary.total_pips >= 0 ? '+' : ''}${summary.total_pips}`,
              sub: `${summary.total_trades} Trades Taken`,
              color: summary.total_pips >= 0 ? 'text-brand-400' : 'text-red-400',
            },
            {
              label: 'Max Drawdown',
              value: `${summary.max_drawdown}%`,
              sub: 'Peak to trough',
              color: summary.max_drawdown <= 5 ? 'text-emerald-400' : 'text-amber-400',
            },
            {
              label: 'Ending Equity',
              value: `$${summary.ending_balance.toFixed(2)}`,
              sub: 'From $10,000 base',
              color: summary.ending_balance >= 10000 ? 'text-white' : 'text-red-400',
            },
          ].map((card) => (
            <div key={card.label} className="card p-3.5 space-y-1">
              <span className="text-[9px] text-[#64748b] font-mono uppercase block">{card.label}</span>
              <span className={`text-lg font-bold font-mono block ${card.color}`}>{card.value}</span>
              <span className="text-[9px] text-[#475569] font-mono block">{card.sub}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Learning & Optimization Report ── */}
      {learningReport && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5 border-brand-500/30 bg-gradient-to-r from-brand-950/30 to-bg-secondary space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-500/40 flex items-center justify-center text-brand-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-mono">AI CONFLUENCE LEARNING REPORT</h3>
                <p className="text-[10px] text-[#94a3b8] font-mono">Machine learning insights derived from {trades.length} simulation outcomes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#64748b] font-mono">PROJECTED WIN RATE:</span>
              <span className="text-sm font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                {learningReport.projected_win_rate}% (+{(learningReport.projected_win_rate - learningReport.current_win_rate).toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-[#64748b] font-mono uppercase tracking-wider">Learned Insights & Safeguards</h4>
              <ul className="space-y-1.5">
                {learningReport.insights.map((insight, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs font-mono text-[#cbd5e1] bg-bg-card p-2.5 rounded-lg border border-[#1e293b]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-[#64748b] font-mono uppercase tracking-wider">Trained Confluence Weights</h4>
              <div className="grid grid-cols-2 gap-2 p-3 bg-bg-card rounded-xl border border-[#1e293b] font-mono text-xs">
                {Object.entries(learningReport.optimized_weights).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1 border-b border-[#1e293b]/40">
                    <span className="text-[10px] text-[#64748b] capitalize">{k.replace('_', ' ')}</span>
                    <span className="text-white font-bold">{(v * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Visual Equity Curve ── */}
      {equityCurve.length > 1 && (
        <div className="card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand-400" />
              <span>Simulated Equity Growth ($10k Initial)</span>
            </h3>
            <span className="text-[10px] text-[#64748b] font-mono">{equityCurve.length - 1} Executions</span>
          </div>

          <div className="h-28 flex items-end gap-1.5 pt-4 border-b border-[#1e293b] overflow-x-auto no-scrollbar">
            {equityCurve.map((pt, idx) => {
              const diff = pt.equity - 10000;
              const isProfit = diff >= 0;
              const height = Math.min(100, Math.max(12, Math.abs(diff) / 18));
              return (
                <div key={idx} className="flex-1 min-w-[12px] flex flex-col items-center gap-1 group relative">
                  <div
                    style={{ height: `${height}%` }}
                    className={`w-full rounded-t-sm transition-all ${
                      isProfit ? 'bg-emerald-500/70 group-hover:bg-emerald-400' : 'bg-red-500/70 group-hover:bg-red-400'
                    }`}
                  />
                  <div className="absolute -top-7 hidden group-hover:block bg-bg-elevated text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow z-10 whitespace-nowrap">
                    ${pt.equity.toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trade Audit Table ── */}
      {trades.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono">BACKTESTED TRADES AUDIT LOG</h3>
              <span className="text-[10px] text-[#64748b] font-mono">({filteredTrades.length} trades)</span>
            </div>

            <div className="flex bg-bg-secondary p-1 rounded-lg border border-[#1e293b] text-xs font-semibold">
              {(['all', 'wins', 'losses'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1 rounded-md uppercase tracking-wider transition-colors text-[10px] font-mono ${
                    activeFilter === f ? 'bg-brand-600 text-white shadow-md' : 'text-[#64748b] hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[9px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Pair / Dir</th>
                  <th className="py-2.5 px-3">Entry</th>
                  <th className="py-2.5 px-3">Stop Loss</th>
                  <th className="py-2.5 px-3">Take Profit</th>
                  <th className="py-2.5 px-3">Exit Price</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3">Pips</th>
                  <th className="py-2.5 px-3 text-right">Net PnL ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]/60">
                {filteredTrades.map((trade) => {
                  const isLong = trade.direction === 'long';
                  const isWin = trade.outcome === 'WIN';

                  return (
                    <tr key={trade.id} className="hover:bg-bg-secondary/40 transition-colors">
                      <td className="py-3 px-3 text-[#64748b]">{trade.id}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white">{trade.pair}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {isLong ? '▲ BUY' : '▼ SELL'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">{trade.entry_price}</td>
                      <td className="py-3 px-3 text-red-400 font-semibold">{trade.stop_loss}</td>
                      <td className="py-3 px-3 text-emerald-400 font-semibold">{trade.take_profit}</td>
                      <td className="py-3 px-3 text-[#94a3b8]">{trade.exit_price}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            isWin
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {trade.outcome}
                        </span>
                      </td>
                      <td className={`py-3 px-3 font-semibold ${trade.pnl_pips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trade.pnl_pips >= 0 ? `+${trade.pnl_pips}` : trade.pnl_pips}
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${trade.pnl_dollars >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trade.pnl_dollars >= 0 ? `+$${trade.pnl_dollars.toFixed(2)}` : `-$${Math.abs(trade.pnl_dollars).toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {!summary && !loading && (
        <div className="card p-12 text-center space-y-3">
          <FlaskConical className="w-10 h-10 text-[#334155] mx-auto" />
          <p className="text-sm font-semibold text-white font-mono">No Backtest Executed Yet</p>
          <p className="text-xs text-[#64748b] font-mono max-w-md mx-auto">
            Choose an asset pair and candle depth above, then click &quot;Run Backtest&quot; to audit AI execution quality and train the confluence pipeline.
          </p>
        </div>
      )}
    </div>
  );
}
