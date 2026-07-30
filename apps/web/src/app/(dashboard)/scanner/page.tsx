'use client';

import { MOCK_TICKERS } from '@/lib/mock-data';
import { formatPercent, formatPrice } from '@trade-z/utils';
import { ScanSearch, Activity, Layers, Coins, Target } from 'lucide-react';
import { motion } from 'framer-motion';

// Mock technical indicator summary values
const INDICATORS = [
  { pair: 'EURUSD', trend: 'Bullish', ema: 'BUY', rsi: 'Neutral (58)', macd: 'Bullish Cross', adx: 'Strong Trend (28)', atr: '0.0062' },
  { pair: 'GBPUSD', trend: 'Neutral', ema: 'HOLD', rsi: 'Neutral (46)', macd: 'Bearish Cross', adx: 'Weak Trend (14)', atr: '0.0084' },
  { pair: 'USDJPY', trend: 'Bullish', ema: 'BUY', rsi: 'Overbought (74)', macd: 'Bullish Expansion', adx: 'Strong Trend (36)', atr: '1.24' },
  { pair: 'AUDUSD', trend: 'Neutral', ema: 'HOLD', rsi: 'Neutral (52)', macd: 'Neutral', adx: 'Weak Trend (16)', atr: '0.0054' },
  { pair: 'XAUUSD', trend: 'Bullish', ema: 'BUY', rsi: 'Neutral (62)', macd: 'Bullish Cross', adx: 'Strong Trend (32)', atr: '24.50' },
  { pair: 'BTCUSD', trend: 'Bullish', ema: 'BUY', rsi: 'Neutral (68)', macd: 'Bullish Expansion', adx: 'Strong Trend (41)', atr: '1850.00' },
];

const CURRENCY_STRENGTH = [
  { currency: 'USD', strength: 7.2, color: 'bg-emerald-500' },
  { currency: 'EUR', strength: 6.8, color: 'bg-emerald-500/80' },
  { currency: 'GBP', strength: 4.5, color: 'bg-zinc-500' },
  { currency: 'JPY', strength: 2.1, color: 'bg-red-500' },
  { currency: 'AUD', strength: 5.4, color: 'bg-zinc-500' },
  { currency: 'CHF', strength: 3.8, color: 'bg-red-500/80' },
];

export default function ScannerPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Market Scanner</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          REAL-TIME TECHNICAL DATA & BIAS BREAKDOWNS
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Currency Strength Matrix */}
        <div className="card p-5 lg:col-span-1 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-white">Currency Strength</h3>
          </div>
          <div className="space-y-3.5">
            {CURRENCY_STRENGTH.map((curr) => (
              <div key={curr.currency} className="space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white font-mono">{curr.currency}</span>
                  <span className="text-[#94a3b8] font-mono">{curr.strength.toFixed(1)} / 10</span>
                </div>
                <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${curr.color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${curr.strength * 10}%` }}
                    transition={{ duration: 1 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Indicators Summary Table */}
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-white">Technical Confluence Matrix</h3>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono">
                  <th className="pb-2">Pair</th>
                  <th className="pb-2">Overall Bias</th>
                  <th className="pb-2">EMA (20/200)</th>
                  <th className="pb-2">RSI (14)</th>
                  <th className="pb-2">MACD</th>
                  <th className="pb-2">ADX</th>
                  <th className="pb-2 text-right">ATR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b] text-xs">
                {INDICATORS.map((ind) => {
                  const isBullish = ind.trend === 'Bullish';
                  return (
                    <tr key={ind.pair} className="hover:bg-bg-hover/40 transition-colors">
                      <td className="py-3.5 font-bold text-white font-mono">{ind.pair}</td>
                      <td className="py-3.5">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                          isBullish ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'
                        }`}>
                          {ind.trend.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 font-mono text-[#94a3b8]">{ind.ema}</td>
                      <td className="py-3.5 font-mono text-[#94a3b8]">{ind.rsi}</td>
                      <td className="py-3.5 font-mono text-[#94a3b8]">{ind.macd}</td>
                      <td className="py-3.5 font-mono text-[#94a3b8]">{ind.adx}</td>
                      <td className="py-3.5 text-right font-mono text-white font-semibold">{ind.atr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Active Scan Grid */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ScanSearch className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-white">Market Liquidity Levels</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { pair: 'EURUSD', support: '1.0795', resistance: '1.0880', session: 'High Liquidity' },
            { pair: 'GBPUSD', support: '1.2590', resistance: '1.2720', session: 'High Liquidity' },
            { pair: 'XAUUSD', support: '2310.00', resistance: '2358.50', session: 'Volatility High' },
          ].map((item) => (
            <div key={item.pair} className="p-4 rounded-xl bg-bg-secondary border border-[#1e293b] font-mono text-xs space-y-2">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-white text-sm">{item.pair}</span>
                <span className="text-[10px] text-brand-400 font-bold bg-brand-600/10 px-2 py-0.5 rounded">
                  {item.session}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">SUPPORTS</span>
                <span className="text-emerald-400 font-bold">{item.support}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">RESISTANCES</span>
                <span className="text-red-400 font-bold">{item.resistance}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
