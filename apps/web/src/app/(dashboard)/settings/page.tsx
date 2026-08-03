'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import {
  User, Shield, Key, Loader2, Plus, Trash2,
  FileSpreadsheet, Wallet, BellRing, ListChecks,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/api';

const SUPPORTED_PAIRS = [
  'EURUSD','GBPUSD','USDJPY','XAUUSD','AUDUSD',
  'USDCAD','EURGBP','GBPJPY','USDCHF','NZDUSD',
];

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
  const [newPair, setNewPair] = useState('EURUSD');
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
        if (Array.isArray(s.watchlist) && s.watchlist.length > 0) {
          setWatchlist(s.watchlist);
          setLogPair(s.watchlist[0]);
        } else {
          const def = ['EURUSD','GBPUSD','USDJPY','XAUUSD'];
          setWatchlist(def);
        }
      } else {
        // Auto-create defaults
        await supabase.from('user_settings').upsert({
          user_id: user.id,
          trading_mode: 'manual',
          default_lot_size: 0.01,
          default_risk_per_trade: 2.00,
          max_daily_loss: 5.00,
          max_open_trades: 5,
          daily_signal_limit: 2,
          watchlist: ['EURUSD','GBPUSD','USDJPY','XAUUSD'],
        }, { onConflict: 'user_id' });
        setWatchlist(['EURUSD','GBPUSD','USDJPY','XAUUSD']);
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

  useEffect(() => { loadData(); }, [loadData]);

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
          daily_signal_limit: dailySignalLimit,
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

  const handleAddPair = () => {
    if (watchlist.includes(newPair)) { setMsgWatch(`${newPair} already in watchlist.`); return; }
    saveWatchlist([...watchlist, newPair]);
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
                <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">
                  Daily Signal Limit
                </label>
                <input type="number" step="1" min="1" max="50" value={dailySignalLimit}
                  onChange={e => setDailySignalLimit(Number(e.target.value))} className="input font-mono text-xs" />
                <p className="text-[9px] text-[#475569] font-mono mt-1">Default: 2 signals/day</p>
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

          {/* Add pair row */}
          <div className="flex gap-2">
            <select value={newPair} onChange={e => setNewPair(e.target.value)}
              className="input text-xs font-mono select-dark flex-1">
              {SUPPORTED_PAIRS.filter(p => !watchlist.includes(p)).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button onClick={handleAddPair} disabled={savingWatch}
              className="btn btn-primary px-3 text-xs flex items-center gap-1">
              {savingWatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-4 h-4" /> Watch</>}
            </button>
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
                  {(watchlist.length > 0 ? watchlist : SUPPORTED_PAIRS).map(p => (
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

        {/* API Keys / Broker */}
        <Section icon={Key} title="Broker API Integrations">
          <p className="text-[10px] text-[#64748b] font-mono -mt-1">
            Connect external broker or data provider APIs for live execution.
          </p>
          <form className="space-y-4 text-xs" onSubmit={e => e.preventDefault()}>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">Twelve Data API Key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="Enter your API key" className="input text-xs" />
            </div>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">MetaTrader Server</label>
              <input type="text" placeholder="MetaQuotes-Demo" className="input text-xs" />
            </div>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase text-[10px]">OpenRouter AI Key</label>
              <input type="password" placeholder="sk-or-..." className="input text-xs" />
              <p className="text-[9px] text-[#475569] font-mono mt-1">Used for AI signal generation. Stored server-side only.</p>
            </div>
            <button className="btn btn-primary w-full text-xs">Sync Connections</button>
          </form>
        </Section>
      </div>
    </div>
  );
}
