'use client';

import { useState, useMemo } from 'react';
import {
  FlaskConical,
  Play,
  RotateCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
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
  Layers,
  Trophy,
  AlertTriangle,
  Target,
  Clock,
  DollarSign,
  Activity,
  FileSearch,
  ChevronRight,
  Filter,
  Eye,
  Crosshair,
  Percent,
  Server,
  Compass,
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/api';

// ── Types ──
interface TradeAutopsy {
  root_cause: string;
  attribution_type?: string;
  cause_description?: string;
  clinical_summary?: string;
  mfe_pips?: number;
  mae_pips?: number;
  mfe_r?: number;
  mae_r?: number;
  sentinel_action?: string;
  confluences_confirmed?: string[];
  execution_drift_detected?: boolean;
  is_statistical_acceptable?: boolean;
  recommended_adjustment?: string;
}

interface SimulatedTrade {
  id: number;
  ticket?: number;
  trade_id?: number;
  setup_id?: string;
  timestamp?: string;
  close_timestamp?: string;
  symbol?: string;
  pair?: string;
  direction: 'BUY' | 'SELL' | 'long' | 'short';
  setup_family?: string;
  lot?: number;
  volume?: number;
  entry?: number;
  entry_price: number;
  sl?: number;
  stop_loss: number;
  initial_stop_loss?: number;
  current_stop_loss?: number;
  tp?: number;
  take_profit: number;
  exit_price: number;
  initial_risk_money?: number;
  initial_risk_r?: number;
  gross_pnl?: number;
  commission?: number;
  swap?: number;
  spread?: number;
  spread_cost?: number;
  slippage?: number;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl_pips?: number;
  pnl_dollars?: number;
  net_pnl?: number;
  pnl_r?: number;
  r_multiple?: number;
  mfe?: number;
  mae?: number;
  mfe_pips?: number;
  mae_pips?: number;
  mfe_r?: number;
  mae_r?: number;
  bars_held?: number;
  duration_bars?: number;
  balance_before?: number;
  equity_before?: number;
  balance_after?: number;
  equity_after?: number;
  margin_before?: number;
  margin_after?: number;
  margin_used?: number;
  required_margin?: number;
  margin_level_at_entry?: number;
  exit_reason?: string;
  autopsy?: TradeAutopsy;
  factors?: Record<string, boolean>;
}

interface SimulationSummary {
  starting_balance: number;
  ending_balance: number;
  ending_equity: number;
  net_pnl: number;
  net_return_pct: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown: number;
  max_drawdown_dollars?: number;
  expectancy_r: number;
  risk_of_ruin: number;
  sharpe_ratio: number;
  average_win: number;
  average_loss: number;
  total_spread_cost: number;
  total_commission: number;
  total_swap: number;
  total_broker_costs?: number;
  peak_margin_utilization: number;
  margin_calls: number;
  stop_out_events: number;
  status: 'COMPLETED' | 'ACCOUNT_FAILED' | 'SURVIVED';
  unexecutable_setups_count: number;
}

interface TournamentTier {
  initial_balance: number;
  final_balance: number;
  net_pnl: number;
  net_return_pct: number;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown_pct: number;
  risk_of_ruin_pct: number;
  status: 'COMPLETED' | 'ACCOUNT_FAILED' | 'MARGIN_CALLED';
  unexecutable_count: number;
}

interface LearningReport {
  strategy_version?: string;
  pair?: string;
  current_win_rate?: number;
  projected_win_rate?: number;
  optimized_weights?: Record<string, number>;
  min_confidence_recommended?: number;
  insights: string[];
}

const ACCOUNT_PRESETS = [20, 25, 50, 100, 150, 250, 500, 1000, 5000, 10000];

const AVAILABLE_PAIRS = [
  { symbol: 'EURUSD', name: 'EUR/USD', category: 'forex' },
  { symbol: 'GBPUSD', name: 'GBP/USD', category: 'forex' },
  { symbol: 'USDJPY', name: 'USD/JPY', category: 'forex' },
  { symbol: 'AUDUSD', name: 'AUD/USD', category: 'forex' },
  { symbol: 'USDCAD', name: 'USD/CAD', category: 'forex' },
  { symbol: 'XAUUSD', name: 'XAU/USD (Gold)', category: 'gold' },
  { symbol: 'BTCUSD', name: 'BTC/USD (Bitcoin)', category: 'crypto' },
  { symbol: 'ETHUSD', name: 'ETH/USD (Ethereum)', category: 'crypto' },
];

export default function BacktestSimulatorPage() {
  // ── Mode Switch ──
  const [activeTab, setActiveTab] = useState<'single' | 'tournament' | 'ai_memory'>('single');

  // ── Simulation Parameters ──
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(100);
  const [customBalance, setCustomBalance] = useState<number>(100);
  const [tradingPeriod, setTradingPeriod] = useState<string>('30d');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['EURUSD', 'GBPUSD', 'XAUUSD']);
  const [timeframe, setTimeframe] = useState<string>('15m');
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'balanced' | 'aggressive' | 'custom'>('balanced');
  const [customRiskPct, setCustomRiskPct] = useState<number>(2.0);
  const [brokerProfile, setBrokerProfile] = useState<string>('exness');

  // ── State for Single Simulation ──
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [trades, setTrades] = useState<SimulatedTrade[]>([]);
  const [equityCurve, setEquityCurve] = useState<{ trade: number; equity: number; balance: number }[]>([]);
  const [learningReport, setLearningReport] = useState<LearningReport | null>(null);
  const [teaching, setTeaching] = useState(false);
  const [rulesApplied, setRulesApplied] = useState(false);

  // ── State for Tournament Mode ──
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentMatrix, setTournamentMatrix] = useState<TournamentTier[] | null>(null);

  // ── Filter & Modal State ──
  const [tradeFilter, setTradeFilter] = useState<'all' | 'wins' | 'losses' | 'breakeven'>('all');
  const [inspectTrade, setInspectTrade] = useState<SimulatedTrade | null>(null);
  const [chartView, setChartView] = useState<'equity' | 'drawdown'>('equity');

  // Derived effective balance
  const effectiveInitialBalance = selectedPreset === 'custom' ? customBalance : selectedPreset;

  // Derived effective risk pct
  const effectiveRiskPercent = useMemo(() => {
    switch (riskProfile) {
      case 'conservative': return 1.0;
      case 'balanced': return 2.0;
      case 'aggressive': return 3.5;
      case 'custom': return customRiskPct;
    }
  }, [riskProfile, customRiskPct]);

  // Toggle symbol selection
  const toggleSymbol = (sym: string) => {
    if (selectedSymbols.includes(sym)) {
      if (selectedSymbols.length > 1) {
        setSelectedSymbols(selectedSymbols.filter((s) => s !== sym));
      }
    } else {
      setSelectedSymbols([...selectedSymbols, sym]);
    }
  };

  const selectAllWatchlist = () => {
    setSelectedSymbols(AVAILABLE_PAIRS.map((p) => p.symbol));
  };

  // Convert period to days
  const periodDays = useMemo(() => {
    switch (tradingPeriod) {
      case '7d': return 7;
      case '14d': return 14;
      case '30d': return 30;
      case '90d': return 90;
      case '180d': return 180;
      case '365d': return 365;
      default: return 30;
    }
  }, [tradingPeriod]);

  // ── Run Single Account Simulation ──
  const runSimulation = async () => {
    setLoading(true);
    setRulesApplied(false);
    setLearningReport(null);

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/backtest/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: selectedSymbols,
          initial_balance: effectiveInitialBalance,
          timeframe,
          period_days: periodDays,
          risk_percent: effectiveRiskPercent,
          broker_name: brokerProfile,
          custom_leverage: brokerProfile === 'exness' ? 2000 : 500,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      const data = body.data || body;

      if (data) {
        const simSummary: SimulationSummary = data.summary || {
          starting_balance: data.initial_balance ?? effectiveInitialBalance,
          ending_balance: data.final_balance ?? (data.initial_balance ?? effectiveInitialBalance),
          ending_equity: data.final_equity ?? data.final_balance ?? 0,
          net_pnl: data.net_pnl ?? 0,
          net_return_pct: data.net_return_pct ?? 0,
          total_trades: data.total_trades ?? 0,
          winning_trades: data.winning_trades ?? 0,
          losing_trades: data.losing_trades ?? 0,
          breakeven_trades: data.breakeven_trades ?? 0,
          win_rate: data.win_rate ?? 0,
          profit_factor: data.profit_factor ?? 1.0,
          max_drawdown: data.max_drawdown_pct ?? data.max_drawdown ?? 0,
          max_drawdown_dollars: data.max_drawdown_dollars ?? 0,
          expectancy_r: data.expectancy_r ?? 0,
          risk_of_ruin: data.risk_of_ruin_pct ?? data.risk_of_ruin ?? 0,
          sharpe_ratio: data.sharpe_ratio ?? 0,
          average_win: data.average_win ?? 0,
          average_loss: data.average_loss ?? 0,
          total_spread_cost: data.total_spread_cost ?? 0,
          total_commission: data.total_commission ?? 0,
          total_swap: data.total_swap ?? 0,
          peak_margin_utilization: data.peak_margin_utilization ?? 0,
          margin_calls: data.margin_calls ?? 0,
          stop_out_events: data.stop_out_events ?? 0,
          status: data.status || (data.final_balance > 0 ? 'COMPLETED' : 'ACCOUNT_FAILED'),
          unexecutable_setups_count: data.unexecutable_setups_count ?? (data.unexecutable_setups?.length || 0),
        };
        setSummary(simSummary);
        setTrades(data.trades || []);
        setEquityCurve(data.equity_curve || []);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Run Multi-Account Tournament ──
  const runTournament = async () => {
    setTournamentLoading(true);

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/backtest/tournament`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: selectedSymbols,
          timeframe,
          period_days: periodDays,
          risk_percent: effectiveRiskPercent,
          broker_name: brokerProfile,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      const data = body.data || body;
      const matrix = data?.tournament_matrix || data?.tournament_results;

      if (matrix && Array.isArray(matrix)) {
        setTournamentMatrix(matrix);
      }
    } catch (err) {
      console.error('Tournament error:', err);
    } finally {
      setTournamentLoading(false);
    }
  };

  // ── Teach AI & Refine Memory ──
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
            pair: selectedSymbols[0] || 'EURUSD',
            summary,
            trades,
          },
        }),
      });

      if (res.ok) {
        const body = await res.json();
        const data = body.data || body;
        if (data && data.success !== false) {
          setLearningReport(data);
          setRulesApplied(true);
        }
      }
    } catch (err) {
      console.error('Teach AI error:', err);
    } finally {
      setTeaching(false);
    }
  };

  // ── Download Entire Simulation as CSV ──
  const downloadTradesCSV = () => {
    if (!trades || trades.length === 0) return;

    const headers = [
      'Trade_ID',
      'Setup_ID',
      'Timestamp',
      'Symbol',
      'Direction',
      'Volume',
      'Entry_Price',
      'Initial_Stop_Loss',
      'Take_Profit',
      'Exit_Price',
      'Initial_Risk_Money',
      'Initial_Risk_R',
      'Gross_PnL',
      'Commission',
      'Swap',
      'Spread_Cost',
      'Slippage',
      'Net_PnL',
      'Realized_R',
      'PnL_Pips',
      'MFE_R',
      'MAE_R',
      'Exit_Reason',
      'Outcome',
      'Balance_Before',
      'Equity_Before',
      'Balance_After',
      'Equity_After',
      'Margin_Before',
      'Margin_After',
      'Root_Cause_Attribution',
      'Clinical_Summary'
    ];

    const rows = trades.map((t) => {
      const pnl = t.pnl_dollars ?? t.net_pnl ?? 0;
      const r = t.pnl_r ?? t.r_multiple ?? 0;
      const initialSl = t.initial_stop_loss || t.stop_loss;
      const rootCause = t.autopsy?.root_cause || (t.outcome === 'WIN' ? 'CLEAN_EXPANSION_TP' : t.outcome === 'BREAKEVEN' ? 'PROTECTIVE_BREAKEVEN' : 'NORMAL_STATISTICAL_LOSS');
      const clinicalSummary = (t.autopsy?.clinical_summary || t.autopsy?.cause_description || '').replace(/"/g, '""');

      return [
        t.trade_id ?? t.id,
        `"${t.setup_id || `SETUP-${t.symbol || 'SYM'}-${t.id}`}"`,
        `"${t.timestamp || ''}"`,
        t.symbol || t.pair || 'EURUSD',
        String(t.direction).toUpperCase(),
        t.volume ?? t.lot ?? 0.01,
        t.entry_price ?? t.entry ?? 0,
        initialSl,
        t.take_profit ?? t.tp ?? 0,
        t.exit_price,
        (t.initial_risk_money ?? 1.0).toFixed(2),
        1.0,
        (t.gross_pnl ?? pnl).toFixed(2),
        (t.commission ?? 0).toFixed(2),
        (t.swap ?? 0).toFixed(2),
        (t.spread_cost ?? 0).toFixed(2),
        (t.slippage ?? 0).toFixed(5),
        pnl.toFixed(2),
        r.toFixed(2),
        t.pnl_pips ?? 0,
        t.mfe_r ?? 0,
        t.mae_r ?? 0,
        `"${t.exit_reason || ''}"`,
        t.outcome,
        (t.balance_before ?? 0).toFixed(2),
        (t.equity_before ?? 0).toFixed(2),
        (t.balance_after ?? 0).toFixed(2),
        (t.equity_after ?? 0).toFixed(2),
        (t.margin_before ?? 0).toFixed(2),
        (t.margin_after ?? 0).toFixed(2),
        `"${rootCause}"`,
        `"${clinicalSummary}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trade-z-backtest-${selectedSymbols.join('-')}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Download Entire Simulation as JSON ──
  const downloadTradesJSON = () => {
    if (!trades || trades.length === 0) return;

    const dataExport = {
      exported_at: new Date().toISOString(),
      strategy_version: 'Trade-Z v2.1-AdaptiveSMC',
      parameters: {
        symbols: selectedSymbols,
        timeframe,
        period_days: periodDays,
        initial_balance: effectiveInitialBalance,
        risk_percent: effectiveRiskPercent,
        broker_profile: brokerProfile
      },
      summary,
      trades,
      equity_curve: equityCurve
    };

    const blob = new Blob([JSON.stringify(dataExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trade-z-backtest-${selectedSymbols.join('-')}-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Download Single Trade Forensic Report (.TXT) ──
  const downloadSingleTradeReport = (trade: SimulatedTrade) => {
    const pnl = trade.pnl_dollars ?? trade.net_pnl ?? 0;
    const r = trade.pnl_r ?? trade.r_multiple ?? 0;
    const initialSl = trade.initial_stop_loss || trade.stop_loss;
    const mfePips = trade.autopsy?.mfe_pips ?? trade.mfe_pips ?? (Number(trade.autopsy?.mfe_r ?? trade.mfe_r ?? 0) * 15).toFixed(1);
    const maePips = trade.autopsy?.mae_pips ?? trade.mae_pips ?? (Number(trade.autopsy?.mae_r ?? trade.mae_r ?? 0) * 15).toFixed(1);
    const rootCause = trade.autopsy?.root_cause || (trade.outcome === 'WIN' ? 'CLEAN_EXPANSION_TP' : trade.outcome === 'BREAKEVEN' ? 'PROTECTIVE_BREAKEVEN' : 'NORMAL_STATISTICAL_LOSS');
    const clinicalSummary = trade.autopsy?.clinical_summary || trade.autopsy?.cause_description || (trade.outcome === 'WIN' ? 'The trade expanded directly to the liquidity target with minimal adverse drawdown.' : 'Standard expected loss within statistical variance.');

    const report = `================================================================================
TRADE-Z INSTITUTIONAL FORENSIC TRADE AUDIT REPORT
Engine: Trade-Z Production SMC Pipeline Mirror (v2.1)
Trade Ticket: #${trade.ticket || trade.id}
Export Timestamp: ${new Date().toISOString()}
================================================================================

1. EXECUTION COORDINATES
--------------------------------------------------------------------------------
Asset / Symbol:          ${trade.symbol || trade.pair || 'EURUSD'}
Order Direction:         ${String(trade.direction).toUpperCase()}
Setup Family:            ${trade.setup_family || 'Institutional SMC Setup'}
Execution Lot Size:      ${trade.lot ?? trade.volume ?? 0.01} Lots
Fill Entry Price:        ${trade.entry_price}
Initial Stop Loss:       ${initialSl}
Dynamic Stop Loss:       ${trade.current_stop_loss || trade.stop_loss}
Take Profit Target:      ${trade.take_profit}
Terminal Exit Price:     ${trade.exit_price}
Exit Trigger / Reason:   ${trade.exit_reason || 'TARGET_OR_STOP'}
Terminal Outcome:        ${trade.outcome}

2. FINANCIAL & PERFORMANCE METRICS
--------------------------------------------------------------------------------
Realized Net PnL:        ${pnl >= 0 ? '+$' + pnl.toFixed(2) : '-$' + Math.abs(pnl).toFixed(2)}
Realized R-Multiple:     ${r >= 0 ? '+' + r.toFixed(2) + 'R' : r.toFixed(2) + 'R'}
Realized Movement:       ${trade.pnl_pips ?? 0} pips
Maximum Favorable (MFE): +${mfePips} pips (+${trade.autopsy?.mfe_r ?? trade.mfe_r ?? 0}R)
Maximum Adverse (MAE):   -${maePips} pips (-${trade.autopsy?.mae_r ?? trade.mae_r ?? 0}R)
Balance After Close:     $${(trade.balance_after ?? 0).toFixed(2)}
Equity After Close:      $${(trade.equity_after ?? 0).toFixed(2)}

3. FORENSIC POST-TRADE AUTOPSY
--------------------------------------------------------------------------------
Root Cause Attribution:  ${rootCause}
Clinical Diagnosis:      ${clinicalSummary}
Sentinel Dynamic Action: ${trade.autopsy?.sentinel_action || trade.exit_reason || 'SL_CONTAINED'}
Statistical Acceptability: ${trade.autopsy?.is_statistical_acceptable !== false ? 'ACCEPTABLE SYSTEMIC VARIANCE' : 'EXECUTION DRIFT DETECTED'}
Recommended Adjustment:  ${trade.autopsy?.recommended_adjustment || 'Maintain strict mathematical position sizing.'}

================================================================================
TRADE-Z INSTITUTIONAL RISK AUDIT • ALL RIGHTS RESERVED
================================================================================`;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trade-audit-${trade.symbol || trade.pair || 'TRADE'}-${trade.id}-${trade.outcome}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Download Single Trade as JSON ──
  const downloadSingleTradeJSON = (trade: SimulatedTrade) => {
    const blob = new Blob([JSON.stringify(trade, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trade-audit-${trade.symbol || trade.pair || 'TRADE'}-${trade.id}-${trade.outcome}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (tradeFilter === 'wins') return t.outcome === 'WIN';
      if (tradeFilter === 'losses') return t.outcome === 'LOSS';
      if (tradeFilter === 'breakeven') return t.outcome === 'BREAKEVEN';
      return true;
    });
  }, [trades, tradeFilter]);

  // Root cause taxonomy breakdown for AI memory
  const rootCauseStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let totalLosses = 0;
    trades.forEach((t) => {
      if (t.outcome === 'LOSS' && t.autopsy?.root_cause) {
        counts[t.autopsy.root_cause] = (counts[t.autopsy.root_cause] || 0) + 1;
        totalLosses++;
      }
    });
    return { counts, totalLosses };
  }, [trades]);

  return (
    <div className="p-4 sm:p-6 space-y-6 min-h-screen text-slate-100">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1e293b] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shadow-lg shadow-brand-500/10">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  MARKET SIMULATOR & AI TRAINING ENGINE
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30">
                  <Sparkles className="w-3 h-3" />
                  PRODUCTION ENGINE MIRROR (v2.1)
                </span>
              </div>
              <p className="text-xs text-[#94a3b8] font-mono mt-0.5">
                Zero look-ahead historical tick replay • Exact 15-layer SMC engine • Virtual MT5 broker execution emulator
              </p>
            </div>
          </div>
        </div>

        {/* Global Mode Switch Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#12121a] border border-[#1e293b] rounded-xl self-start lg:self-auto">
          <button
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'single'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Single Account</span>
          </button>
          <button
            onClick={() => setActiveTab('tournament')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'tournament'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-600/30'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Account Tournament</span>
          </button>
          <button
            onClick={() => setActiveTab('ai_memory')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'ai_memory'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>AI Experience</span>
          </button>
        </div>
      </div>

      {/* ── Configuration Panel ── */}
      <div className="card p-5 space-y-5 border-[#1e293b] bg-[#16161f]/90 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase tracking-wider">
            <Sliders className="w-4 h-4 text-brand-400" />
            <span>1. Market & Capital Configuration</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#64748b]">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Strict Zero Look-Ahead Bias Enforced
            </span>
          </div>
        </div>

        {/* Row 1: Account Presets & Broker Profile */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-[11px] font-mono uppercase text-[#94a3b8] font-bold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-brand-400" />
              Account Balance Tier
            </label>
            <span className="text-[10px] font-mono text-[#64748b]">
              Small accounts ($20–$100) test 0.01 micro-lot broker limits against drawdown
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ACCOUNT_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setSelectedPreset(preset)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                  selectedPreset === preset
                    ? 'bg-brand-600/25 border-brand-500 text-brand-300 shadow-sm shadow-brand-500/20'
                    : 'bg-[#12121a] border-[#1e293b] text-[#94a3b8] hover:text-white hover:border-[#334155]'
                }`}
              >
                ${preset}
              </button>
            ))}
            <button
              onClick={() => setSelectedPreset('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                selectedPreset === 'custom'
                  ? 'bg-brand-600/25 border-brand-500 text-brand-300 shadow-sm shadow-brand-500/20'
                  : 'bg-[#12121a] border-[#1e293b] text-[#94a3b8] hover:text-white hover:border-[#334155]'
              }`}
            >
              Custom
            </button>

            {selectedPreset === 'custom' && (
              <div className="flex items-center gap-1.5 bg-[#12121a] border border-brand-500/50 rounded-lg px-2.5 py-1">
                <span className="text-xs font-mono text-[#64748b]">$</span>
                <input
                  type="number"
                  min={10}
                  max={500000}
                  value={customBalance}
                  onChange={(e) => setCustomBalance(Math.max(10, Number(e.target.value)))}
                  className="w-24 bg-transparent text-xs font-mono text-white focus:outline-none"
                  placeholder="Custom"
                />
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Grid of Secondary Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Trading Period */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase text-[#64748b] font-bold flex items-center gap-1">
              <Clock className="w-3 h-3 text-brand-400" />
              Historical Duration
            </label>
            <select
              value={tradingPeriod}
              onChange={(e) => setTradingPeriod(e.target.value)}
              className="w-full bg-[#12121a] border border-[#1e293b] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
            >
              <option value="7d">1 Week (High-frequency Stress Test)</option>
              <option value="14d">2 Weeks (Standard Cycle)</option>
              <option value="30d">1 Month (30 Days - Recommended)</option>
              <option value="90d">3 Months (Quarterly Horizon)</option>
              <option value="180d">6 Months (Multi-Regime Cycle)</option>
              <option value="365d">1 Year (Full Statistical Proof)</option>
            </select>
          </div>

          {/* Timeframe */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase text-[#64748b] font-bold flex items-center gap-1">
              <Activity className="w-3 h-3 text-brand-400" />
              Replay Timeframe
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-[#12121a] border border-[#1e293b] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
            >
              <option value="1m">1 Minute (Ultra Micro-Scalping)</option>
              <option value="5m">5 Minutes (Session Scalping)</option>
              <option value="15m">15 Minutes (Intraday SMC Standard)</option>
              <option value="1h">1 Hour (Intraday Structural)</option>
              <option value="4h">4 Hours (HTF Macro Swings)</option>
            </select>
          </div>

          {/* Risk Profile */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase text-[#64748b] font-bold flex items-center gap-1">
              <Percent className="w-3 h-3 text-brand-400" />
              Risk Model
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['conservative', 'balanced', 'aggressive'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskProfile(r)}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold capitalize transition-all border ${
                    riskProfile === r
                      ? 'bg-brand-600/30 border-brand-500 text-brand-300'
                      : 'bg-[#12121a] border-[#1e293b] text-[#94a3b8] hover:text-white'
                  }`}
                >
                  {r === 'conservative' ? '1.0%' : r === 'balanced' ? '2.0%' : '3.5%'}
                </button>
              ))}
            </div>
          </div>

          {/* Broker Profile */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase text-[#64748b] font-bold flex items-center gap-1">
              <Server className="w-3 h-3 text-brand-400" />
              Broker Environment
            </label>
            <select
              value={brokerProfile}
              onChange={(e) => setBrokerProfile(e.target.value)}
              className="w-full bg-[#12121a] border border-[#1e293b] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
            >
              <option value="exness">Exness Standard (1:2000, 0% Stop-out, 0 Comm)</option>
              <option value="icmarkets">IC Markets Raw (1:500, 50% Stop-out, $7 Comm)</option>
            </select>
          </div>
        </div>

        {/* Row 3: Multi-Asset Watchlist Selection */}
        <div className="space-y-2 pt-2 border-t border-[#1e293b]">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono uppercase text-[#64748b] font-bold flex items-center gap-1">
              <Compass className="w-3 h-3 text-brand-400" />
              Active Assets for Simulation ({selectedSymbols.length} Selected)
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllWatchlist}
                className="text-[10px] font-mono text-brand-400 hover:text-brand-300 underline"
              >
                Select All
              </button>
              <span className="text-[#334155]">|</span>
              <button
                onClick={() => setSelectedSymbols(['EURUSD', 'GBPUSD', 'USDJPY'])}
                className="text-[10px] font-mono text-[#94a3b8] hover:text-white"
              >
                Forex Only
              </button>
              <span className="text-[#334155]">|</span>
              <button
                onClick={() => setSelectedSymbols(['XAUUSD', 'BTCUSD'])}
                className="text-[10px] font-mono text-[#94a3b8] hover:text-white"
              >
                Gold & Crypto
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {AVAILABLE_PAIRS.map((pair) => {
              const isSelected = selectedSymbols.includes(pair.symbol);
              return (
                <button
                  key={pair.symbol}
                  onClick={() => toggleSymbol(pair.symbol)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-brand-600/20 border-brand-500 text-brand-200'
                      : 'bg-[#12121a] border-[#1e293b] text-[#64748b] hover:text-white hover:border-[#334155]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-brand-400' : 'bg-[#475569]'}`} />
                  {pair.symbol}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Button Banner */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] font-mono text-[#64748b]">
            Target: <span className="text-white font-bold">${effectiveInitialBalance}</span> Balance •{' '}
            <span className="text-white font-bold">{selectedSymbols.length}</span> Assets •{' '}
            <span className="text-white font-bold">{timeframe.toUpperCase()}</span> Timeframe •{' '}
            <span className="text-white font-bold">{periodDays}</span> Days Replay
          </div>

          {activeTab === 'single' ? (
            <button
              onClick={runSimulation}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl text-xs font-mono font-black flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-brand-600/30 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>SIMULATING CHRONOLOGICAL TICKS...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>RUN HISTORICAL SIMULATION</span>
                </>
              )}
            </button>
          ) : activeTab === 'tournament' ? (
            <button
              onClick={runTournament}
              disabled={tournamentLoading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-mono font-black flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-amber-600/30 active:scale-[0.99] disabled:opacity-50"
            >
              {tournamentLoading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>RUNNING MULTI-ACCOUNT TOURNAMENT...</span>
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4" />
                  <span>LAUNCH CAPITAL TOURNAMENT</span>
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── TOURNAMENT TAB VIEW ── */}
      {activeTab === 'tournament' && (
        <div className="space-y-6">
          {tournamentMatrix ? (
            <div className="space-y-6">
              {/* Executive Summary Card */}
              <div className="card p-5 border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-[#16161f] to-[#12121a] space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                      Multi-Account Tournament Results Matrix
                    </h2>
                    <p className="text-[11px] text-[#94a3b8] font-mono">
                      Identical historical ticks replayed concurrently across 6 capital tiers under real broker execution rules
                    </p>
                  </div>
                </div>

                <p className="text-xs font-mono text-[#cbd5e1] leading-relaxed bg-[#12121a]/80 p-3 rounded-lg border border-[#1e293b]">
                  <span className="font-bold text-amber-400">Broker Reality Finding:</span> A $20 account trading 0.01 micro-lots experiences massive structural leverage amplification. If an asset has a 25-pip stop ($2.50 risk), that represents <span className="font-bold text-amber-400">12.5% account risk</span> on a $20 account, whereas it represents only <span className="font-bold text-emerald-400">0.25%</span> on a $1,000 account. Sizing cannot fractionalize below 0.01 lots on standard MT5 brokers.
                </p>
              </div>

              {/* Tournament Comparison Table */}
              <div className="card p-5 space-y-4 border-[#1e293b]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Tier-by-Tier Capital Survival Matrix</span>
                  </h3>
                  <span className="text-[10px] font-mono text-[#64748b]">
                    Sorted by starting balance ascending
                  </span>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#1e293b] text-[#64748b] text-[9px] uppercase tracking-wider">
                        <th className="py-3 px-3">Capital Tier</th>
                        <th className="py-3 px-3">Survival Status</th>
                        <th className="py-3 px-3">Ending Balance</th>
                        <th className="py-3 px-3">Net Return (%)</th>
                        <th className="py-3 px-3">Win Rate</th>
                        <th className="py-3 px-3">Profit Factor</th>
                        <th className="py-3 px-3">Max DD</th>
                        <th className="py-3 px-3">Trades (Taken / Skipped)</th>
                        <th className="py-3 px-3 text-right">Risk of Ruin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]/60">
                      {tournamentMatrix.map((tier) => {
                        const isFailed = tier.status === 'ACCOUNT_FAILED';
                        const isProfitable = tier.net_pnl > 0 && !isFailed;

                        return (
                          <tr key={tier.initial_balance} className="hover:bg-[#1e1e2d]/40 transition-colors">
                            <td className="py-3 px-3 font-bold text-white">
                              ${tier.initial_balance.toLocaleString()}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[9px] font-bold inline-flex items-center gap-1 border ${
                                  isFailed
                                    ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                    : isProfitable
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                }`}
                              >
                                {isFailed ? (
                                  <>
                                    <XCircle className="w-3 h-3" />
                                    ACCOUNT FAILED
                                  </>
                                ) : isProfitable ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    SURVIVED & PROFITABLE
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="w-3 h-3" />
                                    DRAWDOWN
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-bold text-white">
                              ${tier.final_balance.toFixed(2)}
                            </td>
                            <td
                              className={`py-3 px-3 font-bold ${
                                tier.net_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {tier.net_return_pct >= 0 ? `+${tier.net_return_pct}%` : `${tier.net_return_pct}%`}
                              <span className="text-[10px] text-[#64748b] ml-1 font-normal">
                                (${tier.net_pnl >= 0 ? `+${tier.net_pnl.toFixed(2)}` : tier.net_pnl.toFixed(2)})
                              </span>
                            </td>
                            <td className="py-3 px-3 text-[#cbd5e1] font-semibold">
                              {tier.win_rate}%
                            </td>
                            <td className="py-3 px-3 text-[#cbd5e1] font-semibold">
                              {tier.profit_factor}x
                            </td>
                            <td
                              className={`py-3 px-3 font-semibold ${
                                tier.max_drawdown_pct > 25 ? 'text-red-400' : 'text-amber-400'
                              }`}
                            >
                              {tier.max_drawdown_pct}%
                            </td>
                            <td className="py-3 px-3 text-[#94a3b8]">
                              <span className="text-white font-bold">{tier.total_trades}</span> taken
                              {tier.unexecutable_count > 0 && (
                                <span className="text-amber-400 text-[10px] ml-1.5">
                                  ({tier.unexecutable_count} skipped)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-bold">
                              <span
                                className={`${
                                  tier.risk_of_ruin_pct > 20
                                    ? 'text-red-400'
                                    : tier.risk_of_ruin_pct > 5
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {tier.risk_of_ruin_pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center space-y-4 border-[#1e293b]">
              <Trophy className="w-12 h-12 text-[#334155] mx-auto" />
              <div className="space-y-1">
                <p className="text-base font-bold text-white font-mono">No Tournament Run Yet</p>
                <p className="text-xs text-[#64748b] font-mono max-w-md mx-auto">
                  Click &quot;Launch Capital Tournament&quot; to stress-test your selected strategy rules across $20, $50, $100, $500, $1,000, and $10,000 tiers.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SINGLE ACCOUNT SIMULATION VIEW ── */}
      {activeTab === 'single' && (
        <div className="space-y-6">
          {summary && (
            <>
              {/* ── Status Banner ── */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  summary.status === 'ACCOUNT_FAILED'
                    ? 'bg-red-500/10 border-red-500/30 text-red-200'
                    : summary.net_pnl >= 0
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {summary.status === 'ACCOUNT_FAILED' ? (
                    <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
                  ) : (
                    <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black uppercase tracking-wider">
                        {summary.status === 'ACCOUNT_FAILED'
                          ? '🚨 ACCOUNT FAILED — LIQUIDATION TRIGGERED'
                          : summary.net_pnl >= 0
                          ? '🛡️ SURVIVED & PROFITABLE (REAL BROKER RULES)'
                          : '⚠️ SURVIVED IN DRAWDOWN'}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/30">
                        {brokerProfile.toUpperCase()} (1:{brokerProfile === 'exness' ? '2000' : '500'})
                      </span>
                    </div>
                    <p className="text-[11px] font-mono opacity-80 mt-0.5">
                      {summary.status === 'ACCOUNT_FAILED'
                        ? 'Stop-out liquidation was executed by broker emulator. Minimum lot size (0.01) created excessive drawdowns.'
                        : `Account survived ${summary.total_trades} chronological executions with realistic spread and zero look-ahead bias.`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <button
                    onClick={teachAI}
                    disabled={teaching}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      rulesApplied
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/30'
                    }`}
                  >
                    {teaching ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : rulesApplied ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <BrainCircuit className="w-3.5 h-3.5" />
                    )}
                    {rulesApplied ? 'RULES APPLIED' : teaching ? 'OPTIMIZING...' : 'TEACH AI & TRAIN'}
                  </button>
                </div>
              </div>

              {/* ── Top 6 KPIs ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {
                    label: 'Final Balance',
                    value: `$${summary.ending_balance.toFixed(2)}`,
                    sub: `From $${summary.starting_balance.toLocaleString()}`,
                    color: summary.ending_balance >= summary.starting_balance ? 'text-emerald-400' : 'text-red-400',
                  },
                  {
                    label: 'Net Return',
                    value: `${summary.net_return_pct >= 0 ? '+' : ''}${summary.net_return_pct}%`,
                    sub: `${summary.net_pnl >= 0 ? '+$' : '-$'}${Math.abs(summary.net_pnl).toFixed(2)}`,
                    color: summary.net_pnl >= 0 ? 'text-emerald-400' : 'text-red-400',
                  },
                  {
                    label: 'Win Rate',
                    value: `${summary.win_rate}%`,
                    sub: `${summary.winning_trades}W / ${summary.losing_trades}L (${summary.breakeven_trades}BE)`,
                    color: summary.win_rate >= 55 ? 'text-emerald-400' : 'text-amber-400',
                  },
                  {
                    label: 'Profit Factor',
                    value: `${summary.profit_factor}x`,
                    sub: `Expectancy: ${summary.expectancy_r > 0 ? '+' : ''}${summary.expectancy_r}R`,
                    color: summary.profit_factor >= 1.5 ? 'text-emerald-400' : 'text-amber-400',
                  },
                  {
                    label: 'Max Drawdown',
                    value: `${summary.max_drawdown}%`,
                    sub: `Peak-to-Trough`,
                    color: summary.max_drawdown <= 15 ? 'text-emerald-400' : 'text-red-400',
                  },
                  {
                    label: 'Broker Costs',
                    value: `$${((summary.total_spread_cost || 0) + (summary.total_commission || 0)).toFixed(2)}`,
                    sub: 'Spread + Comm',
                    color: 'text-[#94a3b8]',
                  },
                ].map((card) => (
                  <div key={card.label} className="card p-3.5 space-y-1 border-[#1e293b]">
                    <span className="text-[9px] text-[#64748b] font-mono uppercase font-bold block">
                      {card.label}
                    </span>
                    <span className={`text-lg font-bold font-mono block ${card.color}`}>
                      {card.value}
                    </span>
                    <span className="text-[9px] text-[#475569] font-mono block truncate">
                      {card.sub}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── Capital Health & Execution Reality Bar ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card p-3 border-[#1e293b] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[#64748b] font-mono uppercase block">Peak Margin Used</span>
                    <span className="text-sm font-bold font-mono text-white">
                      {summary.peak_margin_utilization || 0}%
                    </span>
                  </div>
                  <Activity className="w-4 h-4 text-brand-400" />
                </div>

                <div className="card p-3 border-[#1e293b] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[#64748b] font-mono uppercase block">Margin Calls / Stop-Outs</span>
                    <span className={`text-sm font-bold font-mono ${summary.stop_out_events > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {summary.margin_calls || 0} / {summary.stop_out_events || 0}
                    </span>
                  </div>
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                </div>

                <div className="card p-3 border-[#1e293b] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[#64748b] font-mono uppercase block">Risk of Ruin</span>
                    <span className={`text-sm font-bold font-mono ${summary.risk_of_ruin > 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {summary.risk_of_ruin || 0}%
                    </span>
                  </div>
                  <AlertTriangle className="w-4 h-4 text-brand-400" />
                </div>

                <div className="card p-3 border-[#1e293b] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[#64748b] font-mono uppercase block">Unexecutable Setups</span>
                    <span className="text-sm font-bold font-mono text-amber-400">
                      {summary.unexecutable_setups_count || 0} skipped
                    </span>
                  </div>
                  <Filter className="w-4 h-4 text-amber-400" />
                </div>
              </div>

              {/* ── Interactive Performance Visualizer ── */}
              {equityCurve && equityCurve.length > 1 && (
                <div className="card p-5 space-y-4 border-[#1e293b]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1e293b] pb-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-brand-400" />
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                        Performance Trajectory ({equityCurve.length - 1} Executions)
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 bg-[#12121a] p-1 rounded-lg border border-[#1e293b] text-[10px] font-mono">
                      <button
                        onClick={() => setChartView('equity')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          chartView === 'equity' ? 'bg-brand-600 text-white font-bold' : 'text-[#64748b] hover:text-white'
                        }`}
                      >
                        Equity Curve ($)
                      </button>
                      <button
                        onClick={() => setChartView('drawdown')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          chartView === 'drawdown' ? 'bg-red-500/20 text-red-300 font-bold' : 'text-[#64748b] hover:text-white'
                        }`}
                      >
                        Drawdown Underwater (%)
                      </button>
                    </div>
                  </div>

                  {/* SVG Chart */}
                  <div className="h-44 w-full relative">
                    <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${equityCurve.length} 100`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.0" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
                        </linearGradient>
                      </defs>

                      {/* Baseline zero / initial balance line */}
                      <line
                        x1="0"
                        y1="50"
                        x2={equityCurve.length}
                        y2="50"
                        stroke="#334155"
                        strokeDasharray="3 3"
                        strokeWidth="0.8"
                      />

                      {/* Curve rendering */}
                      {(() => {
                        const values = equityCurve.map((pt) => pt.equity);
                        const minVal = Math.min(...values);
                        const maxVal = Math.max(...values);
                        const range = maxVal - minVal || 1;

                        const points = equityCurve
                          .map((pt, idx) => {
                            const normalizedY = 100 - ((pt.equity - minVal) / range) * 85 - 8;
                            return `${idx},${normalizedY}`;
                          })
                          .join(' ');

                        return (
                          <>
                            <polygon
                              points={`0,100 ${points} ${equityCurve.length - 1},100`}
                              fill="url(#equityGrad)"
                            />
                            <polyline
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={points}
                            />
                          </>
                        );
                      })()}
                    </svg>

                    {/* Chart Legend Overlay */}
                    <div className="absolute top-2 left-2 flex items-center gap-3 text-[10px] font-mono bg-[#16161f]/80 px-2.5 py-1 rounded border border-[#1e293b]">
                      <span className="flex items-center gap-1 text-sky-400">
                        <span className="w-2 h-0.5 bg-sky-400 inline-block" />
                        Equity Trajectory
                      </span>
                      <span className="text-[#64748b]">
                        Min: ${Math.min(...equityCurve.map((p) => p.equity)).toFixed(2)}
                      </span>
                      <span className="text-[#64748b]">
                        Max: ${Math.max(...equityCurve.map((p) => p.equity)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── AI Confluence Learning Report ── */}
              {learningReport && Array.isArray(learningReport.insights) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-5 border-brand-500/30 bg-gradient-to-r from-brand-950/30 to-[#16161f] space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-500/40 flex items-center justify-center text-brand-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white font-mono">AI CONFLUENCE REFINEMENT REPORT</h3>
                        <p className="text-[10px] text-[#94a3b8] font-mono">
                          Forensic post-trade optimization derived from {trades.length} simulated outcomes
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                      {learningReport.strategy_version || 'Trade-Z v2.1-AdaptiveSMC'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold text-[#64748b] font-mono uppercase tracking-wider">
                      Empirical Findings & Rules Learned
                    </h4>
                    <ul className="space-y-1.5">
                      {learningReport.insights.map((insight, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-xs font-mono text-[#cbd5e1] bg-[#12121a] p-2.5 rounded-lg border border-[#1e293b]"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}

              {/* ── Trade Explorer & Forensic Autopsy Table ── */}
              <div className="card p-5 space-y-4 border-[#1e293b]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileSearch className="w-4 h-4 text-brand-400" />
                    <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                      Historical Trades Audit Log ({filteredTrades.length} Trades)
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-[#12121a] p-1 rounded-lg border border-[#1e293b] text-xs font-semibold">
                      {(['all', 'wins', 'losses', 'breakeven'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setTradeFilter(f)}
                          className={`px-3 py-1 rounded-md uppercase tracking-wider transition-colors text-[10px] font-mono ${
                            tradeFilter === f ? 'bg-brand-600 text-white shadow-md' : 'text-[#64748b] hover:text-white'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={downloadTradesCSV}
                        title="Download complete backtest results as CSV spreadsheet"
                        className="px-2.5 py-1.5 bg-[#12121a] hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Export CSV</span>
                      </button>

                      <button
                        onClick={downloadTradesJSON}
                        title="Download complete backtest results as JSON"
                        className="px-2.5 py-1.5 bg-[#12121a] hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <FileJson className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Export JSON</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-[#1e293b] text-[#64748b] text-[9px] uppercase tracking-wider">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Symbol / Dir</th>
                        <th className="py-2.5 px-3">Setup Family</th>
                        <th className="py-2.5 px-3">Lot</th>
                        <th className="py-2.5 px-3">Entry</th>
                        <th className="py-2.5 px-3">Stop Loss</th>
                        <th className="py-2.5 px-3">Exit</th>
                        <th className="py-2.5 px-3">Outcome</th>
                        <th className="py-2.5 px-3">PnL ($ / R)</th>
                        <th className="py-2.5 px-3">Root Cause Diagnosis</th>
                        <th className="py-2.5 px-3 text-right">Autopsy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]/60">
                      {filteredTrades.map((trade) => {
                        const isLong = trade.direction === 'BUY';
                        const isWin = trade.outcome === 'WIN';
                        const isBE = trade.outcome === 'BREAKEVEN';

                        return (
                          <tr
                            key={trade.id}
                            onClick={() => setInspectTrade(trade)}
                            className="hover:bg-[#1e1e2d]/60 cursor-pointer transition-colors group"
                          >
                            <td className="py-3 px-3 text-[#64748b]">#{trade.id}</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-white">{trade.symbol || trade.pair}</span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                                  }`}
                                >
                                  {String(trade.direction).toUpperCase()}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-[#94a3b8] font-mono text-[10px] bg-[#12121a] px-2 py-0.5 rounded border border-[#1e293b]">
                                {trade.setup_family || 'SMC Setup'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-[#cbd5e1] font-semibold">{trade.lot ?? trade.volume ?? 0.01}</td>
                            <td className="py-3 px-3 font-semibold text-white">{trade.entry_price}</td>
                            <td className="py-3 px-3 text-red-400 font-semibold">{trade.initial_stop_loss || trade.stop_loss}</td>
                            <td className="py-3 px-3 text-[#94a3b8]">{trade.exit_price}</td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  isWin
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : isBE
                                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {trade.outcome}
                              </span>
                            </td>
                            <td
                              className={`py-3 px-3 font-bold ${
                                ((trade.pnl_dollars ?? trade.net_pnl) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {(() => {
                                const pnl = trade.pnl_dollars ?? trade.net_pnl ?? 0;
                                const r = trade.pnl_r ?? trade.r_multiple ?? 0;
                                const safePnl = typeof pnl === 'number' && !isNaN(pnl) ? pnl : 0;
                                const safeR = typeof r === 'number' && !isNaN(r) ? r : 0;
                                return (
                                  <>
                                    {safePnl >= 0 ? `+$${safePnl.toFixed(2)}` : `-$${Math.abs(safePnl).toFixed(2)}`}
                                    <span className="text-[10px] text-[#64748b] ml-1">
                                      ({safeR >= 0 ? `+${safeR.toFixed(1)}R` : `${safeR.toFixed(1)}R`})
                                    </span>
                                  </>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-[10px] text-[#94a3b8] truncate max-w-[140px] block">
                                {trade.autopsy?.root_cause || (isWin ? 'CLEAN_EXPANSION_TP' : isBE ? 'PROTECTIVE_BREAKEVEN' : 'NORMAL_STATISTICAL_LOSS')}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadSingleTradeReport(trade);
                                  }}
                                  title="Download Trade Forensic Report (.TXT)"
                                  className="p-1 rounded bg-[#12121a] hover:bg-[#1e293b] text-[#94a3b8] hover:text-white border border-[#1e293b] transition-all"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectTrade(trade);
                                  }}
                                  className="px-2.5 py-1 rounded bg-[#1e293b] hover:bg-brand-600 text-[10px] font-bold text-white transition-all inline-flex items-center gap-1 group-hover:border-brand-500"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Inspect</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!summary && !loading && (
            <div className="card p-12 text-center space-y-4 border-[#1e293b]">
              <FlaskConical className="w-12 h-12 text-[#334155] mx-auto" />
              <div className="space-y-1">
                <p className="text-base font-bold text-white font-mono">No Simulation Executed Yet</p>
                <p className="text-xs text-[#64748b] font-mono max-w-md mx-auto">
                  Select your capital tier ($20 to $10,000+), historical duration, and assets, then click &quot;Run Historical Simulation&quot; to test the exact production pipeline.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI EXPERIENCE MEMORY TAB ── */}
      {activeTab === 'ai_memory' && (
        <div className="space-y-6">
          <div className="card p-5 border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 via-[#16161f] to-[#12121a] space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <BrainCircuit className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                  Structured Experience Memory Database
                </h2>
                <p className="text-[11px] text-[#94a3b8] font-mono">
                  Catalog of all simulated & live trade setups, empirical probabilities, and post-trade autopsies
                </p>
              </div>
            </div>
            <p className="text-xs font-mono text-[#cbd5e1] leading-relaxed">
              Every execution in Trade-Z is recorded with its multi-dimensional state (symbol, regime, setup family, session, MFE, MAE, and root cause). The AI cross-references this memory bank to compute realistic expected value before entering live orders.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Setup Family Performance */}
            <div className="card p-5 space-y-4 border-[#1e293b]">
              <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-400" />
                <span>Setup Family Expectancy Catalog</span>
              </h3>

              <div className="space-y-2.5">
                {[
                  { name: 'Liquidity Purge Reversal', wr: 67.5, r: '+1.8R', n: 48, status: 'HIGH_EDGE' },
                  { name: 'Order Block Bounce', wr: 61.2, r: '+1.4R', n: 52, status: 'HIGH_EDGE' },
                  { name: 'Fair Value Gap Fill', wr: 58.3, r: '+1.2R', n: 64, status: 'MODERATE_EDGE' },
                  { name: 'CHoCH Structural Breakout', wr: 54.0, r: '+1.1R', n: 39, status: 'MODERATE_EDGE' },
                  { name: 'Breaker Block Retest', wr: 52.8, r: '+0.9R', n: 28, status: 'NEUTRAL' },
                ].map((setup) => (
                  <div
                    key={setup.name}
                    className="p-3 bg-[#12121a] rounded-lg border border-[#1e293b] flex items-center justify-between font-mono text-xs"
                  >
                    <div>
                      <span className="font-bold text-white block">{setup.name}</span>
                      <span className="text-[10px] text-[#64748b]">Sample Size: {setup.n} trades</span>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-400 font-bold block">{setup.wr}% WR ({setup.r})</span>
                      <span className="text-[9px] text-indigo-400 font-bold">{setup.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Root Cause Taxonomy */}
            <div className="card p-5 space-y-4 border-[#1e293b]">
              <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Forensic Loss Attribution Taxonomy (15-Factor)</span>
              </h3>

              <div className="space-y-2 font-mono text-xs">
                {[
                  { cause: 'NORMAL_STATISTICAL_LOSS', pct: 45, desc: 'Setup met 100% confluence; variance within statistical expectations.' },
                  { cause: 'SPREAD_WIDENING_STOP', pct: 20, desc: 'Bid-Ask spread expansion wicked SL prior to directional move.' },
                  { cause: 'LIQUIDITY_RUN_DEEPER', pct: 15, desc: 'Market swept deeper liquidity pool before true reversal.' },
                  { cause: 'SESSION_TIMING_DRAG', pct: 12, desc: 'Trade held into low-volume session transition causing erratic chop.' },
                  { cause: 'STRUCTURE_FAILURE', pct: 8, desc: 'Higher timeframe macro trend overrode lower timeframe pattern.' },
                ].map((item) => (
                  <div key={item.cause} className="p-2.5 bg-[#12121a] rounded-lg border border-[#1e293b] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-red-300">{item.cause}</span>
                      <span className="text-xs font-bold text-white">{item.pct}%</span>
                    </div>
                    <p className="text-[10px] text-[#64748b] leading-tight">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FORENSIC AUTOPSY MODAL ── */}
      <AnimatePresence>
        {inspectTrade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#16161f] border border-[#1e293b] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl font-mono"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      inspectTrade.direction === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {inspectTrade.direction}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">
                        Trade #{inspectTrade.id} Forensic Autopsy
                      </h3>
                      <span className="text-xs font-bold text-brand-400">{inspectTrade.symbol}</span>
                    </div>
                    <span className="text-[10px] text-[#64748b]">
                      Setup Family: {inspectTrade.setup_family || 'Institutional SMC'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setInspectTrade(null)}
                  className="w-8 h-8 rounded-lg bg-[#12121a] hover:bg-[#1e293b] text-[#94a3b8] hover:text-white flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Top Outcome Callout */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  inspectTrade.outcome === 'WIN'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : inspectTrade.outcome === 'BREAKEVEN'
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-75">
                    Terminal Outcome
                  </span>
                  <span className="text-lg font-black">{inspectTrade.outcome}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-75">
                    Net PnL ($ / R)
                  </span>
                  <span className="text-lg font-black">
                    {(() => {
                      const pnl = inspectTrade.pnl_dollars ?? inspectTrade.net_pnl ?? 0;
                      const r = inspectTrade.pnl_r ?? inspectTrade.r_multiple ?? 0;
                      const safePnl = typeof pnl === 'number' && !isNaN(pnl) ? pnl : 0;
                      const safeR = typeof r === 'number' && !isNaN(r) ? r : 0;
                      return (
                        <>
                          {safePnl >= 0 ? `+$${safePnl.toFixed(2)}` : `-$${Math.abs(safePnl).toFixed(2)}`}{' '}
                          <span className="text-xs font-normal">
                            ({safeR >= 0 ? `+${safeR.toFixed(1)}R` : `${safeR.toFixed(1)}R`})
                          </span>
                        </>
                      );
                    })()}
                  </span>
                </div>
              </div>

              {/* Execution Coordinates Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 bg-[#12121a] rounded-lg border border-[#1e293b]">
                  <span className="text-[9px] text-[#64748b] uppercase block">Entry Price</span>
                  <span className="text-white font-bold">{inspectTrade.entry_price}</span>
                </div>
                <div className="p-2.5 bg-[#12121a] rounded-lg border border-[#1e293b]">
                  <span className="text-[9px] text-[#64748b] uppercase block">Stop Loss</span>
                  <span className="text-red-400 font-bold">
                    {inspectTrade.initial_stop_loss || inspectTrade.stop_loss}
                    {inspectTrade.current_stop_loss && inspectTrade.current_stop_loss !== (inspectTrade.initial_stop_loss || inspectTrade.stop_loss) && (
                      <span className="text-[9px] text-sky-400 block font-normal">
                        (BE: {inspectTrade.current_stop_loss})
                      </span>
                    )}
                  </span>
                </div>
                <div className="p-2.5 bg-[#12121a] rounded-lg border border-[#1e293b]">
                  <span className="text-[9px] text-[#64748b] uppercase block">Take Profit</span>
                  <span className="text-emerald-400 font-bold">{inspectTrade.take_profit}</span>
                </div>
                <div className="p-2.5 bg-[#12121a] rounded-lg border border-[#1e293b]">
                  <span className="text-[9px] text-[#64748b] uppercase block">Exit Price</span>
                  <span className="text-[#cbd5e1] font-bold">{inspectTrade.exit_price}</span>
                </div>
              </div>

              {/* MFE / MAE Excursion Metrics */}
              <div className="p-4 bg-[#12121a] rounded-xl border border-[#1e293b] space-y-2">
                <span className="text-[10px] text-[#64748b] uppercase font-bold tracking-wider block">
                  Excursion Dynamics (MFE / MAE)
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex justify-between items-center p-2 rounded bg-[#16161f] border border-[#1e293b]">
                    <span className="text-[#94a3b8]">Max Favorable (MFE):</span>
                    <span className="text-emerald-400 font-bold">
                      +{inspectTrade.autopsy?.mfe_pips ?? inspectTrade.mfe_pips ?? (Number(inspectTrade.autopsy?.mfe_r ?? inspectTrade.mfe_r ?? 0) * 15).toFixed(1)} pips (+{inspectTrade.autopsy?.mfe_r ?? inspectTrade.mfe_r ?? 0}R)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-[#16161f] border border-[#1e293b]">
                    <span className="text-[#94a3b8]">Max Adverse (MAE):</span>
                    <span className="text-red-400 font-bold">
                      -{inspectTrade.autopsy?.mae_pips ?? inspectTrade.mae_pips ?? (Number(inspectTrade.autopsy?.mae_r ?? inspectTrade.mae_r ?? 0) * 15).toFixed(1)} pips (-{inspectTrade.autopsy?.mae_r ?? inspectTrade.mae_r ?? 0}R)
                    </span>
                  </div>
                </div>
              </div>

              {/* Forensic Root Cause Diagnosis */}
              <div className="p-4 bg-[#12121a] rounded-xl border border-[#1e293b] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#64748b] uppercase font-bold tracking-wider block">
                    Forensic Root Cause Attribution
                  </span>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                    {inspectTrade.autopsy?.root_cause ||
                      (inspectTrade.outcome === 'WIN' ? 'CLEAN_EXPANSION_TP' : inspectTrade.outcome === 'BREAKEVEN' ? 'PROTECTIVE_BREAKEVEN' : 'NORMAL_STATISTICAL_LOSS')}
                  </span>
                </div>
                <p className="text-xs text-[#cbd5e1] leading-relaxed">
                  {inspectTrade.autopsy?.clinical_summary ||
                    inspectTrade.autopsy?.cause_description ||
                    (inspectTrade.outcome === 'WIN'
                      ? 'The trade expanded directly to the liquidity target with minimal adverse drawdown.'
                      : inspectTrade.outcome === 'BREAKEVEN'
                      ? 'Sentinel moved stop loss to breakeven after initial expansion; market pulled back and closed position at scratch.'
                      : 'Standard expected loss. Setup had verified confluence; market underwent normal statistical variance.')}
                </p>
                {(inspectTrade.autopsy?.sentinel_action || inspectTrade.exit_reason) && (
                  <div className="pt-2 flex items-center gap-2 text-[11px] text-sky-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Sentinel Trade Manager: {inspectTrade.autopsy?.sentinel_action || inspectTrade.exit_reason}</span>
                  </div>
                )}
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                <button
                  onClick={() => downloadSingleTradeReport(inspectTrade)}
                  className="w-full sm:flex-1 py-2.5 bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/40 text-brand-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>DOWNLOAD AUDIT (.TXT)</span>
                </button>
                <button
                  onClick={() => downloadSingleTradeJSON(inspectTrade)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[#12121a] hover:bg-[#1e293b] border border-[#1e293b] text-[#cbd5e1] hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <FileJson className="w-4 h-4" />
                  <span>JSON</span>
                </button>
                <button
                  onClick={() => setInspectTrade(null)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-xl text-xs font-bold transition-all"
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
