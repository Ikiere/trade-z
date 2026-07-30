'use client';

import { motion } from 'framer-motion';

const SENTIMENT_DATA = [
  { pair: 'EURUSD', sentiment: 78, status: 'Bullish', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { pair: 'GBPUSD', sentiment: 42, status: 'Neutral', color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  { pair: 'USDJPY', sentiment: 88, status: 'Very Bullish', color: 'text-emerald-500', bg: 'bg-emerald-500/20' },
  { pair: 'XAUUSD', sentiment: 82, status: 'Bullish', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { pair: 'BTCUSD', sentiment: 91, status: 'Very Bullish', color: 'text-emerald-500', bg: 'bg-emerald-500/20' },
  { pair: 'WTIUSD', sentiment: 24, status: 'Bearish', color: 'text-red-400', bg: 'bg-red-500/10' },
];

export default function MarketSentimentWidget() {
  return (
    <div className="card p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-white">Market Sentiment</h3>
        <span className="text-[10px] text-[#64748b] font-mono">Aggregated Daily</span>
      </div>

      <div className="space-y-4">
        {SENTIMENT_DATA.map((item) => (
          <div key={item.pair} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-white font-bold">{item.pair}</span>
              <div className="flex items-center gap-2 font-mono">
                <span className={item.color}>{item.sentiment}%</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${item.bg} ${item.color}`}>
                  {item.status}
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                initial={{ width: 0 }}
                animate={{ width: `${item.sentiment}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
