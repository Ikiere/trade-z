'use client';

import { Check, CreditCard, Sparkles, Zap, ShieldAlert } from 'lucide-react';

const PLANS = [
  {
    name: 'Starter Autonomous',
    price: '$0',
    desc: '100% Autonomous AI execution on 1 watchlist asset.',
    features: ['100% Autonomous AI execution', 'Live MT5 Balance Shield (<$150 protect)', 'Wholesale SMC Limit Orders', 'Auto-Breakeven at +1.0R (Risk-Free)', 'Signals Ledger (Entry, SL, TP)'],
    cta: 'Active Plan',
    isPopular: false,
    active: true,
  },
  {
    name: 'Pro Autonomous',
    price: '$49',
    desc: 'Unleash full Forex, Gold & Crypto autonomous execution.',
    features: ['100% Autonomous AI execution', 'Unlimited Watchlist (Forex + Gold + Crypto)', 'Live MT5 Balance Shield & Dynamic Sizing', 'Auto-Breakeven at +1.0R & Partials at +1.5R', 'Continuous AI Brain Micro-Backtests'],
    cta: 'Upgrade to Pro',
    isPopular: true,
    active: false,
  },
  {
    name: 'Institutional AI',
    price: '$199',
    desc: 'Maximum computational power, self-learning brain & prop firm mode.',
    features: ['Everything in Pro Autonomous', 'Continuous Self-Learning Brain Loop', 'Automated Loss Autopsy & Weight Tuning', 'Prop Firm Challenge Rules Guardian', 'Sub-millisecond VPS Co-location'],
    cta: 'Contact Sales',
    isPopular: false,
    active: false,
  },
];

export default function BillingPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Billing & Plans</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          MANAGE YOUR SUBSCRIPTION & UPGRADE ALGORITHMIC POWER
        </p>
      </div>

      {/* active plan info */}
      <div className="p-4 rounded-xl bg-[#1a1033]/30 border border-brand-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600/10 border border-brand-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white font-mono">Active Plan: Free Trial</p>
            <p className="text-[10px] text-[#94a3b8]">Active since 2026-07-30. Renewable via Paystack.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[#94a3b8]">
          <CreditCard className="w-4 h-4 text-[#64748b]" /> No card details saved
        </div>
      </div>

      {/* Plans comparison list */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative p-6 rounded-2xl border transition-all ${
              plan.isPopular
                ? 'bg-gradient-to-b from-brand-600/10 to-bg-card border-brand-500/35 shadow-glow'
                : 'bg-bg-card border-[#1e293b] hover:border-[#334155]'
            }`}
          >
            {plan.isPopular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 text-[10px] font-bold text-white uppercase tracking-wider">
                Most Popular
              </span>
            )}

            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white font-mono">{plan.name}</h3>
                <p className="text-[11px] text-[#64748b] mt-0.5">{plan.desc}</p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white font-mono">{plan.price}</span>
                {plan.price !== '$0' && <span className="text-[#64748b] text-xs">/month</span>}
              </div>

              <button
                disabled={plan.active}
                className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all ${
                  plan.active
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/10 cursor-not-allowed'
                    : 'bg-bg-elevated text-white hover:bg-bg-hover border border-[#1e293b]'
                }`}
              >
                {plan.cta}
              </button>

              <ul className="space-y-2.5 pt-4 border-t border-[#1e293b]">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-xs text-[#94a3b8]">
                    <Check className="w-4 h-4 text-brand-400 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
