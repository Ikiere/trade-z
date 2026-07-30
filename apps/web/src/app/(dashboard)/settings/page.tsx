'use client';

import { useState } from 'react';
import { User, Shield, Terminal, Zap, Key } from 'lucide-react';

export default function SettingsPage() {
  const [profileName, setProfileName] = useState('Chief Institutional Trader');
  const [email, setEmail] = useState('trader@tradez.app');
  const [mode, setMode] = useState('manual');
  const [lotSize, setLotSize] = useState(0.01);
  const [riskReward, setRiskReward] = useState(2.0);
  const [maxLoss, setMaxLoss] = useState(5.0);
  const [apiKey, setApiKey] = useState('••••••••••••••••••••••••');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Configuration Settings</h1>
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
          <form className="space-y-4 text-xs" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Full Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Email Address</label>
              <input
                type="email"
                value={email}
                disabled
                className="input opacity-50 cursor-not-allowed"
              />
            </div>
            <button className="btn btn-primary w-full">Update Profile</button>
          </form>
        </div>

        {/* Risk & Automation Settings */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#1e293b] pb-3">
            <Shield className="w-4.5 h-4.5 text-brand-400" />
            <h3 className="text-sm font-semibold text-white">Risk & Automation Rules</h3>
          </div>
          <form className="space-y-4 text-xs" onSubmit={(e) => e.preventDefault()}>
            {/* Mode selection */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Trading Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="input font-mono"
              >
                <option value="manual">MANUAL EXECUTION</option>
                <option value="semi_automatic">SEMI AUTOMATIC (ONE-CLICK)</option>
                <option value="fully_automatic">FULLY AUTOMATIC (AUTONOMOUS)</option>
              </select>
            </div>

            {/* Default lot size */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Default Lot Size</label>
              <input
                type="number"
                step="0.01"
                value={lotSize}
                onChange={(e) => setLotSize(Number(e.target.value))}
                className="input font-mono"
              />
            </div>

            {/* Default Risk RR */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Target Risk-Reward (R:R)</label>
              <input
                type="number"
                step="0.1"
                value={riskReward}
                onChange={(e) => setRiskReward(Number(e.target.value))}
                className="input font-mono"
              />
            </div>

            {/* Max daily loss */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Max Daily Loss Limit (%)</label>
              <input
                type="number"
                step="0.5"
                value={maxLoss}
                onChange={(e) => setMaxLoss(Number(e.target.value))}
                className="input font-mono"
              />
            </div>

            <button className="btn btn-primary w-full">Save Rules</button>
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
                className="input"
              />
            </div>
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">MetaTrader server</label>
              <input
                type="text"
                placeholder="MetaQuotes-Demo"
                className="input"
              />
            </div>
            <button className="btn btn-primary w-full">Sync Connections</button>
          </form>
        </div>
      </div>
    </div>
  );
}
