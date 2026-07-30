'use client';

import { MOCK_TICKERS } from '@/lib/mock-data';
import { formatPercent, formatPrice } from '@trade-z/utils';
import { Scan, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LiveScannerWidget() {
  return (
    <div className="card p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-500 animate-ping" />
          <h3 className="text-sm font-semibold text-white">Live Scanner</h3>
        </div>
        <span className="text-[10px] text-[#64748b] font-mono">Real-time Ticks</span>
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono">
              <th className="pb-2">Asset</th>
              <th className="pb-2 text-right">Price</th>
              <th className="pb-2 text-right">Spread</th>
              <th className="pb-2 text-right">Chg%</th>
              <th className="pb-2 text-right">Scan State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e293b] text-xs">
            {MOCK_TICKERS.slice(0, 6).map((ticker, idx) => {
              const isUp = ticker.changePercent24h >= 0;
              return (
                <tr key={ticker.pair} className="hover:bg-bg-hover/40 transition-colors">
                  <td className="py-2.5 flex flex-col">
                    <span className="font-bold text-white font-mono">{ticker.pair}</span>
                    <span className="text-[10px] text-[#64748b] truncate max-w-[100px]">{ticker.name}</span>
                  </td>
                  <td className="py-2.5 text-right font-mono text-white font-semibold">
                    {formatPrice(ticker.bid, ticker.pair)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-[#94a3b8]">
                    {ticker.spread.toFixed(1)}
                  </td>
                  <td className={`py-2.5 text-right font-mono font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? '+' : ''}{ticker.changePercent24h.toFixed(2)}%
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5 text-[10px]">
                      {idx % 3 === 0 ? (
                        <>
                          <Scan className="w-3 h-3 text-brand-400 animate-pulse" />
                          <span className="text-brand-400 font-mono">SCANNING</span>
                        </>
                      ) : idx % 3 === 1 ? (
                        <>
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-mono font-bold">STABLE</span>
                        </>
                      ) : (
                        <span className="text-[#475569] font-mono">IDLE</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
