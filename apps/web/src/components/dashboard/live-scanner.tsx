'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { 
  Scan, Sparkles, TrendingUp, TrendingDown, Play, Square, 
  Plus, Trash2, AlertTriangle, Loader2, CheckCircle, FileSpreadsheet,
  Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SUPPORTED_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AUDUSD', 'USDCAD', 'EURGBP', 'GBPJPY'];

export default function LiveScannerWidget() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [activePair, setActivePair] = useState<string | null>(null);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [logs, setLogs] = useState<string[]>(['Scanner initialized. Add watchlist assets to scan.']);
  const [newPair, setNewPair] = useState('EURUSD');
  const [isScanningActive, setIsScanningActive] = useState(true);
  const [loading, setLoading] = useState(true);
  
  // Settings for auto-trading
  const [tradingMode, setTradingMode] = useState('manual');
  const [defaultLot, setDefaultLot] = useState(0.01);
  const [userId, setUserId] = useState<string | null>(null);

  // Manual Trade Logging Form State
  const [showLogForm, setShowLogForm] = useState(false);
  const [logPair, setLogPair] = useState('EURUSD');
  const [logDirection, setLogDirection] = useState<'long' | 'short'>('long');
  const [logPnl, setLogPnl] = useState<string>('50.00');
  const [logLot, setLogLot] = useState<string>('0.1');
  const [isLogging, setIsLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState('');

  // Balance Adjuster State
  const [showBalanceForm, setShowBalanceForm] = useState(false);
  const [newBalance, setNewBalance] = useState<string>('10000.00');
  const [updatingBalance, setUpdatingBalance] = useState(false);

  const scanIndex = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load configuration
  useEffect(() => {
    const saved = localStorage.getItem('trade_z_watchlist');
    if (saved) {
      setWatchlist(JSON.parse(saved));
    } else {
      const defaultWatch = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
      setWatchlist(defaultWatch);
      localStorage.setItem('trade_z_watchlist', JSON.stringify(defaultWatch));
    }

    async function loadConfig() {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          if (settings) {
            setTradingMode(settings.trading_mode || 'manual');
            setDefaultLot(Number(settings.default_lot_size) || 0.01);
            setLogLot((Number(settings.default_lot_size) || 0.01).toString());
          }
        }
      } catch (err) {
        console.error('Error fetching user config inside scanner:', err);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  // Sync watchlist to storage
  const saveWatchlist = (updated: string[]) => {
    setWatchlist(updated);
    localStorage.setItem('trade_z_watchlist', JSON.stringify(updated));
  };

  const handleAddPair = () => {
    if (watchlist.includes(newPair)) return;
    const updated = [...watchlist, newPair];
    saveWatchlist(updated);
    setLogs(prev => [`Added ${newPair} to your active watchlist.`, ...prev]);
  };

  const handleRemovePair = (pair: string) => {
    const updated = watchlist.filter(p => p !== pair);
    saveWatchlist(updated);
    setLogs(prev => [`Removed ${pair} from watchlist.`, ...prev]);
  };

  // Helper price simulator
  const getSimulatedPrice = (pair: string) => {
    const u = pair.toUpperCase();
    if (u.includes('EURUSD')) return { entry: 1.0845, sl: 1.0815, tp: 1.0905 };
    if (u.includes('GBPUSD')) return { entry: 1.2680, sl: 1.2640, tp: 1.2760 };
    if (u.includes('USDJPY')) return { entry: 154.20, sl: 154.80, tp: 153.00 };
    if (u.includes('XAUUSD')) return { entry: 2350.50, sl: 2340.00, tp: 2371.50 };
    if (u.includes('AUDUSD')) return { entry: 0.6650, sl: 0.6620, tp: 0.6710 };
    if (u.includes('USDCAD')) return { entry: 1.3620, sl: 1.3660, tp: 1.3540 };
    return { entry: 1.0000, sl: 0.9970, tp: 1.0060 };
  };

  // The main scanning execution sequence
  const runSingleScan = async () => {
    if (watchlist.length === 0 || !userId) return;

    // Pick next pair sequentially
    if (scanIndex.current >= watchlist.length) {
      scanIndex.current = 0;
    }
    const pair = watchlist[scanIndex.current];
    setActivePair(pair);
    setScanState('scanning');
    setLogs(prev => [`[SCANNING] Requesting AI market structure analysis for ${pair}...`, ...prev]);

    try {
      // Query analysis via NestJS gateway proxy
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiBase}/api/v1/chat/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair, timeframe: '4h' }),
      });

      if (res.ok) {
        const body = await res.json();
        const info = body?.data;

        if (info) {
          const decision = info.decision; // 'approve', 'reject', 'wait'
          const confidence = Number(info.confidence) || 75.0;
          const reasoning = info.reasoning || '';
          
          const isApproved = decision === 'approve';
          const direction = reasoning.toLowerCase().includes('sell') || reasoning.toLowerCase().includes('short') ? 'short' : 'long';
          const priceInfo = getSimulatedPrice(pair);

          // Write Signal to Supabase via NestJS proxy API (bypasses client-side RLS)
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          const sigRes = await fetch(`${apiBase}/api/v1/trades/signals`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              pair,
              direction,
              status: isApproved ? 'active' : 'rejected',
              entry_price: priceInfo.entry,
              stop_loss: priceInfo.sl,
              take_profit: priceInfo.tp,
              confidence,
              ai_reasoning: reasoning,
              timeframe: '4h',
              strategy: 'AI Confluence Flow',
              tags: isApproved ? ['bullish_breakout', 'h4_orderblock'] : ['insufficient_momentum']
            })
          });

          if (!sigRes.ok) {
            throw new Error(`Gateway failed to save signal: ${sigRes.statusText}`);
          }

          if (isApproved) {
            setLogs(prev => [
              `[SIGNAL GENERATED] 🟢 Approved ${pair} ${direction.toUpperCase()} setup! Confidence: ${confidence}%. SL: ${priceInfo.sl}, TP: ${priceInfo.tp}`,
              ...prev
            ]);

            // AUTONOMOUS EXECUTION FLOW
            if (tradingMode === 'fully_automatic') {
              setLogs(prev => [`[AUTO TRADING] Autonomous execution triggered for ${pair}...`, ...prev]);
              
              // Place paper/live trade via NestJS API
              const tradeRes = await fetch(`${apiBase}/api/v1/trades`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  pair,
                  direction,
                  entryPrice: priceInfo.entry,
                  stopLoss: priceInfo.sl,
                  takeProfit: priceInfo.tp,
                  riskPercent: 1.0
                })
              });

              if (tradeRes.ok) {
                setLogs(prev => [`[AUTO TRADING] Successfully placed live position for ${pair}!`, ...prev]);
              } else {
                const errBody = await tradeRes.json();
                setLogs(prev => [`[AUTO TRADING] Auto execution failed: ${errBody?.message || tradeRes.statusText}`, ...prev]);
              }
            }
          } else {
            setLogs(prev => [
              `[REJECTED SETUP] 🔴 Rejected ${pair} confluence. Confidence: ${confidence}%. Reasoning: ${reasoning.slice(0, 80)}...`,
              ...prev
            ]);
          }
        }
      } else {
        setLogs(prev => [`[ERROR] Scanner gateway returned error status ${res.status}.`, ...prev]);
      }
    } catch (err: any) {
      console.error('Error running scanner execution loop:', err);
      setLogs(prev => [`[EXCEPTION] Scanner connection issue: ${err.message}`, ...prev]);
    } finally {
      setScanState('complete');
      scanIndex.current += 1;
    }
  };

  // Start background scanner loop
  useEffect(() => {
    if (isScanningActive && watchlist.length > 0 && userId) {
      // initial scan
      runSingleScan();
      
      intervalRef.current = setInterval(() => {
        runSingleScan();
      }, 45000); // scan next pair every 45 seconds
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isScanningActive, watchlist, tradingMode, defaultLot, userId]);

  // Log Trade manually
  const handleLogTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setIsLogging(true);
    setLogSuccess('');

    const supabase = createClient();
    const netPnl = parseFloat(logPnl);
    const size = parseFloat(logLot);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Log trade via NestJS proxy (bypasses RLS and safely updates portfolio in single transaction)
      const res = await fetch(`${apiBase}/api/v1/trades/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pair: logPair,
          direction: logDirection,
          lotSize: size,
          pnl: netPnl
        })
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody?.message || `Gateway error: ${res.statusText}`);
      }

      setLogSuccess('Trade logged successfully & account balance updated!');
      setLogs(prev => [`[MANUAL LOG] Logged ${logPair} closed trade result of $${netPnl.toFixed(2)}.`, ...prev]);
      
      // Reset
      setTimeout(() => {
        setShowLogForm(false);
        setLogSuccess('');
      }, 2500);

    } catch (err: any) {
      console.error('Error logging trade:', err);
      setLogSuccess(`Error: ${err.message}`);
    } finally {
      setIsLogging(false);
    }
  };

  // Adjust Account Balance manually
  const handleUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setUpdatingBalance(true);
    setLogSuccess('');

    const supabase = createClient();
    const balanceVal = parseFloat(newBalance);

    try {
      const { data: port } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .maybeSingle();

      if (port) {
        const { error } = await supabase
          .from('portfolios')
          .update({
            balance: balanceVal,
            equity: balanceVal,
            free_margin: balanceVal,
            today_pnl: 0.00,
            updated_at: new Date().toISOString()
          })
          .eq('id', port.id);

        if (error) throw error;
        
        setLogSuccess('Account balance configured!');
        setLogs(prev => [`[ACCOUNT CONFIG] Modified total starting balance parameter to $${balanceVal.toLocaleString()}.`, ...prev]);
        
        setTimeout(() => {
          setShowBalanceForm(false);
          setLogSuccess('');
        }, 2000);
      }
    } catch (err: any) {
      console.error('Error updating balance:', err);
      setLogSuccess(`Error: ${err.message}`);
    } finally {
      setUpdatingBalance(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Watchlist and Controller Panel */}
      <div className="card p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-[#1e293b] pb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isScanningActive ? 'bg-emerald-500 animate-ping' : 'bg-red-500'}`} />
            <h3 className="text-sm font-semibold text-white">Scanner Watchlist</h3>
          </div>
          <button 
            onClick={() => setIsScanningActive(!isScanningActive)}
            className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-colors uppercase ${
              isScanningActive 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' 
                : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
            }`}
          >
            {isScanningActive ? 'Scanning: Active' : 'Scanning: Paused'}
          </button>
        </div>

        {/* Watchlist tags */}
        <div className="flex flex-wrap gap-2">
          {watchlist.map(pair => (
            <div 
              key={pair} 
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold font-mono flex items-center gap-2 transition-all ${
                activePair === pair && scanState === 'scanning'
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                  : 'border-[#1e293b] bg-bg-secondary text-white'
              }`}
            >
              <span>{pair}</span>
              <button 
                onClick={() => handleRemovePair(pair)}
                className="text-[#64748b] hover:text-red-400 transition-colors"
                title="Remove from watchlist"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add pair dropdown row */}
        <div className="flex gap-2">
          <select 
            value={newPair} 
            onChange={(e) => setNewPair(e.target.value)}
            className="input text-xs font-mono select-dark flex-1"
          >
            {SUPPORTED_PAIRS.map(pair => (
              <option key={pair} value={pair}>{pair}</option>
            ))}
          </select>
          <button 
            onClick={handleAddPair}
            className="btn btn-primary px-3 text-xs flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Watch
          </button>
        </div>

        {/* Quick Tools Row (Log trades / Set balance) */}
        <div className="grid grid-cols-2 gap-3 border-t border-[#1e293b]/70 pt-3">
          <button 
            onClick={() => { setShowLogForm(!showLogForm); setShowBalanceForm(false); }}
            className="btn bg-bg-secondary hover:bg-bg-hover text-xs font-mono py-2 flex items-center justify-center gap-1.5 border border-[#1e293b]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-brand-400" />
            Log Manual Trade
          </button>
          <button 
            onClick={() => { setShowBalanceForm(!showBalanceForm); setShowLogForm(false); }}
            className="btn bg-bg-secondary hover:bg-bg-hover text-xs font-mono py-2 flex items-center justify-center gap-1.5 border border-[#1e293b]"
          >
            <Wallet className="w-3.5 h-3.5 text-brand-400" />
            Set Account Balance
          </button>
        </div>

        {/* Manual Trade Logging Form */}
        <AnimatePresence>
          {showLogForm && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleLogTrade}
              className="bg-bg-secondary/40 p-4 rounded-xl border border-[#1e293b] space-y-3.5 text-xs overflow-hidden"
            >
              <h4 className="font-semibold text-white font-mono text-[11px] uppercase tracking-wide">Journal Manual Trade Result</h4>
              
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block text-[#94a3b8] mb-1 uppercase text-[9px]">Pair</label>
                  <select 
                    value={logPair} 
                    onChange={(e) => setLogPair(e.target.value)}
                    className="input text-xs select-dark"
                  >
                    {watchlist.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#94a3b8] mb-1 uppercase text-[9px]">Direction</label>
                  <select 
                    value={logDirection} 
                    onChange={(e) => setLogDirection(e.target.value as 'long' | 'short')}
                    className="input text-xs select-dark"
                  >
                    <option value="long">BUY (LONG)</option>
                    <option value="short">SELL (SHORT)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block text-[#94a3b8] mb-1 uppercase text-[9px]">Lot Size</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={logLot}
                    onChange={(e) => setLogLot(e.target.value)}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[#94a3b8] mb-1 uppercase text-[9px]">Profit / Loss ($)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="e.g. +150.00 or -45.00"
                    value={logPnl}
                    onChange={(e) => setLogPnl(e.target.value)}
                    className="input text-xs text-white"
                    required
                  />
                </div>
              </div>

              {logSuccess && (
                <p className={`text-[10px] font-bold font-mono ${logSuccess.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {logSuccess}
                </p>
              )}

              <button 
                type="submit" 
                disabled={isLogging} 
                className="btn btn-primary w-full text-xs font-mono py-2"
              >
                {isLogging ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Confirm Log Trade'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Set Balance Form */}
        <AnimatePresence>
          {showBalanceForm && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleUpdateBalance}
              className="bg-bg-secondary/40 p-4 rounded-xl border border-[#1e293b] space-y-3 text-xs overflow-hidden"
            >
              <h4 className="font-semibold text-white font-mono text-[11px] uppercase tracking-wide">Configure Starting Balance</h4>
              
              <div>
                <label className="block text-[#94a3b8] mb-1 uppercase text-[9px] font-mono">Account Balance (USD)</label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="10000.00"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="input font-mono text-xs"
                  required
                />
              </div>

              {logSuccess && (
                <p className={`text-[10px] font-bold font-mono ${logSuccess.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {logSuccess}
                </p>
              )}

              <button 
                type="submit" 
                disabled={updatingBalance} 
                className="btn btn-primary w-full text-xs font-mono py-2"
              >
                {updatingBalance ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Update Core Balance'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      {/* Live AI Scanning Log Terminal */}
      <div className="card p-5 space-y-3">
        <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Scan className="w-4 h-4 text-brand-400 animate-pulse" />
            AI Scanner Engine
          </h3>
          <span className="text-[9px] text-[#64748b] font-mono">Loop frequency: 45s</span>
        </div>

        <div className="bg-[#0b0f19] p-3 rounded-lg border border-[#1e293b] h-[160px] overflow-y-auto font-mono text-[10px] leading-relaxed space-y-1.5 no-scrollbar text-emerald-400">
          {logs.map((log, index) => {
            const isError = log.includes('[ERROR]') || log.includes('[EXCEPTION]');
            const isSignal = log.includes('[SIGNAL GENERATED]');
            const isScanning = log.includes('[SCANNING]');
            
            return (
              <div 
                key={index} 
                className={
                  isError 
                    ? 'text-red-400 font-bold' 
                    : isSignal 
                    ? 'text-brand-400 font-extrabold border-l-2 border-brand-500 pl-1.5 bg-brand-500/5 py-0.5 rounded' 
                    : isScanning 
                    ? 'text-zinc-400' 
                    : 'text-emerald-500/80'
                }
              >
                {log}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
