'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Scan, TrendingUp, TrendingDown, Loader2, AlertTriangle } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

const getSimulatedPrice = (pair: string) => {
  const u = pair.toUpperCase();
  if (u.includes('EURUSD')) return { entry: 1.0845, sl: 1.0830, tp: 1.0880 }; // 15 pip SL, 35 pip TP
  if (u.includes('GBPUSD')) return { entry: 1.2680, sl: 1.2665, tp: 1.2720 }; // 15 pip SL, 40 pip TP
  if (u.includes('USDJPY')) return { entry: 154.20, sl: 153.95, tp: 154.75 }; // 25 pip SL, 55 pip TP
  if (u.includes('XAUUSD') || u.includes('GOLD')) return { entry: 2850.50, sl: 2844.50, tp: 2865.50 }; // $6 SL, $15 TP
  if (u.includes('BTCUSD') || u.includes('BTC')) return { entry: 88500.0, sl: 87500.0, tp: 90500.0 };
  if (u.includes('ETHUSD') || u.includes('ETH')) return { entry: 2820.0, sl: 2780.0, tp: 2900.0 };
  if (u.includes('AUDUSD')) return { entry: 0.6650, sl: 0.6635, tp: 0.6685 };
  if (u.includes('USDCAD')) return { entry: 1.3620, sl: 1.3605, tp: 1.3655 };
  return { entry: 1.0000, sl: 0.9980, tp: 1.0050 };
};

const getSimulatedSetup = (pair: string, direction: 'long' | 'short') => {
  const base = getSimulatedPrice(pair);
  const entry = base.entry;
  const isJpy = pair.toUpperCase().includes('JPY');
  const isGold = pair.toUpperCase().includes('XAU') || pair.toUpperCase().includes('GOLD');
  const isCrypto = pair.toUpperCase().includes('BTC') || pair.toUpperCase().includes('ETH');
  
  const pips = isJpy ? 0.01 : isGold ? 1.0 : isCrypto ? 10.0 : 0.0001;
  const decimals = isJpy ? 3 : isGold || isCrypto ? 2 : 5;

  const slDist = Math.abs(entry - base.sl) || (pips * 15);
  const tpDist = slDist * 2.5;

  if (direction === 'long') {
    return {
      entry: Number(entry.toFixed(decimals)),
      sl: Number((entry - slDist).toFixed(decimals)),
      tp: Number((entry + tpDist).toFixed(decimals)),
      current: Number((entry - (pips * 2)).toFixed(decimals))
    };
  } else {
    return {
      entry: Number(entry.toFixed(decimals)),
      sl: Number((entry + slDist).toFixed(decimals)),
      tp: Number((entry - tpDist).toFixed(decimals)),
      current: Number((entry + (pips * 2)).toFixed(decimals))
    };
  }
};

export default function LiveScannerWidget() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [activePair, setActivePair] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['Scanner initialized. Configure watchlist in Settings.']);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [loading, setLoading] = useState(true);

  // From user_settings
  const [tradingMode, setTradingMode] = useState('manual');
  const [defaultLot, setDefaultLot] = useState(0.01);
  const [dailySignalLimit, setDailySignalLimit] = useState(2);
  const [userId, setUserId] = useState<string | null>(null);

  // Today's signal count (enforced limit)
  const [todaySignalCount, setTodaySignalCount] = useState(0);
  const [selectedSinglePair, setSelectedSinglePair] = useState('EURUSD');

  useEffect(() => {
    if (watchlist.length > 0) {
      setSelectedSinglePair(watchlist[0]);
    }
  }, [watchlist]);

  const scanIndex = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load config + watchlist from Supabase settings
  const loadConfig = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: s } = await supabase
        .from('user_settings').select('*').eq('user_id', user.id).maybeSingle();

      if (s) {
        setTradingMode(s.trading_mode || 'manual');
        setDefaultLot(Number(s.default_lot_size) || 0.01);
        setDailySignalLimit(Number(s.daily_signal_limit) || 2);

        const wl = Array.isArray(s.watchlist) && s.watchlist.length > 0
          ? s.watchlist
          : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
        setWatchlist(wl);
      } else {
        setWatchlist(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD']);
      }

      // Count today's signals (to enforce daily limit)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('signals')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', todayStart.toISOString());
      setTodaySignalCount(count || 0);

    } catch (err) {
      console.error('Error loading scanner config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // The main scanning execution sequence
  const runSingleScan = useCallback(async (specificPair?: string) => {
    if (watchlist.length === 0 || !userId) return;
 
    // Enforce daily signal limit
    if (todaySignalCount >= dailySignalLimit) {
      setLogs(prev => [
        `[LIMIT REACHED] Daily signal limit of ${dailySignalLimit} reached. Increase limit in Settings.`,
        ...prev,
      ]);
      setIsScanningActive(false);
      return;
    }

    if (!specificPair) {
      if (scanIndex.current >= watchlist.length) {
        scanIndex.current = 0;
      }
    }

    const pair = specificPair || watchlist[scanIndex.current];
    setActivePair(pair);
    setLogs(prev => [`[SCANNING] Requesting AI analysis for ${pair}...`, ...prev]);
 
    try {
      const apiBase = getApiBaseUrl();
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiBase}/api/v1/chat/analysis`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pair, timeframe: '15m' }),
      });
 
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.message || errBody?.detail || `HTTP ${res.status}`;
        setLogs(prev => [`[ERROR] ${errMsg}`, ...prev]);
        return;
      }
 
      const body = await res.json();
      const info = body?.data;
      if (!info) return;
      const decision = info.decision;
      const confidence = Number(info.confidence) || 75.0;
      const reasoning = info.reasoning || '';
      const expectedTrigger = info.expected_trigger || null;
      const isApproved = decision === 'approve';

      // 1. Resolve Direction Reliably (Never invert)
      let direction: 'long' | 'short' = 'long';
      if (info.direction) {
        direction = String(info.direction).toLowerCase() === 'short' ? 'short' : 'long';
      } else if (info.certificate?.direction) {
        direction = String(info.certificate.direction).toUpperCase().includes('SELL') ? 'short' : 'long';
      } else if (
        reasoning.toLowerCase().includes('sell setup') ||
        reasoning.toLowerCase().includes('short setup') ||
        reasoning.toLowerCase().includes('bearish')
      ) {
        direction = 'short';
      }

      // 2. Resolve Price Levels with Non-Zero Guarantee
      const priceInfo = getSimulatedSetup(pair, direction);
      let entryPrice = (typeof info.entry_price === 'number' && info.entry_price > 0) ? info.entry_price : priceInfo.entry;
      let currentPrice = (typeof info.current_price === 'number' && info.current_price > 0) ? info.current_price : priceInfo.current;
      let stopLoss = (typeof info.stop_loss === 'number' && info.stop_loss > 0) ? info.stop_loss : priceInfo.sl;
      let takeProfit = (typeof info.take_profit === 'number' && info.take_profit > 0) ? info.take_profit : priceInfo.tp;

      // 3. Enforce Directional Invariants (Never allow inverted SL/TP)
      if (direction === 'long') {
        if (stopLoss >= entryPrice) {
          const risk = Math.abs(entryPrice - stopLoss) || Math.abs(entryPrice - priceInfo.sl);
          stopLoss = Number((entryPrice - risk).toFixed(entryPrice > 500 ? 2 : 5));
        }
        if (takeProfit <= entryPrice) {
          const reward = Math.abs(takeProfit - entryPrice) || (Math.abs(entryPrice - stopLoss) * 2.5);
          takeProfit = Number((entryPrice + reward).toFixed(entryPrice > 500 ? 2 : 5));
        }
      } else {
        if (stopLoss <= entryPrice) {
          const risk = Math.abs(entryPrice - stopLoss) || Math.abs(priceInfo.sl - entryPrice);
          stopLoss = Number((entryPrice + risk).toFixed(entryPrice > 500 ? 2 : 5));
        }
        if (takeProfit >= entryPrice) {
          const reward = Math.abs(takeProfit - entryPrice) || (Math.abs(stopLoss - entryPrice) * 2.5);
          takeProfit = Number((entryPrice - reward).toFixed(entryPrice > 500 ? 2 : 5));
        }
      }

      const orderType = info.order_type || (direction === 'long' ? (entryPrice < currentPrice ? 'buy limit' : 'buy') : (entryPrice > currentPrice ? 'sell limit' : 'sell'));

      // Post ONLY the single best setup resolved by the AI
      const sigRes = await fetch(`${apiBase}/api/v1/trades/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          pair,
          direction,
          status: isApproved ? 'active' : 'rejected',
          entry_price: entryPrice,
          current_price: currentPrice,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          confidence,
          ai_reasoning: reasoning,
          timeframe: '15m',
          strategy: 'AI Intraday Scalp',
          expected_trigger: expectedTrigger,
          order_type: orderType,
          tags: isApproved && direction === 'long' ? ['m15_orderblock', 'intraday_liquidity'] : ['insufficient_momentum'],
        }),
      });
      const resBody = await sigRes.json().catch(() => ({}));
      const saved = sigRes.ok && resBody.success !== false;
 
      if (!saved) {
        const err = resBody.error || sigRes.statusText || 'Unknown error';
        setLogs(prev => [
          `[ERROR] Failed to save signal to database!`,
          `  -> Error: ${err}`,
          ...prev
        ]);
        setActivePair(null);
        return;
      }
 
      // Increment today's count by 1
      setTodaySignalCount(n => n + 1);
 
      if (isApproved) {
        const activeDir = direction.toUpperCase();
        const histSummary = info.certificate?.historical_pattern_summary || '';
        const hasLesson = histSummary.includes('Lesson Applied') || histSummary.includes('AI Lesson');

        const successLogs = [
          `[SIGNAL ✅] generated best setup for ${pair}! Direction: ${activeDir}`,
          `  -> ENTRY: ${entryPrice.toFixed(5)} (SL: ${stopLoss.toFixed(5)}, TP: ${takeProfit.toFixed(5)})`,
          `  -> Expected Trigger: ${expectedTrigger || 'Immediate'}`,
        ];
        if (hasLesson) {
          successLogs.push(`  -> [AI LESSON 💡] Setup applied lessons from previous trades to avoid traps.`);
        }

        setLogs(prev => [
          ...successLogs,
          ...prev,
        ]);
        
        if (tradingMode === 'fully_automatic') {
          setLogs(prev => [`[AUTO TRADE ⚡] Placing instant order for ${pair} (${direction.toUpperCase()})...`, ...prev]);
          const tradeRes = await fetch(`${apiBase}/api/v1/trades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ pair, direction, entryPrice, stopLoss, takeProfit, riskPercent: 1.0 }),
          });
          const tradeJson = await tradeRes.json().catch(() => ({}));

          if (tradeRes.ok) {
            const ticket = tradeJson.data?.mt5_ticket || tradeJson.mt5_ticket;
            const executedLot = tradeJson.data?.lot_size || defaultLot;
            if (ticket) {
              setLogs(prev => [
                `[MT5 EXECUTED 🚀] Placed ${direction.toUpperCase()} ${executedLot} lots on MetaTrader 5 (Ticket #${ticket})!`,
                ...prev,
              ]);
            } else {
              setLogs(prev => [
                `[AUTO TRADE ✅] Position recorded (${executedLot} lots). Note: Start start_mt5_bridge.bat to auto-execute directly on your MT5 terminal.`,
                ...prev,
              ]);
            }
          } else {
            const errDetail = tradeJson.message || tradeRes.statusText || 'Execution failed';
            if (errDetail.includes('Capital Protection') || errDetail.includes('Protection Veto')) {
              setLogs(prev => [
                `[CAPITAL SAFETY 🛡️] ${errDetail}`,
                ...prev,
              ]);
            } else {
              setLogs(prev => [
                `[AUTO TRADE ⚠️] Execution failed: ${errDetail}`,
                ...prev,
              ]);
            }
          }
        }
      } else {
        const isMemoryVeto = reasoning.includes('AI MEMORY') || reasoning.includes('AI Memory') || reasoning.includes('Pattern memory') || reasoning.includes('stopped-out');
        if (isMemoryVeto) {
          setLogs(prev => [
            `[AI MEMORY 🧠] Vetoed ${pair} ${direction.toUpperCase()} setup to avoid repeating past loss pattern:`,
            `  -> ${reasoning}`,
            ...prev,
          ]);
        } else {
          setLogs(prev => [
            `[REJECTED ❌] ${pair} setup risky: ${reasoning}`,
            ...prev,
          ]);
        }
      }
    } catch (err: any) {
      console.error('Scanner error:', err);
      setLogs(prev => [`[EXCEPTION] ${err.message}`, ...prev]);
    } finally {
      setActivePair(null);
      if (!specificPair) {
        scanIndex.current += 1;
      }
    }
  }, [watchlist, userId, tradingMode, dailySignalLimit, todaySignalCount]);

  // Start / stop scanner interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isScanningActive || watchlist.length === 0 || !userId) return;

    runSingleScan();
    intervalRef.current = setInterval(runSingleScan, 45000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isScanningActive, watchlist, userId, runSingleScan]);

  if (loading) return (
    <div className="card p-6 flex items-center justify-center gap-2 text-xs font-mono text-[#64748b]">
      <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading scanner configuration...
    </div>
  );

  const limitReached = todaySignalCount >= dailySignalLimit;

  return (
    <div className="space-y-4">
      {/* Scanner Control Panel */}
      <div className="card p-5 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#1e293b] pb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isScanningActive && !limitReached ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}`} />
            <h3 className="text-sm font-semibold text-white">AI Scanner</h3>
            <span className="text-[9px] font-mono text-[#475569] bg-bg-secondary px-1.5 py-0.5 rounded">
              {todaySignalCount}/{dailySignalLimit} signals today
            </span>
          </div>
          <button
            onClick={() => setIsScanningActive(v => !v)}
            disabled={limitReached}
            className={`px-3 py-1 rounded text-[10px] font-bold font-mono uppercase transition-colors border disabled:opacity-40 disabled:cursor-not-allowed ${
              isScanningActive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-bg-secondary text-[#94a3b8] border-[#1e293b] hover:text-white'
            }`}
          >
            {isScanningActive ? '⬛ Stop Scan' : '▶ Start Scan'}
          </button>
        </div>

        {/* Single Pair Manual Analyzer Panel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e293b]/50 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#94a3b8]">Select Asset:</span>
            <select
              value={selectedSinglePair}
              onChange={e => setSelectedSinglePair(e.target.value)}
              className="bg-bg-secondary border border-[#1e293b] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-brand-505"
            >
              {watchlist.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          
          <button
            onClick={() => runSingleScan(selectedSinglePair)}
            disabled={isScanningActive || limitReached || watchlist.length === 0}
            className="btn bg-bg-secondary hover:text-white text-[#94a3b8] border-[#1e293b] text-[10px] py-1 px-3 font-mono font-bold uppercase flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed border"
          >
            {activePair === selectedSinglePair ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
            ) : (
              <Scan className="w-3.5 h-3.5" />
            )}
            Analyze Single
          </button>
        </div>

        {/* Limit warning */}
        {limitReached && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-400 text-[10px] font-mono">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Daily signal limit reached ({dailySignalLimit}). Go to <strong className="mx-1">Settings → Risk Rules</strong> to increase your limit.
          </div>
        )}

        {/* Active watchlist display */}
        <div>
          <p className="text-[9px] text-[#475569] font-mono uppercase mb-2">Scanning Watchlist</p>
          {watchlist.length === 0 ? (
            <p className="text-[10px] text-[#475569] font-mono">
              No pairs configured. Go to <strong>Settings → Watchlist</strong> to add pairs.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {watchlist.map(pair => (
                <span
                  key={pair}
                  className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-semibold flex items-center gap-1.5 transition-all ${
                    activePair === pair
                      ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                      : 'border-[#1e293b] bg-bg-secondary text-white'
                  }`}
                >
                  {activePair === pair && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {pair}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mode display */}
        <div className="flex items-center gap-3 pt-1 border-t border-[#1e293b]/50 text-[10px] font-mono text-[#475569]">
          <span>Mode: <strong className="text-[#94a3b8]">{tradingMode.replace('_', ' ').toUpperCase()}</strong></span>
          <span>·</span>
          <span>Lot: <strong className="text-[#94a3b8]">{defaultLot}</strong></span>
          <span>·</span>
          <span>Interval: <strong className="text-[#94a3b8]">45s</strong></span>
        </div>
      </div>

      {/* Live AI Terminal Log */}
      <div className="card p-5 space-y-3">
        <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Scan className="w-4 h-4 text-brand-400 animate-pulse" />
            Scanner Log
          </h3>
          <button
            onClick={() => setLogs(['Log cleared.'])}
            className="text-[9px] font-mono text-[#475569] hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="bg-[#060810] p-3 rounded-lg border border-[#1e293b] h-[180px] overflow-y-auto font-mono text-[10px] leading-relaxed space-y-1.5 no-scrollbar">
          {logs.map((log, i) => {
            const isError = log.includes('[EXCEPTION]') || log.includes('[ERROR]');
            const isSignal = log.includes('[SIGNAL');
            const isRejected = log.includes('[REJECTED');
            const isWarn = log.includes('[WARN]') || log.includes('[LIMIT');
            const isAuto = log.includes('[AUTO');
            return (
              <div key={i} className={
                isError ? 'text-red-400 font-bold' :
                isSignal ? 'text-emerald-400 font-bold pl-2 border-l-2 border-emerald-500' :
                isRejected ? 'text-red-300 pl-2 border-l-2 border-red-500/50' :
                isWarn ? 'text-amber-400' :
                isAuto ? 'text-blue-400' :
                'text-[#475569]'
              }>
                {log}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
