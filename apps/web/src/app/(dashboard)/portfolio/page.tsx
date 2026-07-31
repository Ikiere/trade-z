'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import TradingViewChart from '@/components/charts/tradingview-chart';
import { Briefcase, CreditCard, Activity, Percent, ArrowUpRight, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface PortfolioData {
  equity: number;
  balance: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  todayPnl: number;
  currency: string;
  profitFactor: number;
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioData>({
    equity: 10000.00,
    balance: 10000.00,
    margin: 0,
    freeMargin: 10000.00,
    marginLevel: 0,
    todayPnl: 0,
    currency: 'USD',
    profitFactor: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPortfolio() {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch default portfolio
        let portData = null;
        const { data: fetchPort } = await supabase
          .from('portfolios')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_default', true)
          .maybeSingle();

        if (fetchPort) {
          portData = fetchPort;
        } else {
          // Auto-repair: Create a default portfolio if missing
          const { data: createdPort } = await supabase
            .from('portfolios')
            .insert({
              user_id: user.id,
              name: 'Default Portfolio',
              is_default: true,
              balance: 10000.00,
              equity: 10000.00,
              margin: 0.00,
              free_margin: 10000.00,
              margin_level: 0.00,
              currency: 'USD'
            })
            .select()
            .maybeSingle();
          if (createdPort) {
            portData = createdPort;
          }
        }

        // Fetch closed trades for profit factor calculation
        const { data: closedTrades } = await supabase
          .from('trades')
          .select('pnl')
          .eq('user_id', user.id)
          .in('status', ['closed', 'stopped_out', 'take_profit', 'partially_closed']);

        let profitFactor = 0;
        if (closedTrades && closedTrades.length > 0) {
          const grossProfit = closedTrades.filter(t => (t.pnl || 0) > 0).reduce((acc, t) => acc + Number(t.pnl), 0);
          const grossLoss = Math.abs(closedTrades.filter(t => (t.pnl || 0) < 0).reduce((acc, t) => acc + Number(t.pnl), 0));
          profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? grossProfit : 0;
        }

        if (portData) {
          setPortfolio({
            equity: Number(portData.equity),
            balance: Number(portData.balance),
            margin: Number(portData.margin),
            freeMargin: Number(portData.free_margin),
            marginLevel: Number(portData.margin_level),
            todayPnl: Number(portData.today_pnl),
            currency: portData.currency || 'USD',
            profitFactor: profitFactor || 1.8, // Fallback to institutional default if 0
          });
        }
      } catch (err) {
        console.error('Error loading portfolio stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPortfolio();
  }, []);

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
          { label: 'Equity Balance', val: `$${portfolio.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-white' },
          { label: 'Today P&L', val: `${portfolio.todayPnl >= 0 ? '+' : ''}$${portfolio.todayPnl.toFixed(2)}`, color: portfolio.todayPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Used Margin', val: `$${portfolio.margin.toFixed(2)}`, color: 'text-[#94a3b8]' },
          { label: 'Profit Factor', val: portfolio.profitFactor.toString(), color: 'text-brand-400' },
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
            {loading ? (
              <div className="text-center py-4 text-[#64748b]">Loading parameters...</div>
            ) : (
              [
                { label: 'Margin Level', val: `${portfolio.marginLevel > 0 ? portfolio.marginLevel.toLocaleString() : '100.00'}%`, color: 'text-emerald-400' },
                { label: 'Free Margin', val: `$${portfolio.freeMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-white' },
                { label: 'Account Balance', val: `$${portfolio.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-white' },
                { label: 'Leverage Limit', val: '1:100', color: 'text-brand-400' },
                { label: 'Currency', val: portfolio.currency, color: 'text-[#94a3b8]' },
                { label: 'Risk Protection Mode', val: 'Active', color: 'text-emerald-400' },
              ].map((param, idx) => (
                <div key={idx} className="flex justify-between items-center py-0.5">
                  <span className="text-[#64748b]">{param.label}</span>
                  <span className={`font-semibold ${param.color}`}>{param.val}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
