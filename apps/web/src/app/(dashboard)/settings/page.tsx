'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import {
  User, Shield, Key, Loader2, Plus, Trash2,
  FileSpreadsheet, Wallet, BellRing, ListChecks,
  CheckCircle2, AlertTriangle, Laptop, Terminal, RefreshCw, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/api';
import { CURATED_ASSETS, CATEGORIZED_ASSETS, SUPPORTED_PAIRS, normalizePairSymbol, isCryptoAsset, AssetDefinition } from '@/lib/assets-registry';
import { mt5Fetch } from '@/lib/mt5-client';

// ─── small reusable section card ───────────────────────────────────────────
function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-[#1e293b] pb-3">
        <Icon className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SaveMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg.toLowerCase().includes('success') || msg.toLowerCase().includes('saved') || msg.toLowerCase().includes('logged') || msg.toLowerCase().includes('updated') || msg.toLowerCase().includes('configured');
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={`text-[10px] font-semibold font-mono flex items-center gap-1 ${ok ? 'text-emerald-400' : 'text-red-400'}`}
    >
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {msg}
    </motion.p>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Profile ─────────────────────────────────────────────
  const [profileName, setProfileName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [msgProfile, setMsgProfile] = useState('');

  // ── Trading settings ─────────────────────────────────────
  const [mode, setMode] = useState('manual');
  const [lotSize, setLotSize] = useState(0.01);
  const [riskReward, setRiskReward] = useState(2.0);
  const [maxLoss, setMaxLoss] = useState(5.0);
  const [dailySignalLimit, setDailySignalLimit] = useState(2);
  const [savingSettings, setSavingSettings] = useState(false);
  const [msgSettings, setMsgSettings] = useState('');

  // ── Watchlist ────────────────────────────────────────────
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newPair, setNewPair] = useState('BTCUSD');
  const [customPairText, setCustomPairText] = useState('');
  const [savingWatch, setSavingWatch] = useState(false);
  const [msgWatch, setMsgWatch] = useState('');

  // ── Journal / Manual Trade Log ───────────────────────────
  const [logPair, setLogPair] = useState('EURUSD');
  const [logDirection, setLogDirection] = useState<'long' | 'short'>('long');
  const [logLot, setLogLot] = useState('0.1');
  const [logPnl, setLogPnl] = useState('50.00');
  const [isLogging, setIsLogging] = useState(false);
  const [msgLog, setMsgLog] = useState('');

  // ── Account Balance ──────────────────────────────────────
  const [newBalance, setNewBalance] = useState('10000.00');
  const [savingBalance, setSavingBalance] = useState(false);
  const [msgBalance, setMsgBalance] = useState('');

  const [apiKey, setApiKey] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);
  const [msgKeys, setMsgKeys] = useState('');

  // ── MetaTrader 5 (MT5) Desktop & Cloud VPS Bridge ──────────────────
  const [mt5Status, setMt5Status] = useState<{
    loading: boolean;
    connected: boolean;
    account?: any;
    error?: string;
  }>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('tradez_bridge_connected') === 'true') {
      return { loading: false, connected: true };
    }
    return { loading: false, connected: false };
  });

  const [vpsBridgeUrl, setVpsBridgeUrl] = useState<string>('');
  const [msgVpsUrl, setMsgVpsUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVpsBridgeUrl(localStorage.getItem('tradez_vps_bridge_url') || '');
    }
  }, []);

  const handleSaveVpsUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('tradez_vps_bridge_url', vpsBridgeUrl.trim());
      setMsgVpsUrl('Cloud VPS Bridge URL saved! Testing connection...');
      setTimeout(() => setMsgVpsUrl(''), 4000);
      checkMt5Connection();
    }
  };

  const checkMt5Connection = useCallback(async () => {
    setMt5Status(prev => ({ ...prev, loading: true }));
    try {
      const data = await mt5Fetch('/account');
      if (data && (data.connected || data.account)) {
        const acc = data.account || data;
        setMt5Status({
          loading: false,
          connected: true,
          account: acc,
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem('tradez_bridge_connected', 'true');
        }
        if (acc?.balance) {
          setNewBalance(Number(acc.balance).toFixed(2));
        }
        return;
      }
      setMt5Status({
        loading: false,
        connected: false,
        error: data?.error || 'Cannot reach MT5 Bridge. Ensure start_mt5_bridge.bat is running on your VPS or laptop.',
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('tradez_bridge_connected', 'false');
      }
    } catch (e: any) {
      setMt5Status({
        loading: false,
        connected: false,
        error: e.message || 'Cannot reach MT5 Bridge.',
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('tradez_bridge_connected', 'false');
      }
    }
  }, []);

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSavingKeys(true); setMsgKeys('');
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ twelve_data_api_key: apiKey })
        .eq('user_id', userId);
      if (error) throw error;
      setMsgKeys('Broker API integrations synced successfully!');
    } catch (err: any) {
      setMsgKeys(`Failed to sync: ${err.message}`);
    } finally {
      setSavingKeys(false);
    }
  };

  // ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email || '');

      // Profile
      const { data: profile } = await supabase
        .from('user_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (profile) setProfileName(profile.display_name || '');

      // Settings
      const { data: s } = await supabase
        .from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (s) {
        setMode(s.trading_mode || 'manual');
        setLotSize(Number(s.default_lot_size) || 0.01);
        setRiskReward(Number(s.default_risk_per_trade) || 2.0);
        setMaxLoss(Number(s.max_daily_loss) || 5.0);
        setDailySignalLimit(Number(s.daily_signal_limit) || 2);
        setApiKey(s.twelve_data_api_key || '');
        const cryptoPairs = ['BTCUSD', 'ETHUSD', 'SOLUSD'];
        if (Array.isArray(s.watchlist) && s.watchlist.length > 0) {
          const merged = Array.from(new Set([...s.watchlist, ...cryptoPairs]));
          setWatchlist(merged);
          setLogPair(merged[0]);
        } else {
          const def = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', ...cryptoPairs];
          setWatchlist(def);
          setLogPair(def[0]);
        }
      } else {
        // Auto-create defaults
        const def = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD'];
        await supabase.from('user_settings').upsert({
          user_id: user.id,
          trading_mode: 'manual',
          default_lot_size: 0.01,
          default_risk_per_trade: 2.00,
          max_daily_loss: 5.00,
          max_open_trades: 5,
          daily_signal_limit: 2,
          watchlist: def,
        }, { onConflict: 'user_id' });
        setWatchlist(def);
      }

      // Portfolio balance
      const { data: port } = await supabase
        .from('portfolios').select('balance').eq('user_id', user.id).eq('is_default', true).maybeSingle();
      if (port) setNewBalance(Number(port.balance).toFixed(2));

    } catch (err) {
      console.error('Settings load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    checkMt5Connection();
  }, [loadData, checkMt5Connection]);

  // ── Profile save ─────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true); setMsgProfile('');
    const supabase = createClient();
    try {
      const { error } = await supabase.from('user_profiles')
        .update({ display_name: profileName, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      setMsgProfile('Profile updated successfully!');
    } catch (err: any) { setMsgProfile(`Error: ${err.message}`); }
    finally { setSavingProfile(false); setTimeout(() => setMsgProfile(''), 4000); }
  };

  // ── Trading settings save ────────────────────────────────
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true); setMsgSettings('');
    const supabase = createClient();
    try {
      const { error } = await supabase.from('user_settings')
        .update({
          trading_mode: mode,
          default_lot_size: lotSize,
          default_risk_per_trade: riskReward,
          max_daily_loss: maxLoss,
          daily_signal_limit: 2,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      if (error) throw error;
      setMsgSettings('Trading rules saved!');
    } catch (err: any) { setMsgSettings(`Error: ${err.message}`); }
    finally { setSavingSettings(false); setTimeout(() => setMsgSettings(''), 4000); }
  };

  // ── Watchlist save ───────────────────────────────────────
  const saveWatchlist = async (updated: string[]) => {
    setWatchlist(updated);
    setSavingWatch(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.from('user_settings')
        .update({ watchlist: updated, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      setMsgWatch('Watchlist saved!');
    } catch (err: any) { setMsgWatch(`Error: ${err.message}`); }
    finally { setSavingWatch(false); setTimeout(() => setMsgWatch(''), 3000); }
  };

  const handleAddPair = (pairToAdd?: string) => {
    const raw = pairToAdd || customPairText || newPair;
    if (!raw || !raw.trim()) return;
    const normalized = normalizePairSymbol(raw);
    if (!normalized) return;
    if (watchlist.includes(normalized)) {
      setMsgWatch(`${normalized} already in watchlist.`);
      return;
    }
    saveWatchlist([...watchlist, normalized]);
    setCustomPairText('');
  };

  const handleRemovePair = (pair: string) => {
    saveWatchlist(watchlist.filter(p => p !== pair));
  };

  // ── Journal trade log ────────────────────────────────────
  const handleLogTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setIsLogging(true); setMsgLog('');
    const supabase = createClient();
    try {
      const apiBase = getApiBaseUrl();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiBase}/api/v1/trades/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pair: logPair, direction: logDirection, lotSize: parseFloat(logLot), pnl: parseFloat(logPnl) }),
      });

      if (!res.ok) { const e = await res.json(); throw new Error(e?.message || res.statusText); }
      setMsgLog(`Trade logged! ${logDirection === 'long' ? '▲' : '▼'} ${logPair} · P&L: $${parseFloat(logPnl).toFixed(2)}`);
      setLogPnl('0.00');
    } catch (err: any) { setMsgLog(`Error: ${err.message}`); }
    finally { setIsLogging(false); setTimeout(() => setMsgLog(''), 5000); }
  };

  // ── Balance update ───────────────────────────────────────
  const handleUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSavingBalance(true); setMsgBalance('');
    const supabase = createClient();
    try {
      const balanceVal = parseFloat(newBalance);
      const { data: port } = await supabase
        .from('portfolios').select('id').eq('user_id', userId).eq('is_default', true).maybeSingle();
      if (!port) throw new Error('No default portfolio found. Please reload the dashboard first.');

      const { error } = await supabase.from('portfolios')
        .update({ balance: balanceVal, equity: balanceVal, free_margin: balanceVal, today_pnl: 0, updated_at: new Date().toISOString() })
        .eq('id', port.id);
      if (error) throw error;
      setMsgBalance(`Account balance set to $${balanceVal.toLocaleString()}`);
    } catch (err: any) { setMsgBalance(`Error: ${err.message}`); }
    finally { setSavingBalance(false); setTimeout(() => setMsgBalance(''), 5000); }
  };

  // ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center p-24 text-xs font-mono text-[#64748b] gap-2">
      <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Syncing configuration...
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Settings & Configuration</h1>
        <p className="text-xs text-[#64748b] mt-1 font-mono">
          PROFILE · WATCHLIST · JOURNAL · RISK POLICIES · SIGNAL LIMITS
        </p>
      </div>

      {/* ── Row 1: Profile + Trading Rules ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Profile */}
        <Section icon={User} title="Profile Details">
          <form className="space-y-4 text-xs" onSubmit={handleSaveProfile}>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Display Name</label>
              <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                className="input text-xs" placeholder="Chief Trader" required />
            </div>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Email</label>
              <input type="email" value={email} disabled className="input opacity-50 cursor-not-allowed text-xs" />
            </div>
            <SaveMsg msg={msgProfile} />
            <button type="submit" disabled={savingProfile} className="btn btn-primary w-full text-xs">
              {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Update Profile'}
            </button>
          </form>
        </Section>

        {/* Trading Rules */}
        <Section icon={Shield} title="Risk & Automation Rules">
          <form className="space-y-4 text-xs" onSubmit={handleSaveSettings}>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Trading Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value)} className="input font-mono text-xs select-dark">
                <option value="manual">MANUAL EXECUTION</option>
                <option value="semi_automatic">SEMI AUTOMATIC (ONE-TAP)</option>
                <option value="fully_automatic">FULLY AUTOMATIC (AUTONOMOUS)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Default Lot Size</label>
                <input type="number" step="0.01" min="0.01" max="10.0" value={lotSize}
                  onChange={e => setLotSize(Number(e.target.value))} className="input font-mono text-xs" />
              </div>
              <div>
                <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Target R:R</label>
                <input type="number" step="0.1" min="1.0" value={riskReward}
                  onChange={e => setRiskReward(Number(e.target.value))} className="input font-mono text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Max Daily Loss (%)</label>
                <input type="number" step="0.5" min="0.5" value={maxLoss}
                  onChange={e => setMaxLoss(Number(e.target.value))} className="input font-mono text-xs" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[#94a3b8] font-mono uppercase text-[10px]">
                    Daily Trade Limit
                  </label>
                  <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    DISCIPLINE LOCKED
                  </span>
                </div>
                <div className="input font-mono text-xs bg-bg-secondary/40 border-[#1e293b] text-white flex items-center justify-between cursor-not-allowed opacity-90">
                  <span>2 Trades / Day</span>
                  <span className="text-[10px] text-brand-400 font-bold">MAX</span>
                </div>
                <p className="text-[9px] text-[#64748b] font-mono mt-1 leading-tight">
                  Enforced by Institutional Shield to eliminate greed and revenge trading. Manual reset is permanently disabled.
                </p>
              </div>
            </div>
            <SaveMsg msg={msgSettings} />
            <button type="submit" disabled={savingSettings} className="btn btn-primary w-full text-xs">
              {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Save Rules'}
            </button>
          </form>
        </Section>
      </div>

      {/* ── Row 2: Watchlist + Account Balance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Watchlist */}
        <Section icon={ListChecks} title="Scanner Watchlist">
          <p className="text-[10px] text-[#64748b] font-mono -mt-1">
            These pairs are scanned by the AI engine on the dashboard.
          </p>

          {/* Active pairs */}
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {watchlist.length === 0 && (
              <span className="text-[10px] text-[#475569] font-mono">No pairs added yet.</span>
            )}
            {watchlist.map(pair => (
              <div key={pair}
                className="px-2.5 py-1.5 rounded-lg border border-[#1e293b] bg-bg-secondary text-xs font-semibold font-mono flex items-center gap-2 text-white">
                {pair}
                <button onClick={() => handleRemovePair(pair)} title="Remove"
                  className="text-[#475569] hover:text-red-400 transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Quick type ANY altcoin or pair */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type ANY altcoin (e.g. PEPE, SUI, AVAX, BERA)..."
                value={customPairText}
                onChange={e => setCustomPairText(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPair();
                  }
                }}
                className="input text-xs font-mono flex-1 placeholder-[#475569]"
              />
              <button
                type="button"
                onClick={() => handleAddPair()}
                disabled={savingWatch || !customPairText.trim()}
                className="btn btn-primary px-3 text-xs flex items-center gap-1 shrink-0 disabled:opacity-40"
              >
                {savingWatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-4 h-4" /> Add Custom</>}
              </button>
            </div>

            {/* Curated Catalog Select */}
            <div className="flex gap-2">
              <select
                value={newPair}
                onChange={e => setNewPair(e.target.value)}
                className="input text-xs font-mono select-dark flex-1"
              >
                <optgroup label="🪙 Crypto — Layer 1 & 2">
                  {CATEGORIZED_ASSETS.crypto_l1_l2.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="🤖 Crypto — AI & DePIN">
                  {CATEGORIZED_ASSETS.crypto_ai_depin.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="🏦 Crypto — DeFi">
                  {CATEGORIZED_ASSETS.crypto_defi.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="🐕 Crypto — Memecoins">
                  {CATEGORIZED_ASSETS.crypto_memes.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="💱 Major Forex">
                  {CATEGORIZED_ASSETS.forex_majors.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="💱 Minor & Cross Forex">
                  {CATEGORIZED_ASSETS.forex_crosses.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="🏆 Commodities & Metals">
                  {CATEGORIZED_ASSETS.commodities.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="📈 Major Indices">
                  {CATEGORIZED_ASSETS.indices.filter((p: AssetDefinition) => !watchlist.includes(p.symbol)).map((p: AssetDefinition) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>
                  ))}
                </optgroup>
              </select>
              <button
                type="button"
                onClick={() => handleAddPair(newPair)}
                disabled={savingWatch}
                className="btn bg-bg-secondary hover:bg-[#1e293b] border border-[#1e293b] text-white px-3 text-xs flex items-center gap-1 shrink-0"
              >
                {savingWatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-4 h-4" /> Add Selected</>}
              </button>
            </div>

            {/* Quick-add recommendations */}
            <div className="flex items-center gap-1 flex-wrap pt-1 text-[9px] font-mono">
              <span className="text-[#64748b]">Quick:</span>
              {['SOLUSD', 'DOGEUSD', 'SUIUSD', 'PEPEUSD', 'TAOUSD', 'XRPUSD', 'AVAXUSD'].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleAddPair(p)}
                  className={`px-1.5 py-0.5 rounded border transition-all ${
                    watchlist.includes(p)
                      ? 'border-[#1e293b] text-[#475569] cursor-default'
                      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                  }`}
                  disabled={watchlist.includes(p)}
                >
                  {watchlist.includes(p) ? `✓ ${p.replace('USD', '')}` : `+ ${p.replace('USD', '')}`}
                </button>
              ))}
            </div>
          </div>
          <SaveMsg msg={msgWatch} />
        </Section>

        {/* Account Balance */}
        <Section icon={Wallet} title="Account Balance">
          <p className="text-[10px] text-[#64748b] font-mono -mt-1">
            Set your real starting balance so the AI tracks your actual equity and expected lot sizing.
          </p>
          <form className="space-y-4 text-xs" onSubmit={handleUpdateBalance}>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Account Balance (USD)</label>
              <input type="number" step="0.01" min="1" placeholder="10000.00" value={newBalance}
                onChange={e => setNewBalance(e.target.value)} className="input font-mono text-xs" required />
            </div>
            <SaveMsg msg={msgBalance} />
            <button type="submit" disabled={savingBalance} className="btn btn-primary w-full text-xs">
              {savingBalance ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Update Core Balance'}
            </button>
          </form>
        </Section>
      </div>

      {/* ── Row 3: Trade Journal + API Keys ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Manual Trade Journal */}
        <Section icon={FileSpreadsheet} title="Journal Manual Trade">
          <p className="text-[10px] text-[#64748b] font-mono -mt-1">
            Log trades you placed manually in your broker so the system can track your P&amp;L.
          </p>
          <form className="space-y-4 text-xs" onSubmit={handleLogTrade}>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <label className="block text-[#94a3b8] mb-1.5 uppercase text-[10px]">Pair</label>
                <select value={logPair} onChange={e => setLogPair(e.target.value)} className="input text-xs select-dark">
                  {(watchlist.length > 0 ? watchlist : SUPPORTED_PAIRS).map((p: string) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#94a3b8] mb-1.5 uppercase text-[10px]">Direction</label>
                <select value={logDirection} onChange={e => setLogDirection(e.target.value as 'long' | 'short')}
                  className="input text-xs select-dark">
                  <option value="long">▲ BUY (LONG)</option>
                  <option value="short">▼ SELL (SHORT)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <label className="block text-[#94a3b8] mb-1.5 uppercase text-[10px]">Lot Size</label>
                <input type="number" step="0.01" min="0.01" value={logLot}
                  onChange={e => setLogLot(e.target.value)} className="input text-xs" required />
              </div>
              <div>
                <label className="block text-[#94a3b8] mb-1.5 uppercase text-[10px]">Profit / Loss ($)</label>
                <input type="number" step="0.01" placeholder="+150.00 or -45.00" value={logPnl}
                  onChange={e => setLogPnl(e.target.value)} className="input text-xs" required />
              </div>
            </div>
            <SaveMsg msg={msgLog} />
            <button type="submit" disabled={isLogging} className="btn btn-primary w-full text-xs">
              {isLogging ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Confirm & Log Trade'}
            </button>
          </form>
        </Section>

        {/* MetaTrader 5 (MT5) Desktop Bridge */}
        <Section icon={Laptop} title="MetaTrader 5 (MT5) Desktop Bridge">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[#64748b] font-mono">
              Auto-execute AI scanner signals directly on your local MetaTrader 5 terminal.
            </p>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold flex items-center gap-1.5 border ${
              mt5Status.connected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mt5Status.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {mt5Status.connected ? 'TERMINAL CONNECTED' : 'TERMINAL OFFLINE'}
            </span>
          </div>

          {mt5Status.connected && mt5Status.account ? (
            <div className="space-y-3">
              {/* Account Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-center">
                <div className="p-3 bg-[#060810] border border-[#1e293b] rounded-xl">
                  <span className="text-[9px] text-[#64748b] block mb-0.5">MT5 ACCOUNT</span>
                  <span className="text-white font-bold text-xs">{mt5Status.account.login}</span>
                  <span className="text-[9px] text-[#475569] block truncate mt-0.5">{mt5Status.account.server}</span>
                </div>
                <div className="p-3 bg-[#060810] border border-emerald-500/20 rounded-xl">
                  <span className="text-[9px] text-emerald-400 block mb-0.5">BALANCE</span>
                  <span className="text-white font-bold text-xs">${Number(mt5Status.account.balance).toFixed(2)}</span>
                  <span className="text-[9px] text-[#475569] block mt-0.5">{mt5Status.account.currency || 'USD'}</span>
                </div>
                <div className="p-3 bg-[#060810] border border-brand-500/20 rounded-xl">
                  <span className="text-[9px] text-brand-400 block mb-0.5">EQUITY</span>
                  <span className="text-white font-bold text-xs">${Number(mt5Status.account.equity).toFixed(2)}</span>
                  <span className={`text-[9px] block mt-0.5 ${mt5Status.account.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {mt5Status.account.profit >= 0 ? `+$${mt5Status.account.profit}` : `-$${Math.abs(mt5Status.account.profit)}`}
                  </span>
                </div>
                <div className="p-3 bg-[#060810] border border-[#1e293b] rounded-xl">
                  <span className="text-[9px] text-[#64748b] block mb-0.5">FREE MARGIN</span>
                  <span className="text-white font-bold text-xs">${Number(mt5Status.account.free_margin).toFixed(2)}</span>
                  <span className="text-[9px] text-[#475569] block mt-0.5">Lev 1:{mt5Status.account.leverage}</span>
                </div>
              </div>

              <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-[10px] font-mono text-emerald-300 flex items-center justify-between">
                <span>⚡ Auto-Execution Active: Scanner signals will be sent directly to your MT5 terminal.</span>
                <span className="text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded text-emerald-400 font-bold">
                  {mt5Status.account.open_positions_count || 0} Open Positions
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 bg-[#060810] border border-[#1e293b] rounded-xl text-xs space-y-2 font-mono">
                <div className="flex items-center gap-2 text-white font-bold text-xs">
                  <Terminal className="w-4 h-4 text-brand-400" />
                  How to Connect Local MetaTrader 5:
                </div>
                <ol className="list-decimal list-inside text-[11px] text-[#94a3b8] space-y-1 pl-1">
                  <li>Open your <strong>MetaTrader 5</strong> desktop terminal application on this laptop.</li>
                  <li>Click the <strong>"Algo Trading"</strong> button in MT5's top toolbar to enable automated trades (ensure icon is green).</li>
                  <li>Double-click <code className="text-brand-400 bg-bg-secondary px-1 py-0.5 rounded">apps/mt5-bridge/start_mt5_bridge.bat</code> to run the local bridge.</li>
                </ol>
              </div>

              {mt5Status.error && (
                <div className="p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg text-[10px] font-mono text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>{mt5Status.error}</span>
                </div>
              )}
            </div>
          )}

          {/* Cloud VPS Bridge URL (Optional) */}
          <form onSubmit={handleSaveVpsUrl} className="p-3 bg-[#060810] border border-[#1e293b] rounded-xl space-y-2 font-mono">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[#94a3b8] uppercase font-bold">Cloud VPS Bridge URL (Optional)</label>
              <span className="text-[9px] text-cyan-400 font-bold">24/7 ONLINE</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="http://YOUR_AZURE_IP:5001 or https://xxxx.ngrok-free.app"
                value={vpsBridgeUrl}
                onChange={e => setVpsBridgeUrl(e.target.value)}
                className="input text-xs font-mono flex-1 placeholder-[#475569]"
              />
              <button
                type="submit"
                className="btn btn-secondary px-3 text-xs shrink-0"
              >
                Save URL
              </button>
            </div>
            <SaveMsg msg={msgVpsUrl} />
            <p className="text-[9px] text-[#64748b]">
              If running MT5 on Azure or a remote VPS, enter its public URL here so your browser can connect directly.
            </p>
          </form>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={checkMt5Connection}
              disabled={mt5Status.loading}
              className="btn btn-primary flex items-center justify-center gap-1.5 w-full text-xs font-mono"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${mt5Status.loading ? 'animate-spin' : ''}`} />
              {mt5Status.loading ? 'Testing MT5 Connection...' : 'Test & Sync MT5 Connection'}
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
