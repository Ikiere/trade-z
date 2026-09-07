'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { 
  Scan, TrendingUp, TrendingDown, Loader2, AlertTriangle, Zap, 
  CheckCircle2, ShieldAlert, Sparkles, Brain, Clock, ShieldCheck, 
  Snowflake, Plus, X, Search, Coins, Compass, Lock, Radio, RefreshCw, XCircle, Shield
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { checkTradingSession, SessionShieldStatus } from '@/lib/trading-session';
import { resolveAssetMeta, normalizePairSymbol, isCryptoAsset, CURATED_ASSETS } from '@/lib/assets-registry';
import { useMt5, Mt5Position } from '@/lib/mt5-sync-context';

export interface SentinelEvaluation {
  ticket: number;
  symbol: string;
  action: 'HOLD' | 'BREAKEVEN_MOVE' | 'EARLY_CUT_STRUCTURE' | 'EARLY_CUT_BTC_DUMP' | 'EJECT_NEWS_SAFETY' | 'EJECT_NEWS_PROFIT';
  should_close: boolean;
  should_modify_sl?: boolean;
  target_sl?: number;
  badge: string;
  badge_color: 'emerald' | 'green' | 'cyan' | 'amber' | 'red';
  reason: string;
  r_multiple: number;
  is_risk_free: boolean;
  news_event?: any;
  last_evaluated_at?: string;
}

interface Mt5AccountInfo {
  connected: boolean;
  login?: number;
  server?: string;
  balance?: number;
  equity?: number;
  leverage?: number;
}

interface LatestTradeSetup {
  pair: string;
  direction: 'long' | 'short';
  orderType: string;
  signalId?: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  confidence: number;
  reasoning: string;
  isApproved: boolean;
  timestamp: string;
  mt5Ticket?: number | null;
  collaboration?: {
    active?: boolean;
    brain_verdict?: string;
    teacher_lesson?: string;
    student_adaptation?: string;
    collaborative_rationale?: string;
  };
  altcoinStrategy?: {
    btc_regime?: string;
    relative_strength_score?: number;
    key_catalyst?: string;
    setup_type?: string;
    liquidity_sweep_price?: number;
    altcoin_confluence_score?: number;
  };
}

const getSimulatedSetup = (pair: string, direction: 'long' | 'short') => {
  const meta = resolveAssetMeta(pair);
  const entry = meta.basePrice;
  const pips = meta.pipSize;
  const decimals = meta.decimals;

  // Calibrate stop loss distance dynamically based on asset volatility and price magnitude
  const slDist = meta.isCrypto 
    ? Math.max(entry * 0.02, pips * 15)
    : Math.max(entry * 0.002, pips * 20);
  const tpDist = slDist * 2.5;

  if (direction === 'long') {
    return {
      entry: Number(entry.toFixed(decimals)),
      sl: Number((entry - slDist).toFixed(decimals)),
      tp: Number((entry + tpDist).toFixed(decimals)),
      current: Number((entry - (pips * 2)).toFixed(decimals)),
      decimals,
    };
  } else {
    return {
      entry: Number(entry.toFixed(decimals)),
      sl: Number((entry + slDist).toFixed(decimals)),
      tp: Number((entry - tpDist).toFixed(decimals)),
      current: Number((entry + (pips * 2)).toFixed(decimals)),
      decimals,
    };
  }
};

export default function LiveScannerWidget() {
  const [watchlist, setWatchlist] = useState<string[]>([
    'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD'
  ]);
  const [activePair, setActivePair] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    'Institutional AI Scanner ready. Select an asset below to analyze its chart setup.'
  ]);
  const [loading, setLoading] = useState(true);

  // MT5 Bridge Status & Live Positions
  const {
    positions,
    modifyPosition,
    closePosition,
    bridgeStatus,
    refreshPositions,
  } = useMt5();

  const [mt5Status, setMt5Status] = useState<Mt5AccountInfo | null>(null);
  const [isExecutingManual, setIsExecutingManual] = useState(false);
  const [latestSetup, setLatestSetup] = useState<LatestTradeSetup | null>(null);

  // AI Sentinel Guardian state
  const [sentinelMap, setSentinelMap] = useState<Record<number, SentinelEvaluation>>({});
  const [isSentinelScanning, setIsSentinelScanning] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState<Record<number, boolean>>({});
  const executedSentinelActionsRef = useRef<Set<string>>(new Set());

  // From user_settings
  const [tradingMode, setTradingMode] = useState('fully_automatic');
  const [defaultLot, setDefaultLot] = useState(0.01);
  const [dailySignalLimit, setDailySignalLimit] = useState(2);
  const [userId, setUserId] = useState<string | null>(null);

  // Today's signal count (enforced limit for auto-trading)
  const [todaySignalCount, setTodaySignalCount] = useState(0);
  const [selectedSinglePair, setSelectedSinglePair] = useState('EURUSD');

  // Pair filtering and dynamic altcoin addition
  const [customPairInput, setCustomPairInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'crypto' | 'forex' | 'commodity'>('all');
  const [isAddingPair, setIsAddingPair] = useState(false);

  const handleAddPairToWatchlist = async (rawSymbol: string) => {
    if (!rawSymbol || !rawSymbol.trim()) return;
    const normalized = normalizePairSymbol(rawSymbol);
    if (!normalized) return;

    if (watchlist.includes(normalized)) {
      setSelectedSinglePair(normalized);
      setCustomPairInput('');
      return;
    }

    setIsAddingPair(true);
    const updated = [...watchlist, normalized];
    setWatchlist(updated);
    setSelectedSinglePair(normalized);
    setCustomPairInput('');

    const meta = resolveAssetMeta(normalized);
    setLogs(prev => [
      `[ASSET ADDED 🪙] Added ${normalized} (${meta.name} • ${meta.subCategory.toUpperCase()}) to scanner watchlist.`,
      `  -> Base: ~$${meta.basePrice.toLocaleString()} | Precision: ${meta.decimals} dec | Trading: ${meta.isCrypto ? '24/7 Global Crypto' : 'Market Session Hours'}`,
      ...prev
    ]);

    if (userId) {
      const supabase = createClient();
      await supabase.from('user_settings').update({ watchlist: updated }).eq('user_id', userId);
    }
    setIsAddingPair(false);
  };

  const handleRemovePairFromWatchlist = async (pairToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchlist.length <= 1) return;
    const updated = watchlist.filter(p => p !== pairToRemove);
    setWatchlist(updated);
    if (selectedSinglePair === pairToRemove) {
      setSelectedSinglePair(updated[0]);
    }
    setLogs(prev => [
      `[WATCHLIST] Removed ${pairToRemove} from scanner watchlist.`,
      ...prev
    ]);
    if (userId) {
      const supabase = createClient();
      await supabase.from('user_settings').update({ watchlist: updated }).eq('user_id', userId);
    }
  };

  useEffect(() => {
    if (watchlist.length > 0 && !watchlist.includes(selectedSinglePair)) {
      setSelectedSinglePair(watchlist[0]);
    }
  }, [watchlist, selectedSinglePair]);

  // Probe local MT5 bridge status (runs on user's laptop)
  const probeMt5Bridge = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:5001/account', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const json = await res.json();
        if (json.connected && json.account) {
          setMt5Status({
            connected: true,
            login: json.account.login,
            server: json.account.server,
            balance: json.account.balance,
            equity: json.account.equity,
            leverage: json.account.leverage,
          });
          return;
        }
      }
      setMt5Status({ connected: false });
    } catch (_) {
      setMt5Status({ connected: false });
    }
  }, []);

  useEffect(() => {
    probeMt5Bridge();
    const probeTimer = setInterval(probeMt5Bridge, 12000);
    return () => clearInterval(probeTimer);
  }, [probeMt5Bridge]);

  // AI Sentinel Continuous Active Trade Monitoring Loop
  const runSentinelMonitoring = useCallback(async () => {
    if (positions.length === 0) {
      setSentinelMap({});
      return;
    }
    setIsSentinelScanning(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const apiBase = getApiBaseUrl();

      const newEvaluations: Record<number, SentinelEvaluation> = {};

      for (const pos of positions) {
        let evalData: SentinelEvaluation | null = null;
        try {
          const res = await fetch(`${apiBase}/api/v1/chat/monitor`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              ticket: pos.ticket,
              symbol: pos.pair || pos.symbol,
              direction: pos.direction,
              entry_price: pos.price_open,
              current_price: pos.price_current,
              sl: pos.sl,
              tp: pos.tp,
              volume: pos.volume,
              profit: pos.profit,
            }),
            signal: AbortSignal.timeout(8000)
          });

          if (res.ok) {
            evalData = await res.json();
          }
        } catch (_) {
          // Local fallback
          try {
            const fallbackRes = await fetch(`http://127.0.0.1:8000/api/v1/analysis/monitor/evaluate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticket: pos.ticket,
                symbol: pos.pair || pos.symbol,
                direction: pos.direction,
                entry_price: pos.price_open,
                current_price: pos.price_current,
                sl: pos.sl,
                tp: pos.tp,
                volume: pos.volume,
                profit: pos.profit,
              }),
              signal: AbortSignal.timeout(4000)
            });
            if (fallbackRes.ok) {
              evalData = await fallbackRes.json();
            }
          } catch (__) {}
        }

        if (evalData && evalData.badge) {
          evalData.last_evaluated_at = new Date().toLocaleTimeString();
          newEvaluations[pos.ticket] = evalData;

          const actionKey = `${pos.ticket}_${evalData.action}_${evalData.target_sl || ''}`;

          // Auto-execute if in fully_automatic mode
          if (tradingMode === 'fully_automatic' && !executedSentinelActionsRef.current.has(actionKey)) {
            // Guard 1, 2, 3: Structural Early Cut or News Ejection
            if (evalData.should_close) {
              executedSentinelActionsRef.current.add(actionKey);
              setLogs(prev => [
                `[SENTINEL AUTO-EJECT 🛡️] Executing emergency exit for #${pos.ticket} (${pos.pair || pos.symbol})!`,
                `  -> Reason: ${evalData?.reason}`,
                ...prev
              ]);
              const closeRes = await closePosition(pos.ticket);
              if (closeRes.success) {
                setLogs(prev => [
                  `[SENTINEL EJECTED ✅] Position #${pos.ticket} closed. Capital protected from catastrophic drawdown.`,
                  ...prev
                ]);
              } else {
                setLogs(prev => [
                  `[SENTINEL NOTICE ⚠️] Close attempt returned: ${closeRes.error}`,
                  ...prev
                ]);
              }
            }
            // Guard 4: Breakeven locking
            else if (evalData.should_modify_sl && evalData.target_sl) {
              executedSentinelActionsRef.current.add(actionKey);
              setLogs(prev => [
                `[SENTINEL BREAKEVEN 🔒] Profit target hit (+1.0R)! Modifying #${pos.ticket} (${pos.pair || pos.symbol}) SL to ${evalData?.target_sl}.`,
                ...prev
              ]);
              const modRes = await modifyPosition(pos.ticket, evalData.target_sl);
              if (modRes.success) {
                setLogs(prev => [
                  `[SENTINEL LOCKED 🛡️] Trade #${pos.ticket} is now 100% Risk-Free (SL placed at entry + spread).`,
                  ...prev
                ]);
              }
            }
          }
        }
      }

      setSentinelMap(prev => ({ ...prev, ...newEvaluations }));
    } catch (err: any) {
      console.warn('[Sentinel Monitor error]:', err);
    } finally {
      setIsSentinelScanning(false);
    }
  }, [positions, tradingMode, closePosition, modifyPosition]);

  useEffect(() => {
    runSentinelMonitoring();
    const interval = setInterval(runSentinelMonitoring, 15000);
    return () => clearInterval(interval);
  }, [runSentinelMonitoring]);

  const handleManualLockBreakeven = async (pos: Mt5Position, targetSlFromEval?: number) => {
    setIsActionBusy(prev => ({ ...prev, [pos.ticket]: true }));
    try {
      const meta = resolveAssetMeta(pos.pair || pos.symbol);
      const buffer = meta.pipSize * 1.5;
      const calculatedSl = pos.direction === 'long'
        ? Number((pos.price_open + buffer).toFixed(meta.decimals))
        : Number((pos.price_open - buffer).toFixed(meta.decimals));

      const newSl = targetSlFromEval || calculatedSl;

      setLogs(prev => [
        `[SENTINEL USER COMMAND 🔒] Moving SL to Breakeven (${newSl}) for #${pos.ticket} (${pos.pair || pos.symbol})...`,
        ...prev
      ]);

      const res = await modifyPosition(pos.ticket, newSl);
      if (res.success) {
        setLogs(prev => [
          `[SENTINEL SUCCESS ✅] Breakeven locked on MT5 for #${pos.ticket}! Stop loss moved to ${newSl}. Trade is now risk-free!`,
          ...prev
        ]);
        setTimeout(() => runSentinelMonitoring(), 1000);
      } else {
        setLogs(prev => [
          `[SENTINEL ERROR ❌] Failed to modify SL on MT5: ${res.error}`,
          ...prev
        ]);
      }
    } catch (err: any) {
      setLogs(prev => [`[SENTINEL EXCEPTION] ${err.message}`, ...prev]);
    } finally {
      setIsActionBusy(prev => ({ ...prev, [pos.ticket]: false }));
    }
  };

  const handleManualEmergencyClose = async (ticket: number) => {
    setIsActionBusy(prev => ({ ...prev, [ticket]: true }));
    try {
      setLogs(prev => [
        `[SENTINEL USER COMMAND ⚡] Closing position #${ticket} at market price...`,
        ...prev
      ]);
      const res = await closePosition(ticket);
      if (res.success) {
        setLogs(prev => [
          `[SENTINEL SUCCESS ✅] Position #${ticket} closed successfully at market price.`,
          ...prev
        ]);
        setTimeout(() => runSentinelMonitoring(), 1000);
      } else {
        setLogs(prev => [
          `[SENTINEL ERROR ❌] Close rejected: ${res.error}`,
          ...prev
        ]);
      }
    } catch (err: any) {
      setLogs(prev => [`[SENTINEL EXCEPTION] ${err.message}`, ...prev]);
    } finally {
      setIsActionBusy(prev => ({ ...prev, [ticket]: false }));
    }
  };

  // Load config + watchlist from Supabase settings
  const loadConfig = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: s } = await supabase
        .from('user_settings').select('*').eq('user_id', user.id).maybeSingle();

      const cryptoDefaults = ['BTCUSD', 'ETHUSD', 'SOLUSD'];
      const baseList = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', ...cryptoDefaults];

      if (s) {
        setTradingMode(s.trading_mode || 'fully_automatic');
        setDefaultLot(Number(s.default_lot_size) || 0.01);
        setDailySignalLimit(Number(s.daily_signal_limit) || 2);

        const currentWl = Array.isArray(s.watchlist) && s.watchlist.length > 0
          ? s.watchlist
          : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
        const merged = Array.from(new Set([...currentWl, ...cryptoDefaults]));
        setWatchlist(merged);

        // Guarantee crypto pairs are persisted in Supabase
        const missingCrypto = cryptoDefaults.some(c => !currentWl.includes(c));
        if (missingCrypto) {
          await supabase.from('user_settings').update({ watchlist: merged }).eq('user_id', user.id);
        }
      } else {
        setDailySignalLimit(2);
        setWatchlist(baseList);
      }

      // Count today's signals (to display daily target)
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

  // Toggle MT5 Auto-Execution Mode
  const handleToggleAutoTrade = async () => {
    const nextMode = tradingMode === 'fully_automatic' ? 'manual' : 'fully_automatic';
    setTradingMode(nextMode);
    
    if (userId) {
      const supabase = createClient();
      await supabase
        .from('user_settings')
        .update({ trading_mode: nextMode })
        .eq('user_id', userId);
    }

    if (nextMode === 'fully_automatic') {
      setLogs(prev => [
        `[MODE TOGGLE ⚡] MT5 Auto-Execution ACTIVATED! Verified signals will immediately place trades on MT5.`,
        ...prev
      ]);
    } else {
      setLogs(prev => [
        `[MODE TOGGLE 🛑] MT5 Auto-Execution turned OFF. Signals will be generated without auto-placing orders.`,
        ...prev
      ]);
    }
  };

  // Direct Execution on MT5 Bridge
  const sendOrderToMt5 = async (setup: {
    pair: string;
    direction: 'long' | 'short';
    orderType?: string;
    signalId?: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    lotSize?: number;
    overrideSafety?: boolean;
  }) => {
    const apiBase = getApiBaseUrl();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    let executedTicket: number | null = null;
    let executedLot = setup.lotSize || defaultLot || 0.01;
    let pricePlaced = setup.entryPrice;

    // ── GUARD 1: Trading Session Protection Shield ─────────────
    const sessionShield = checkTradingSession(setup.pair);
    if (!setup.overrideSafety && !sessionShield.isEligible) {
      setLogs(prev => [
        `[SESSION SHIELD 🛡️] Trade execution vetoed: ${setup.pair} is outside active ${sessionShield.sessionName}!`,
        `  -> Current: ${sessionShield.currentUtcTime} | Session Hours: ${sessionShield.activeHours}`,
        `  -> ${sessionShield.message}`,
        ...prev,
      ]);
      return null;
    }

    // ── GUARD 2: Greed Shield — Max 2 Open Positions in MT5 ────
    if (!setup.overrideSafety) {
      try {
        const posRes = await fetch('http://127.0.0.1:5001/positions', { signal: AbortSignal.timeout(1500) });
        if (posRes.ok) {
          const posData = await posRes.json();
          const activePositions = Array.isArray(posData.positions) ? posData.positions : [];
          if (activePositions.length >= 2) {
            setLogs(prev => [
              `[GREED SHIELD 🛑] Trade vetoed: Maximum 2 open positions active in MT5 (${activePositions.length}/2).`,
              `  -> Institutional discipline rule: No new trades will be executed until an existing position is closed.`,
              ...prev,
            ]);
            return null;
          }
        }
      } catch (_) {}
    }

    // ── GUARD 3: Greed Shield — Max 2 Trades Per Day ───────────
    if (!setup.overrideSafety && todaySignalCount >= 2) {
      setLogs(prev => [
        `[GREED SHIELD 🛑] MT5 auto-trade vetoed: Daily limit of 2 trades reached for today (${todaySignalCount}/2).`,
        `  -> Institutional rule: 2 trades/day maximum to eliminate overtrading and emotional greed. Resumes tomorrow.`,
        ...prev,
      ]);
      return null;
    }

    // ── GUARD 4: Loss Cool-Down Shield ─────────────────────────
    if (!setup.overrideSafety) {
      try {
        const histRes = await fetch('http://127.0.0.1:5001/history', { signal: AbortSignal.timeout(1500) });
        if (histRes.ok) {
          const histData = await histRes.json();
          const trades = Array.isArray(histData.trades) ? histData.trades : [];
          const todayStr = new Date().toISOString().slice(0, 10);
          const todayTrades = trades.filter((t: any) => (t.time_close || t.time || '').startsWith(todayStr));
          const netDailyPnl = todayTrades.reduce((acc: number, t: any) => acc + (Number(t.profit) || 0), 0);

          // Only cooldown if net closed daily PnL is in the red
          if (netDailyPnl < -2.0 && todayTrades.length > 0) {
            setLogs(prev => [
              `[COOL-DOWN SHIELD 🧊] MT5 auto-trade vetoed: Net daily closed P&L is in drawdown (-$${Math.abs(netDailyPnl).toFixed(2)}).`,
              `  -> System in Cool-Down mode to protect capital and prevent revenge trading. Automatically unlocks tomorrow.`,
              ...prev,
            ]);
            return null;
          }
        }
      } catch (_) {}
    }

    // 1. Send direct to local MT5 bridge (running on user's laptop at 127.0.0.1:5001)
    try {
      const bridgeRes = await fetch('http://127.0.0.1:5001/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: setup.pair,
          direction: setup.direction,
          orderType: setup.orderType,
          entryPrice: setup.entryPrice,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          lotSize: executedLot,
          riskPercent: 1.0,
          overrideSafety: setup.overrideSafety ?? false,
        }),
      });

      const bridgeJson = await bridgeRes.json().catch(() => ({}));

      if (bridgeRes.ok && bridgeJson.success) {
        executedTicket = bridgeJson.ticket;
        executedLot = bridgeJson.volume || executedLot;
        pricePlaced = bridgeJson.price || pricePlaced;
        const rawOrderType = (bridgeJson.order_type || setup.orderType || (setup.direction === 'long' ? 'BUY' : 'SELL')).toLowerCase();
        const normalizedOrderType = (rawOrderType === 'buy' || rawOrderType === 'sell') ? 'market' : rawOrderType;
        const displayOrderType = normalizedOrderType === 'market'
          ? (setup.direction === 'long' ? 'BUY (MARKET)' : 'SELL (MARKET)')
          : normalizedOrderType.toUpperCase();

        setLogs(prev => [
          `[MT5 EXECUTED 🚀] Placed ${displayOrderType} (${executedLot} lots) on MetaTrader 5! (Ticket #${executedTicket})`,
          `  -> Symbol: ${bridgeJson.symbol} | Price: ${pricePlaced} | SL: ${bridgeJson.sl} | TP: ${bridgeJson.tp}`,
          ...prev
        ]);
        probeMt5Bridge();

        // Update latestSetup with exact MT5 order type
        setLatestSetup(prev => prev ? {
          ...prev,
          mt5Ticket: executedTicket,
          orderType: normalizedOrderType,
        } : null);

        // Sync exact MT5 order type and ticket to the Supabase signal
        const targetSignalId = setup.signalId || latestSetup?.signalId;
        if (targetSignalId && token) {
          fetch(`${apiBase}/api/v1/trades/signals/${targetSignalId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              order_type: normalizedOrderType,
              mt5_ticket: executedTicket,
            }),
          }).catch(() => {});
        }
      } else if (bridgeJson.error) {
        setLogs(prev => [
          `[MT5 NOTICE 🛡️] MT5 execution rejected: ${bridgeJson.error}`,
          ...prev
        ]);
      }
    } catch (bridgeErr: any) {
      console.warn('Direct local MT5 call unreachable, trying via backend API:', bridgeErr);
    }

    // 2. Sync to Trade-Z Trades database
    try {
      const tradeRes = await fetch(`${apiBase}/api/v1/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          pair: setup.pair,
          direction: setup.direction,
          entryPrice: pricePlaced,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          riskPercent: 1.0,
          mt5_ticket: executedTicket,
          lot_size: executedLot,
        }),
      });

      if (!executedTicket && tradeRes.ok) {
        const tradeJson = await tradeRes.json().catch(() => ({}));
        const ticket = tradeJson.data?.mt5_ticket;
        if (ticket) {
          executedTicket = ticket;
          setLogs(prev => [
            `[MT5 EXECUTED 🚀] Placed on MT5 via backend bridge (Ticket #${ticket})!`,
            ...prev
          ]);
        }
      }
    } catch (_) {}

    return executedTicket;
  };

  // Manual button click on latest setup
  const handleManualExecute = async () => {
    if (!latestSetup) return;
    setIsExecutingManual(true);
    try {
      setLogs(prev => [
        `[MANUAL ORDER ⚡] Sending ${latestSetup.pair} (${(latestSetup.orderType || latestSetup.direction).toUpperCase()}) to MT5...`,
        ...prev
      ]);
      const ticket = await sendOrderToMt5({
        pair: latestSetup.pair,
        direction: latestSetup.direction,
        orderType: latestSetup.orderType,
        signalId: latestSetup.signalId,
        entryPrice: latestSetup.entryPrice,
        stopLoss: latestSetup.stopLoss,
        takeProfit: latestSetup.takeProfit,
        overrideSafety: true,
      });
      if (ticket) {
        setLatestSetup(prev => prev ? { ...prev, mt5Ticket: ticket } : null);
      }
    } finally {
      setIsExecutingManual(false);
    }
  };

  // Single-pair chart analysis on demand
  const handleAnalyzePair = useCallback(async (targetPair?: string) => {
    const pair = targetPair || selectedSinglePair;
    if (!pair || !userId) return;

    setActivePair(pair);

    // Check Trading Session status
    const sessionCheck = checkTradingSession(pair);
    if (!sessionCheck.isEligible) {
      setLogs(prev => [
        `[SESSION NOTICE 🛡️] ${pair} is outside active session (${sessionCheck.currentUtcTime}).`,
        `  -> ${sessionCheck.message}`,
        `  -> AI analyzing technical SMC levels & structure (Live MT5 execution paused outside session).`,
        ...prev,
      ]);
    } else {
      setLogs(prev => [
        `[ANALYZING 🔍] AI reading 15M institutional market structure for ${pair} (${sessionCheck.sessionName})...`,
        ...prev,
      ]);
    }

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
        body: JSON.stringify({ 
          pair, 
          timeframe: '15m',
          account: mt5Status?.connected ? {
            balance: mt5Status.balance,
            equity: mt5Status.equity,
            leverage: mt5Status.leverage,
          } : undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.message || errBody?.detail || `HTTP ${res.status}`;
        if (errMsg.includes('502') || errMsg.includes('spinning up') || errMsg.includes('warming up') || errMsg.includes('cold start')) {
          setLogs(prev => [
            `[AI ENGINE WAKING UP ⏳] AI service is warming up on cloud infrastructure.`,
            `  -> Please wait 5-10 seconds and click "Analyze ${pair} Chart" again.`,
            ...prev
          ]);
          return;
        }
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

      // 1. Resolve Direction Reliably
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

      // Query MT5 bridge for exact live tick if connected
      let liveBid: number | null = null;
      let liveAsk: number | null = null;
      try {
        const qRes = await fetch(`http://127.0.0.1:5001/quote?pair=${encodeURIComponent(pair)}`, {
          signal: AbortSignal.timeout(1200),
        });
        if (qRes.ok) {
          const qData = await qRes.json();
          if (qData.success && typeof qData.bid === 'number') {
            liveBid = qData.bid;
            liveAsk = qData.ask;
          }
        }
      } catch (_) {}

      // 2. Resolve Price Levels
      const priceInfo = getSimulatedSetup(pair, direction);
      let currentPrice = (direction === 'long' ? liveAsk : liveBid) || (typeof info.current_price === 'number' && info.current_price > 0 ? info.current_price : priceInfo.current);
      let entryPrice = (typeof info.entry_price === 'number' && info.entry_price > 0) ? info.entry_price : priceInfo.entry;
      let stopLoss = (typeof info.stop_loss === 'number' && info.stop_loss > 0) ? info.stop_loss : priceInfo.sl;
      let takeProfit = (typeof info.take_profit === 'number' && info.take_profit > 0) ? info.take_profit : priceInfo.tp;

      // Directional Invariants
      const assetMeta = resolveAssetMeta(pair);
      const numDec = assetMeta.decimals;

      if (direction === 'long') {
        if (stopLoss >= entryPrice) {
          const risk = Math.abs(entryPrice - stopLoss) || Math.abs(entryPrice - priceInfo.sl);
          stopLoss = Number((entryPrice - risk).toFixed(numDec));
        }
        if (takeProfit <= entryPrice) {
          const reward = Math.abs(takeProfit - entryPrice) || (Math.abs(entryPrice - stopLoss) * 2.5);
          takeProfit = Number((entryPrice + reward).toFixed(numDec));
        }
      } else {
        if (stopLoss <= entryPrice) {
          const risk = Math.abs(entryPrice - stopLoss) || Math.abs(priceInfo.sl - entryPrice);
          stopLoss = Number((entryPrice + risk).toFixed(numDec));
        }
        if (takeProfit >= entryPrice) {
          const reward = Math.abs(takeProfit - entryPrice) || (Math.abs(stopLoss - entryPrice) * 2.5);
          takeProfit = Number((entryPrice - reward).toFixed(numDec));
        }
      }

      // Exact order type calculation adhering to MT5 specifications & Supabase signals constraint
      let orderType: string;
      const spreadThreshold = currentPrice * 0.0003;
      if (direction === 'long') {
        if (Math.abs(entryPrice - currentPrice) <= spreadThreshold) {
          orderType = 'market';
        } else if (entryPrice < currentPrice) {
          orderType = 'buy limit';
        } else {
          orderType = 'buy stop';
        }
      } else {
        if (Math.abs(entryPrice - currentPrice) <= spreadThreshold) {
          orderType = 'market';
        } else if (entryPrice > currentPrice) {
          orderType = 'sell limit';
        } else {
          orderType = 'sell stop';
        }
      }

      // Save Signal to database
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
      const savedSignalId = resBody.data?.id;

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

      setTodaySignalCount(n => n + 1);

      const collab = info.collaboration || info.certificate?.collaboration;
      const altStrategy = info.altcoin_strategy || info.certificate?.altcoin_strategy;

      // Save as latest setup
      setLatestSetup({
        pair,
        direction,
        orderType,
        signalId: savedSignalId,
        entryPrice,
        stopLoss,
        takeProfit,
        currentPrice,
        confidence,
        reasoning,
        isApproved,
        timestamp: new Date().toLocaleTimeString(),
        collaboration: collab,
        altcoinStrategy: altStrategy,
      });

      if (isApproved) {
        const activeDir = orderType.toUpperCase();
        const histSummary = info.certificate?.historical_pattern_summary || '';
        const hasLesson = histSummary.includes('Lesson Applied') || histSummary.includes('AI Lesson');
        const safeLot = (typeof info.recommended_lot_size === 'number' && info.recommended_lot_size > 0)
          ? info.recommended_lot_size
          : defaultLot;

        const successLogs = [
          `[SIGNAL ✅] Approved high-probability setup for ${pair}! Order: ${activeDir}`,
          `  -> ENTRY: ${entryPrice.toFixed(numDec)} (SL: ${stopLoss.toFixed(numDec)}, TP: ${takeProfit.toFixed(numDec)})`,
          `  -> Size: ${safeLot} Lots (MT5 Balance-Calibrated) | Confidence: ${confidence.toFixed(1)}%`,
        ];

        if (altStrategy && (altStrategy.setup_found || altStrategy.relative_strength_score)) {
          const rs = typeof altStrategy.relative_strength_score === 'number' ? altStrategy.relative_strength_score : 0;
          successLogs.push(`  -> [ALTCOIN ASLM 🪙] ${altStrategy.key_catalyst || 'Smart Money Accumulation'} (RS Score: ${rs > 0 ? '+' : ''}${rs.toFixed(1)}% vs BTC)`);
          if (altStrategy.btc_regime) {
            successLogs.push(`  -> [BTC COMPASS 🧭] Regime: ${altStrategy.btc_regime.replace(/_/g, ' ').toUpperCase()}`);
          }
        }

        if (collab?.active && collab.teacher_lesson) {
          successLogs.push(`  -> [AI BRAIN ADVISOR 🧠] ${collab.teacher_lesson}`);
          if (collab.student_adaptation && collab.student_adaptation.includes('Applied +')) {
            successLogs.push(`  -> [AI COLLABORATION 🤝] ${collab.student_adaptation}`);
          }
        } else if (hasLesson) {
          successLogs.push(`  -> [AI LESSON 💡] Setup applied lessons from previous trades to avoid traps.`);
        }

        setLogs(prev => [
          ...successLogs,
          ...prev,
        ]);
        
        // Auto-Management: Check for opposing position to close early on reversal
        try {
          const posRes = await fetch('http://127.0.0.1:5001/positions', { signal: AbortSignal.timeout(2000) });
          if (posRes.ok) {
            const posJson = await posRes.json();
            const opposing = (posJson.positions || []).find((p: any) => 
              p.pair.toUpperCase() === pair.toUpperCase() && p.direction !== direction
            );
            if (opposing) {
              setLogs(prev => [
                `[AI AUTO-EXIT 🎯] Reversal detected! Closing opposing ${opposing.direction.toUpperCase()} position #${opposing.ticket} on ${pair}...`,
                ...prev,
              ]);
              await fetch('http://127.0.0.1:5001/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket: opposing.ticket }),
              });
            }
          }
        } catch (_) {}

        // Auto-Execution Check
        if (tradingMode === 'fully_automatic') {
          setLogs(prev => [`[AUTO TRADE ⚡] Evaluating MT5 auto-execution for ${pair} (${orderType.toUpperCase()}, ${safeLot} lots)...`, ...prev]);
          const ticket = await sendOrderToMt5({
            pair,
            direction,
            orderType,
            signalId: savedSignalId,
            entryPrice,
            stopLoss,
            takeProfit,
            lotSize: safeLot,
          });
          if (ticket) {
            setLatestSetup(prev => prev ? { ...prev, mt5Ticket: ticket } : null);
          }
        } else {
          setLogs(prev => [
            `[MANUAL READY ℹ️] Setup approved! Sized at ${safeLot} lots. Click "⚡ Place on MT5 Now" button below to execute.`,
            ...prev,
          ]);
        }
      } else {
        const isShieldVeto = reasoning.includes('Capital Shield') || reasoning.includes('small capital') || reasoning.includes('tolerance') || reasoning.includes('Stop loss risk');
        const isBrainVeto = reasoning.includes('AI BRAIN VETO') || reasoning.includes('AI MEMORY') || reasoning.includes('AI Memory') || reasoning.includes('Pattern memory') || reasoning.includes('stopped-out');

        if (isShieldVeto) {
          setLogs(prev => [
            `[CAPITAL SHIELD 🛡️] Trade vetoed on ${pair} to protect MT5 balance:`,
            `  -> ${reasoning}`,
            ...prev,
          ]);
        } else if (isBrainVeto) {
          setLogs(prev => [
            `[AI BRAIN VETO 🧠] Vetoed ${pair} ${direction.toUpperCase()} setup to avoid repeating past loss pattern:`,
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
    }
  }, [selectedSinglePair, userId, tradingMode, defaultLot, probeMt5Bridge, sendOrderToMt5]);

  if (loading) return (
    <div className="card p-6 flex items-center justify-center gap-2 text-xs font-mono text-[#64748b]">
      <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading scanner configuration...
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 🛡️ AI TRADE SENTINEL: Real-Time Position Guardian & Capital Shield */}
      <div className="card p-4 border border-brand-500/30 bg-[#090d18] relative overflow-hidden shadow-xl shadow-brand-500/5">
        <div className="absolute top-0 right-0 w-64 h-32 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-[#1e293b] pb-3 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500/20 to-cyan-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0 shadow-inner">
              <ShieldAlert className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  AI Trade Sentinel
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30 uppercase">
                    Active Guardian
                  </span>
                </h3>
              </div>
              <p className="text-[10px] font-mono text-[#64748b]">
                Real-Time Trade Protection • High-Impact News Ejection • Adverse CHoCH Early Cut • Breakeven Locking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              15s Heartbeat Loop Active
            </span>
            <button
              onClick={() => runSentinelMonitoring()}
              disabled={isSentinelScanning}
              className="p-1.5 rounded-lg bg-bg-secondary hover:bg-[#1e293b] border border-[#1e293b] text-[#94a3b8] hover:text-white transition-all disabled:opacity-50"
              title="Force immediate Sentinel health evaluation"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSentinelScanning ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Positions Sentinel Status List */}
        <div className="pt-3 relative z-10 space-y-2.5">
          {positions.length === 0 ? (
            <div className="p-3.5 rounded-xl bg-[#060911] border border-[#1e293b]/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-white font-semibold font-mono text-[11px]">
                    All Systems Armed &bull; No Open Exposure
                  </div>
                  <div className="text-[#64748b] text-[10px] font-mono">
                    Standing by to actively defend new MT5 positions against CPI/NFP news spikes and structural invalidations.
                  </div>
                </div>
              </div>
              <span className="text-[9px] font-mono text-[#475569] bg-bg-secondary px-2.5 py-1 rounded border border-[#1e293b] shrink-0">
                Auto-Guard: {tradingMode === 'fully_automatic' ? '⚡ ENGAGED' : 'MANUAL CONFIRM'}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {positions.map((pos) => {
                const evalData = sentinelMap[pos.ticket];
                const isLong = pos.direction === 'long';
                const isProfit = pos.profit >= 0;
                const isEvaluating = isSentinelScanning && !evalData;

                const badgeColor = evalData?.badge_color || 'green';
                const isCut = evalData?.should_close;
                const isMoveBE = evalData?.should_modify_sl;
                const isSafe = evalData?.is_risk_free;

                return (
                  <div
                    key={pos.ticket}
                    className={`p-3 rounded-xl border transition-all ${
                      isCut
                        ? 'bg-rose-950/20 border-rose-500/50 shadow-lg shadow-rose-950/30'
                        : isMoveBE
                        ? 'bg-cyan-950/20 border-cyan-500/40 shadow-lg shadow-cyan-950/20'
                        : 'bg-[#060911] border-[#1e293b]'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-2.5">
                      {/* Left: Position Identifiers & Live Price */}
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {isLong ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white font-mono text-xs">{pos.pair || pos.symbol}</span>
                            <span className={`text-[9px] font-bold font-mono px-1.5 py-0.2 rounded uppercase ${
                              isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {isLong ? 'BUY' : 'SELL'} {pos.volume}L
                            </span>
                            <span className="text-[9px] font-mono text-[#64748b]">#{pos.ticket}</span>
                          </div>
                          <div className="text-[10px] font-mono text-[#94a3b8] flex items-center gap-2 mt-0.5">
                            <span>Open: <strong className="text-white">{pos.price_open}</strong></span>
                            <span>&rarr;</span>
                            <span>Live: <strong className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>{pos.price_current}</strong></span>
                            <span>&bull;</span>
                            <span className={isProfit ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {isProfit ? '+' : ''}${pos.profit.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Center: Sentinel Guardian Diagnosis Badge */}
                      <div className="flex items-center gap-2">
                        {isEvaluating ? (
                          <span className="text-[10px] font-mono px-2 py-1 rounded bg-bg-secondary text-[#64748b] border border-[#1e293b] flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                            Analyzing 15M Structure & News...
                          </span>
                        ) : evalData ? (
                          <div className="flex flex-col sm:items-end">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 uppercase ${
                              badgeColor === 'red'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                                : badgeColor === 'amber'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                : badgeColor === 'cyan'
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}>
                              {evalData.badge}
                            </span>
                            {evalData.r_multiple !== undefined && (
                              <span className="text-[9px] font-mono text-[#64748b] mt-0.5">
                                Risk Multiple: <strong className={evalData.r_multiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {evalData.r_multiple >= 0 ? '+' : ''}{evalData.r_multiple}R
                                </strong>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-1 rounded bg-bg-secondary text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Sentinel Guarded
                          </span>
                        )}
                      </div>

                      {/* Right: Quick Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Lock Breakeven Button */}
                        <button
                          onClick={() => handleManualLockBreakeven(pos, evalData?.target_sl)}
                          disabled={isActionBusy[pos.ticket] || isSafe}
                          className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all border ${
                            isSafe
                              ? 'bg-bg-secondary text-[#475569] border-[#1e293b] cursor-default'
                              : 'bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/30 shadow-sm shadow-cyan-500/20'
                          }`}
                          title={isSafe ? 'Trade is already risk-free at breakeven' : 'Move Stop Loss to Entry + Spread'}
                        >
                          <Lock className="w-3 h-3 text-cyan-400" />
                          {isSafe ? 'BE Locked' : 'Lock BE'}
                        </button>

                        {/* Emergency Protective Close */}
                        <button
                          onClick={() => handleManualEmergencyClose(pos.ticket)}
                          disabled={isActionBusy[pos.ticket]}
                          className="px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                          title="Instant market exit"
                        >
                          {isActionBusy[pos.ticket] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <XCircle className="w-3 h-3 text-rose-400" />
                          )}
                          Close
                        </button>
                      </div>
                    </div>

                    {/* Sentinel AI Diagnosis Reasoning */}
                    {evalData?.reason && (
                      <div className="mt-2 pt-2 border-t border-[#1e293b]/60 flex items-start gap-1.5 text-[10px] font-mono">
                        <Sparkles className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          badgeColor === 'red' ? 'text-rose-400' :
                          badgeColor === 'amber' ? 'text-amber-400' :
                          badgeColor === 'cyan' ? 'text-cyan-400' : 'text-emerald-400'
                        }`} />
                        <span className="text-[#94a3b8] leading-relaxed">
                          <strong className="text-white">AI Sentinel Diagnosis:</strong> {evalData.reason}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Scanner Control Panel */}
      <div className="card p-5 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-[#1e293b] pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`w-2.5 h-2.5 rounded-full ${activePair ? 'bg-brand-500 animate-ping' : 'bg-emerald-500'}`} />
            <h3 className="text-sm font-semibold text-white">AI Single-Pair Chart Scanner</h3>
            <span className="text-[9px] font-mono text-[#475569] bg-bg-secondary px-2 py-0.5 rounded border border-[#1e293b]">
              {todaySignalCount}/{dailySignalLimit} daily target
            </span>

            {/* MT5 Bridge Live Status Pill */}
            {mt5Status?.connected ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                MT5 Online (#{mt5Status.login} • ${mt5Status.balance})
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                MT5 Bridge Offline
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-Execution Toggle Button */}
            <button
              onClick={handleToggleAutoTrade}
              className={`px-3 py-1.5 rounded text-[10px] font-bold font-mono transition-all flex items-center gap-1.5 border ${
                tradingMode === 'fully_automatic'
                  ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 hover:bg-brand-500/30'
                  : 'bg-bg-secondary text-[#64748b] border-[#1e293b] hover:text-[#94a3b8]'
              }`}
              title="Toggle whether scanner executes orders immediately on your MT5 terminal"
            >
              <Zap className={`w-3 h-3 ${tradingMode === 'fully_automatic' ? 'text-brand-400 fill-brand-400' : ''}`} />
              {tradingMode === 'fully_automatic' ? '⚡ AUTO-TRADE: ON' : 'AUTO-TRADE: OFF'}
            </button>
          </div>
        </div>

        {/* Asset Category Filters & Custom Pair Adder */}
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase text-[#94a3b8] font-bold tracking-wider mr-1">
                Asset Filter:
              </span>
              {[
                { id: 'all', label: `All (${watchlist.length})` },
                { id: 'crypto', label: `🪙 Crypto & Alts (${watchlist.filter(p => isCryptoAsset(p)).length})` },
                { id: 'forex', label: `💱 Forex (${watchlist.filter(p => !isCryptoAsset(p) && !p.includes('XAU') && !p.includes('XAG') && !p.includes('OIL') && !p.includes('US30') && !p.includes('NAS')).length})` },
                { id: 'commodity', label: `🏆 Commodities & Indices (${watchlist.filter(p => p.includes('XAU') || p.includes('XAG') || p.includes('OIL') || p.includes('US30') || p.includes('NAS')).length})` },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id as any)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all border ${
                    categoryFilter === cat.id
                      ? 'border-brand-500 bg-brand-500/20 text-brand-300 font-bold'
                      : 'border-[#1e293b] bg-bg-secondary text-[#64748b] hover:text-[#94a3b8]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <span className="text-[10px] font-mono text-[#64748b]">
              Selected: <strong className="text-white font-bold">{selectedSinglePair}</strong>
            </span>
          </div>

          {/* Quick Add Custom Altcoin or Forex Pair Input Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-xl bg-[#090d16] border border-[#1e293b]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Type ANY altcoin or pair (e.g. PEPE, SUI, AVAX, TAO, GBPJPY, US30)..."
                value={customPairInput}
                onChange={e => setCustomPairInput(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPairToWatchlist(customPairInput);
                  }
                }}
                className="w-full bg-[#060810] border border-[#1e293b] rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder-[#475569] focus:outline-none focus:border-brand-500 transition-all"
              />
            </div>
            <button
              onClick={() => handleAddPairToWatchlist(customPairInput)}
              disabled={!customPairInput.trim() || isAddingPair}
              className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 shadow-md shadow-brand-500/20 transition-all shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Pair</span>
            </button>
          </div>

          {/* Hot Altcoins 1-Click Recommendations */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
            <span className="text-[#64748b] flex items-center gap-1">
              <Coins className="w-3 h-3 text-cyan-400" /> Hot Altcoins:
            </span>
            {['SOLUSD', 'DOGEUSD', 'SUIUSD', 'PEPEUSD', 'XRPUSD', 'AVAXUSD', 'NEARUSD', 'TAOUSD', 'LINKUSD', 'RENDERUSD'].map(alt => {
              const isPresent = watchlist.includes(alt);
              return (
                <button
                  key={alt}
                  onClick={() => handleAddPairToWatchlist(alt)}
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono transition-all ${
                    isPresent
                      ? 'border-[#1e293b] bg-bg-secondary/40 text-[#64748b] cursor-default'
                      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                  }`}
                  title={isPresent ? 'Already in watchlist' : `Add ${alt} to scanner`}
                >
                  {isPresent ? `✓ ${alt.replace('USD', '')}` : `+ ${alt.replace('USD', '')}`}
                </button>
              );
            })}
          </div>

          {/* Active Watchlist Grid with 1-Click Select & Delete */}
          <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto pr-1">
            {watchlist
              .filter(pair => {
                if (categoryFilter === 'all') return true;
                const isCrypto = isCryptoAsset(pair);
                if (categoryFilter === 'crypto') return isCrypto;
                const isComm = pair.includes('XAU') || pair.includes('XAG') || pair.includes('OIL') || pair.includes('US30') || pair.includes('NAS') || pair.includes('SPX');
                if (categoryFilter === 'commodity') return isComm;
                if (categoryFilter === 'forex') return !isCrypto && !isComm;
                return true;
              })
              .map(pair => {
                const sInfo = checkTradingSession(pair);
                const isSelected = selectedSinglePair === pair;
                const isScanningThis = activePair === pair;

                return (
                  <div
                    key={pair}
                    onClick={() => setSelectedSinglePair(pair)}
                    className={`group px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500/20 text-brand-300 shadow-md shadow-brand-500/10'
                        : 'border-[#1e293b] bg-bg-secondary text-[#94a3b8] hover:text-white hover:border-[#334155]'
                    }`}
                  >
                    {isScanningThis ? (
                      <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                    ) : sInfo.isCrypto ? (
                      <span className="w-2 h-2 rounded-full bg-cyan-400" title="Crypto 24/7" />
                    ) : sInfo.isEligible ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400" title="Session Active" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-400/80" title="Outside Session Hours" />
                    )}
                    <span>{pair}</span>
                    {sInfo.isCrypto ? (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">24/7</span>
                    ) : sInfo.isEligible ? (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                    ) : (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Closed</span>
                    )}

                    {watchlist.length > 1 && (
                      <button
                        onClick={(e) => handleRemovePairFromWatchlist(pair, e)}
                        className="opacity-0 group-hover:opacity-100 text-[#475569] hover:text-red-400 transition-all ml-0.5 -mr-1 p-0.5 rounded hover:bg-red-500/10"
                        title={`Remove ${pair} from watchlist`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Selected Pair Session & Action Bar */}
        {(() => {
          const currSession = checkTradingSession(selectedSinglePair);
          const selectedMeta = resolveAssetMeta(selectedSinglePair);
          const isScanningThis = activePair === selectedSinglePair;

          return (
            <div className="p-3 rounded-xl bg-[#090d16] border border-[#1e293b] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white font-mono">{selectedSinglePair}</span>
                  <span className="text-[10px] font-mono text-[#475569]">•</span>
                  <span className="text-[10px] font-mono text-brand-300">{selectedMeta.name}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-bg-secondary text-[#94a3b8] border border-[#1e293b]">
                    {selectedMeta.category.toUpperCase()} • {selectedMeta.subCategory.toUpperCase()}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-[#64748b] flex items-center gap-2 flex-wrap">
                  <span>Session: <strong className="text-[#94a3b8]">{currSession.sessionName}</strong></span>
                  <span>•</span>
                  <span>Hours: <span className="text-[#94a3b8]">{currSession.activeHours}</span> (UTC: {currSession.currentUtcTime})</span>
                  {selectedMeta.isCrypto && (
                    <>
                      <span>•</span>
                      <span className="text-cyan-400 font-semibold flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> ASLM Strategy Ready
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleAnalyzePair(selectedSinglePair)}
                disabled={activePair !== null}
                className="btn w-full sm:w-auto bg-brand-500 hover:bg-brand-600 text-white text-xs font-mono font-bold py-2 px-5 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScanningThis ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Analyzing {selectedSinglePair}...</span>
                  </>
                ) : (
                  <>
                    <Scan className="w-4 h-4 text-white" />
                    <span>Analyze {selectedSinglePair} Chart</span>
                  </>
                )}
              </button>
            </div>
          );
        })()}

        {/* Sub-footer metadata */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[#1e293b]/50 text-[10px] font-mono text-[#475569]">
          <span>
            Mode:{' '}
            <strong className={tradingMode === 'fully_automatic' ? 'text-emerald-400' : 'text-[#94a3b8]'}>
              {tradingMode === 'fully_automatic' ? '⚡ MT5 AUTO-EXECUTION' : 'MANUAL ALERTS'}
            </strong>
          </span>
          <span>·</span>
          <span>Default Lot: <strong className="text-[#94a3b8]">{defaultLot}</strong></span>
          <span>·</span>
          <span>Analysis: <strong className="text-white">Single-Pair On-Demand</strong></span>
          {mt5Status?.connected && (
            <>
              <span>·</span>
              <span className="text-emerald-400 font-semibold">MT5 Synced</span>
            </>
          )}
        </div>
      </div>

      {/* Latest Generated Setup Card with One-Click MT5 Execution */}
      {latestSetup && (
        <div className="card p-4 border border-[#1e293b] bg-[#0c101d] space-y-3">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded uppercase border ${
                latestSetup.orderType?.includes('stop')
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : latestSetup.orderType?.includes('limit')
                  ? 'bg-brand-500/10 text-brand-400 border-brand-500/30'
                  : latestSetup.direction === 'long'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {latestSetup.orderType === 'market'
                  ? (latestSetup.direction === 'long' ? '▲ BUY (MARKET)' : '▼ SELL (MARKET)')
                  : latestSetup.orderType
                  ? latestSetup.orderType.toUpperCase()
                  : (latestSetup.direction === 'long' ? '▲ BUY' : '▼ SELL')}
              </span>
              <h4 className="text-sm font-bold text-white font-mono">{latestSetup.pair}</h4>
              <span className="text-[10px] font-mono text-[#64748b]">@{latestSetup.timestamp}</span>
            </div>

            <div className="flex items-center gap-2">
              {latestSetup.mt5Ticket ? (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Placed on MT5 (Ticket #{latestSetup.mt5Ticket})
                </span>
              ) : (
                <button
                  onClick={handleManualExecute}
                  disabled={isExecutingManual}
                  className="btn bg-brand-500 hover:bg-brand-600 text-white text-[11px] py-1 px-3 font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-brand-500/20"
                >
                  {isExecutingManual ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 fill-white" />
                  )}
                  ⚡ Place on MT5 Now
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1e293b]/60 text-[11px] font-mono">
            <div className="bg-bg-secondary p-2 rounded border border-[#1e293b]">
              <span className="text-[#64748b] block text-[9px]">ENTRY</span>
              <span className="text-white font-bold">{latestSetup.entryPrice}</span>
            </div>
            <div className="bg-bg-secondary p-2 rounded border border-[#1e293b]">
              <span className="text-rose-400 block text-[9px]">STOP LOSS</span>
              <span className="text-rose-300 font-bold">{latestSetup.stopLoss}</span>
            </div>
            <div className="bg-bg-secondary p-2 rounded border border-[#1e293b]">
              <span className="text-emerald-400 block text-[9px]">TAKE PROFIT</span>
              <span className="text-emerald-300 font-bold">{latestSetup.takeProfit}</span>
            </div>
            <div className="bg-bg-secondary p-2 rounded border border-[#1e293b]">
              <span className="text-[#64748b] block text-[9px]">CONFIDENCE</span>
              <span className="text-brand-400 font-bold">{latestSetup.confidence.toFixed(1)}%</span>
            </div>
          </div>

          {/* AI Brain Collaboration Adaptive Banner */}
          {latestSetup.collaboration?.active && latestSetup.collaboration.teacher_lesson && (
            <div className="p-3 rounded-xl bg-brand-500/5 border border-brand-500/20 flex items-start gap-2.5 text-[11px] font-mono">
              <div className="w-5 h-5 rounded-md bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-3.5 h-3.5 text-brand-400" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-brand-300 font-bold flex items-center gap-1.5 text-[10px]">
                    AI Brain Collaboration
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-brand-500/20 text-brand-300 uppercase">
                      {latestSetup.collaboration.brain_verdict || 'ADAPTED'}
                    </span>
                  </span>
                  <span className="text-[9px] text-[#64748b]">Learned from Loss Autopsy & Backtests</span>
                </div>
                <p className="text-[#94a3b8] text-[10px] leading-relaxed">
                  {latestSetup.collaboration.teacher_lesson}
                </p>
                {latestSetup.collaboration.student_adaptation && (
                  <p className="text-emerald-400 text-[10px] pt-1 border-t border-[#1e293b]/50">
                    ↳ <strong className="text-white">Trading AI Adaptation:</strong> {latestSetup.collaboration.student_adaptation}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Altcoin Smart Money Strategy (ASLM) Banner */}
          {latestSetup.altcoinStrategy && (
            <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex items-start gap-2.5 text-[11px] font-mono">
              <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-cyan-300 font-bold flex items-center gap-1.5 text-[10px]">
                    Altcoin Smart Money Strategy (ASLM)
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 uppercase">
                      {latestSetup.altcoinStrategy.setup_type || 'ACCUMULATION'}
                    </span>
                  </span>
                  <span className="text-[9px] text-[#64748b]">
                    BTC Compass: <strong className="text-white">{latestSetup.altcoinStrategy.btc_regime?.replace(/_/g, ' ').toUpperCase() || 'RANGING'}</strong>
                  </span>
                </div>
                {latestSetup.altcoinStrategy.key_catalyst && (
                  <p className="text-[#94a3b8] text-[10px] leading-relaxed">
                    {latestSetup.altcoinStrategy.key_catalyst}
                  </p>
                )}
                {typeof latestSetup.altcoinStrategy.relative_strength_score === 'number' && (
                  <div className="flex items-center gap-3 pt-1 border-t border-[#1e293b]/50 text-[10px]">
                    <span className={latestSetup.altcoinStrategy.relative_strength_score >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      Relative Strength: <strong>{latestSetup.altcoinStrategy.relative_strength_score > 0 ? '+' : ''}{latestSetup.altcoinStrategy.relative_strength_score.toFixed(1)}% vs BTC</strong>
                    </span>
                    {latestSetup.altcoinStrategy.liquidity_sweep_price && (
                      <span className="text-[#94a3b8]">
                        SFP Sweep Level: <strong className="text-white">{latestSetup.altcoinStrategy.liquidity_sweep_price}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
            const isSignal = log.includes('[SIGNAL') || log.includes('[MT5 EXECUTED');
            const isRejected = log.includes('[REJECTED');
            const isBrainVeto = log.includes('[AI BRAIN VETO');
            const isBrainAdvisor = log.includes('[AI BRAIN ADVISOR');
            const isCollaboration = log.includes('[AI COLLABORATION');
            const isWarn = log.includes('[WARN]') || log.includes('[LIMIT') || log.includes('[MT5 NOTICE') || log.includes('[CAPITAL SHIELD');
            const isAuto = log.includes('[AUTO') || log.includes('[MT5');
            const isWaking = log.includes('[AI ENGINE WAKING UP');
            return (
              <div key={i} className={
                isError ? 'text-red-400 font-bold' :
                isBrainVeto ? 'text-rose-400 font-bold pl-2 border-l-2 border-rose-500' :
                isBrainAdvisor ? 'text-purple-300 font-semibold pl-2 border-l-2 border-purple-500' :
                isCollaboration ? 'text-cyan-300 font-semibold pl-2 border-l-2 border-cyan-500' :
                isSignal ? 'text-emerald-400 font-bold pl-2 border-l-2 border-emerald-500' :
                isRejected ? 'text-red-300 pl-2 border-l-2 border-red-500/50' :
                isWaking ? 'text-amber-300 font-semibold' :
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
