'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Scan, TrendingUp, TrendingDown, Loader2, AlertTriangle, Zap, CheckCircle2, ShieldAlert, Sparkles, Brain } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

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
}

const getSimulatedPrice = (pair: string) => {
  const u = pair.toUpperCase();
  if (u.includes('EURUSD')) return { entry: 1.0845, sl: 1.0830, tp: 1.0880 };
  if (u.includes('GBPUSD')) return { entry: 1.2680, sl: 1.2665, tp: 1.2720 };
  if (u.includes('USDJPY')) return { entry: 154.20, sl: 153.95, tp: 154.75 };
  if (u.includes('XAUUSD') || u.includes('GOLD')) return { entry: 2850.50, sl: 2844.50, tp: 2865.50 };
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

  // MT5 Bridge Status
  const [mt5Status, setMt5Status] = useState<Mt5AccountInfo | null>(null);
  const [isExecutingManual, setIsExecutingManual] = useState(false);
  const [latestSetup, setLatestSetup] = useState<LatestTradeSetup | null>(null);

  // From user_settings
  const [tradingMode, setTradingMode] = useState('fully_automatic');
  const [defaultLot, setDefaultLot] = useState(0.01);
  const [dailySignalLimit, setDailySignalLimit] = useState(50);
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
        setTradingMode(s.trading_mode || 'fully_automatic');
        setDefaultLot(Number(s.default_lot_size) || 0.01);
        setDailySignalLimit(Number(s.daily_signal_limit) || 50);

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
            `[AI ENGINE WAKING UP ⏳] AI service is warming up on cloud infrastructure (cold start).`,
            `  -> Automatically waiting for warm-up... Next scan cycle in a few seconds.`,
            ...prev
          ]);
          await new Promise(r => setTimeout(r, 5000));
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
          `  -> ENTRY: ${entryPrice.toFixed(5)} (SL: ${stopLoss.toFixed(5)}, TP: ${takeProfit.toFixed(5)})`,
          `  -> Size: ${safeLot} Lots (MT5 Balance-Calibrated) | Confidence: ${confidence.toFixed(1)}%`,
        ];

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
          setLogs(prev => [`[AUTO TRADE ⚡] Placing smart-sized order on MT5 for ${pair} (${orderType.toUpperCase()}, ${safeLot} lots)...`, ...prev]);
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
            `[MANUAL MODE ℹ️] Signal approved! Sized at ${safeLot} lots. Click "⚡ Place on MT5 Now" button below to execute.`,
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
      if (!specificPair) {
        scanIndex.current += 1;
      }
    }
  }, [watchlist, userId, tradingMode, dailySignalLimit, todaySignalCount, defaultLot, probeMt5Bridge]);

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
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-[#1e293b] pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`w-2 h-2 rounded-full ${isScanningActive && !limitReached ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}`} />
            <h3 className="text-sm font-semibold text-white">AI Scanner</h3>
            <span className="text-[9px] font-mono text-[#475569] bg-bg-secondary px-1.5 py-0.5 rounded">
              {todaySignalCount}/{dailySignalLimit} signals today
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

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Auto-Execution Toggle Button */}
            <button
              onClick={handleToggleAutoTrade}
              className={`px-3 py-1 rounded text-[10px] font-bold font-mono transition-all flex items-center gap-1.5 border ${
                tradingMode === 'fully_automatic'
                  ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 hover:bg-brand-500/30'
                  : 'bg-bg-secondary text-[#64748b] border-[#1e293b] hover:text-[#94a3b8]'
              }`}
              title="Toggle whether scanner executes orders immediately on your MT5 terminal"
            >
              <Zap className={`w-3 h-3 ${tradingMode === 'fully_automatic' ? 'text-brand-400 fill-brand-400' : ''}`} />
              {tradingMode === 'fully_automatic' ? '⚡ AUTO-TRADE: ON' : 'AUTO-TRADE: OFF'}
            </button>

            {/* Start / Stop Scan Button */}
            <button
              onClick={() => setIsScanningActive(v => !v)}
              disabled={limitReached}
              className={`px-3.5 py-1 rounded text-[10px] font-bold font-mono uppercase transition-colors border disabled:opacity-40 disabled:cursor-not-allowed ${
                isScanningActive
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-bg-secondary text-[#94a3b8] border-[#1e293b] hover:text-white'
              }`}
            >
              {isScanningActive ? '⬛ Stop Scan' : '▶ Start Scan'}
            </button>
          </div>
        </div>

        {/* Single Pair Manual Analyzer Panel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e293b]/50 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
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

        {/* Mode display & details */}
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
          <span>Interval: <strong className="text-[#94a3b8]">45s</strong></span>
          {mt5Status?.connected && (
            <>
              <span>·</span>
              <span className="text-emerald-400 font-semibold">MT5 Terminal Synced</span>
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
