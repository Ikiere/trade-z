'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { User, Shield, Zap, Key, Loader2, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [msgProfile, setMsgProfile] = useState('');
  const [msgSettings, setMsgSettings] = useState('');

  const [profileName, setProfileName] = useState('');
  const [email, setEmail] = useState('');
  
  const [mode, setMode] = useState('manual');
  const [lotSize, setLotSize] = useState(0.01);
  const [riskReward, setRiskReward] = useState(2.0);
  const [maxLoss, setMaxLoss] = useState(5.0);
  const [maxTrades, setMaxTrades] = useState(5);
  
  const [apiKey, setApiKey] = useState('••••••••••••••••••••••••');

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setEmail(user.email || '');

        // 1. Fetch Profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile) {
          setProfileName(profile.display_name || '');
        }

        // 2. Fetch Settings
        const { data: settings } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (settings) {
          setMode(settings.trading_mode || 'manual');
          setLotSize(Number(settings.default_lot_size) || 0.01);
          setRiskReward(Number(settings.default_risk_per_trade) || 2.0);
          setMaxLoss(Number(settings.max_daily_loss) || 5.0);
          setMaxTrades(Number(settings.max_open_trades) || 5);
        } else {
          // Auto-insert default settings if missing
          await supabase.from('user_settings').insert({
            user_id: user.id,
            trading_mode: 'manual',
            default_lot_size: 0.01,
            default_risk_per_trade: 2.00,
            max_daily_loss: 5.00,
            max_open_trades: 5
          });
        }
      } catch (err) {
        console.error('Error loading configuration details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setMsgProfile('');
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: profileName,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;
      setMsgProfile('Profile updated successfully!');
      setTimeout(() => setMsgProfile(''), 3000);
    } catch (err: any) {
      console.error('Error updating profile:', err.message);
      setMsgProfile('Failed to update profile.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingSettings(true);
    setMsgSettings('');
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_settings')
        .update({
          trading_mode: mode,
          default_lot_size: lotSize,
          default_risk_per_trade: riskReward,
          max_daily_loss: maxLoss,
          max_open_trades: maxTrades,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;
      setMsgSettings('Trading configuration saved!');
      setTimeout(() => setMsgSettings(''), 3000);
    } catch (err: any) {
      console.error('Error updating settings:', err.message);
      setMsgSettings('Failed to save configuration.');
    } finally {
      setUpdatingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-24 text-xs font-mono text-[#64748b] gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
        Syncing system configuration...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Configuration Settings</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          PROFILE PARAMETERS, RISK POLICIES & API CREDENTIALS
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Settings */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#1e293b] pb-3">
            <User className="w-4.5 h-4.5 text-brand-400" />
            <h3 className="text-sm font-semibold text-white">Profile Details</h3>
          </div>
          <form className="space-y-4 text-xs" onSubmit={handleUpdateProfile}>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Full Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="input text-xs"
                placeholder="Chief Trader"
                required
              />
            </div>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Email Address</label>
              <input
                type="email"
                value={email}
                disabled
                className="input opacity-50 cursor-not-allowed text-xs"
              />
            </div>

            {msgProfile && (
              <p className={`text-[10px] font-semibold font-mono ${msgProfile.includes('success') ? 'text-emerald-400' : 'text-red-400'}`}>
                {msgProfile}
              </p>
            )}

            <button type="submit" disabled={updatingProfile} className="btn btn-primary w-full text-xs">
              {updatingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Update Profile'}
            </button>
          </form>
        </div>

        {/* Risk & Automation Settings */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#1e293b] pb-3">
            <Shield className="w-4.5 h-4.5 text-brand-400" />
            <h3 className="text-sm font-semibold text-white">Risk & Automation Rules</h3>
          </div>
          <form className="space-y-4 text-xs" onSubmit={handleUpdateSettings}>
            {/* Mode selection */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Trading Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="input font-mono text-xs select-dark"
              >
                <option value="manual">MANUAL EXECUTION</option>
                <option value="semi_automatic">SEMI AUTOMATIC (ONE-TAP)</option>
                <option value="fully_automatic">FULLY AUTOMATIC (AUTONOMOUS)</option>
              </select>
            </div>

            {/* Default lot size */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Default Lot Size</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="10.0"
                value={lotSize}
                onChange={(e) => setLotSize(Number(e.target.value))}
                className="input font-mono text-xs"
              />
            </div>

            {/* Default Risk RR */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Target Risk-Reward (R:R)</label>
              <input
                type="number"
                step="0.1"
                min="1.0"
                value={riskReward}
                onChange={(e) => setRiskReward(Number(e.target.value))}
                className="input font-mono text-xs"
              />
            </div>

            {/* Max daily loss */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Max Daily Loss Limit (%)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={maxLoss}
                onChange={(e) => setMaxLoss(Number(e.target.value))}
                className="input font-mono text-xs"
              />
            </div>

            {msgSettings && (
              <p className={`text-[10px] font-semibold font-mono ${msgSettings.includes('saved') ? 'text-emerald-400' : 'text-red-400'}`}>
                {msgSettings}
              </p>
            )}

            <button type="submit" disabled={updatingSettings} className="btn btn-primary w-full text-xs">
              {updatingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Save Rules'}
            </button>
          </form>
        </div>

        {/* External Broker Credentials API */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#1e293b] pb-3">
            <Key className="w-4.5 h-4.5 text-brand-400" />
            <h3 className="text-sm font-semibold text-white">Broker API Integrations</h3>
          </div>
          <form className="space-y-4 text-xs" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Twelve Data API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">MetaTrader server</label>
              <input
                type="text"
                placeholder="MetaQuotes-Demo"
                className="input text-xs"
              />
            </div>
            <button className="btn btn-primary w-full text-xs">Sync Connections</button>
          </form>
        </div>
      </div>
    </div>
  );
}
