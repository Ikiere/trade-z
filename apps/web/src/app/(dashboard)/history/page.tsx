'use client';

import { MOCK_CLOSED_TRADES } from '@/lib/mock-data';
import { formatPips, formatPrice } from '@trade-z/utils';
import { History, Eye, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function TradeHistoryPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Closed Positions</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          HISTORICAL LEDGER & EXECUTION METRICS
        </p>
      </div>

      {/* Ledger Table */}
      <div className="card p-5">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono">
                <th className="pb-2">Asset</th>
                <th className="pb-2 text-right">Size</th>
                <th className="pb-2 text-right">Entry Price</th>
                <th className="pb-2 text-right">Exit Price</th>
                <th className="pb-2 text-right">Result</th>
                <th className="pb-2 text-right">P&L ($)</th>
                <th className="pb-2 text-right">P&L (Pips)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b] text-xs">
              {MOCK_CLOSED_TRADES.map((trade) => {
                const isLong = trade.direction === 'long';
                const isProfit = (trade.pnl || 0) >= 0;
                
                return (
                  <tr key={trade.id} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-3.5 flex items-center gap-2">
                      <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                        isProfit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {isLong ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-white font-mono">{trade.pair}</span>
                        <span className="text-[9px] text-[#64748b] font-mono">Closed</span>
                      </div>
                    </td>
                    <td className="py-3.5 text-right font-mono text-[#94a3b8]">
                      {trade.lotSize.toFixed(2)} Lots
                    </td>
                    <td className="py-3.5 text-right font-mono text-white">
                      {trade.entryPrice.toFixed(5)}
                    </td>
                    <td className="py-3.5 text-right font-mono text-white">
                      {(trade.exitPrice || 0).toFixed(5)}
                    </td>
                    <td className="py-3.5 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                        trade.status === 'take_profit'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : trade.status === 'stopped_out'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-zinc-500/10 text-zinc-400'
                      }`}>
                        {trade.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`py-3.5 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                    </td>
                    <td className={`py-3.5 text-right font-mono font-medium ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{(trade.pips || 0).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
