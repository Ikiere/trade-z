'use client';

import TradingViewChart from '@/components/charts/tradingview-chart';
import { MOCK_PORTFOLIO_STATS } from '@/lib/mock-data';
import { Briefcase, CreditCard, Activity, Percent, ArrowUpRight, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PortfolioPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Portfolio</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          PRIMARY ACCOUNT STATUS & PERFORMANCE CURVES
        </p>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        {[
          { label: 'Equity Balance', val: `$${MOCK_PORTFOLIO_STATS.totalEquity.toLocaleString()}`, color: 'text-white' },
          { label: 'Today P&L', val: `+$${MOCK_PORTFOLIO_STATS.todayPnl.toFixed(2)}`, color: 'text-emerald-400' },
          { label: 'Used Margin', val: `$${MOCK_PORTFOLIO_STATS.maxDrawdown.toFixed(2)}`, color: 'text-[#94a3b8]' },
          { label: 'Profit Factor', val: MOCK_PORTFOLIO_STATS.profitFactor.toString(), color: 'text-brand-400' },
        ].map((item, idx) => (
          <div key={idx} className="card p-4 space-y-1">
            <span className="text-[9px] text-[#64748b] uppercase tracking-wider font-semibold">{item.label}</span>
            <p className={`text-lg font-bold ${item.color}`}>{item.val}</p>
          </div>
        ))}
      </div>

      {/* Chart & History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve Chart */}
        <div className="lg:col-span-2">
          <TradingViewChart pair="EQUITY_CURVE" />
        </div>

        {/* Account Parameters */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#1e293b] pb-3">
            <Briefcase className="w-4.5 h-4.5 text-brand-400" />
            <h3 className="text-sm font-semibold text-white">Account Parameters</h3>
          </div>

          <div className="space-y-3.5 text-xs font-mono">
            {[
              { label: 'Margin Level', val: '6,860.00%', color: 'text-emerald-400' },
              { label: 'Free Margin', val: '$104,102.20', color: 'text-white' },
              { label: 'Account Balance', val: `$${MOCK_PORTFOLIO_STATS.totalBalance.toLocaleString()}`, color: 'text-white' },
              { label: 'Leverage Limit', val: '1:100', color: 'text-brand-400' },
              { label: 'Currency', val: 'USD', color: 'text-[#94a3b8]' },
              { label: 'Risk Protection Mode', val: 'Active', color: 'text-emerald-400' },
            ].map((param, idx) => (
              <div key={idx} className="flex justify-between items-center py-0.5">
                <span className="text-[#64748b]">{param.label}</span>
                <span className={`font-semibold ${param.color}`}>{param.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
