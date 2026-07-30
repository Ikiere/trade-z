'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import type { Trade } from '@trade-z/types';
import { Zap, Eye, AlertTriangle, ShieldCheck, ArrowRight, ShieldAlert, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  async function loadTrades() {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open');

      if (data) {
        setTrades(data as unknown as Trade[]);
      }
    } catch (err) {
      console.error('Error loading trades:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();

    // Set up realtime channel for updates
    const supabase = createClient();
    const channel = supabase
      .channel('trades-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        () => loadTrades()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleBreakEven = async (tradeId: string, entryPrice: number) => {
    setUpdating(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('trades')
        .update({
          stop_loss: entryPrice,
          ai_reasoning: 'Stop Loss shifted to Break Even by trader request.',
          updated_at: new Date().toISOString()
        })
        .eq('id', tradeId);

      if (error) throw error;
      await loadTrades();
    } catch (err) {
      console.error('Error shifting stop to break even:', err);
    } finally {
      setUpdating(false);
      setSelectedTrade(null);
    }
  };

  const handleCloseManual = async (trade: Trade) => {
    setUpdating(true);
    const supabase = createClient();
    try {
      const currentPrice = trade.currentPrice || trade.entryPrice;
      const pnl = trade.direction === 'long' 
        ? (currentPrice - trade.entryPrice) * trade.lotSize * 100000 
        : (trade.entryPrice - currentPrice) * trade.lotSize * 100000;

      const { error } = await supabase
        .from('trades')
        .update({
          status: 'closed',
          exit_price: currentPrice,
          pnl: pnl,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', trade.id);

      if (error) throw error;
      await loadTrades();
    } catch (err) {
      console.error('Error closing trade:', err);
    } finally {
      setUpdating(false);
      setSelectedTrade(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Active Positions</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          MANAGE OPEN TRADES, MODIFY BOUNDS & PROTECT DRAWDOWN
        </p>
      </div>

      {/* Positions List */}
      <div className="card p-4 md:p-5">
        {loading ? (
          <div className="text-center p-8 text-xs text-[#64748b]">Loading open positions...</div>
        ) : trades.length === 0 ? (
          <div className="text-center p-8 space-y-3">
            <div className="w-12 h-12 rounded-full bg-bg-secondary border border-[#1e293b] flex items-center justify-center mx-auto text-[#64748b]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white">No active positions</p>
            <p className="text-xs text-[#64748b]">AI engine is scanning for setups</p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono">
                  <th className="pb-2">Asset</th>
                  <th className="pb-2 text-right hidden sm:table-cell">Size</th>
                  <th className="pb-2 text-right hidden md:table-cell">Entry Price</th>
                  <th className="pb-2 text-right hidden sm:table-cell">Stop Loss</th>
                  <th className="pb-2 text-right hidden sm:table-cell">Take Profit</th>
                  <th className="pb-2 text-right">P&L ($)</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b] text-xs">
                {trades.map((trade) => {
                  const isLong = trade.direction === 'long';
                  const isProfit = (trade.pnl || 0) >= 0;
                  return (
                    <tr key={trade.id} className="hover:bg-bg-hover/30 transition-colors">
                      <td className="py-3.5 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono ${
                          isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                        <span className="font-bold text-white font-mono">{trade.pair}</span>
                      </td>
                      <td className="py-3.5 text-right font-mono text-[#94a3b8] hidden sm:table-cell">
                        {trade.lotSize.toFixed(2)} Lots
                      </td>
                      <td className="py-3.5 text-right font-mono text-white hidden md:table-cell">
                        {trade.entryPrice.toFixed(5)}
                      </td>
                      <td className="py-3.5 text-right font-mono text-red-400 hidden sm:table-cell">
                        {trade.stopLoss.toFixed(5)}
                      </td>
                      <td className="py-3.5 text-right font-mono text-emerald-400 hidden sm:table-cell">
                        {trade.takeProfit.toFixed(5)}
                      </td>
                      <td className={`py-3.5 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${(trade.pnl || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => setSelectedTrade(trade)}
                          className="btn btn-secondary py-1 px-2.5 text-[10px] font-semibold"
                        >
                          Modify
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modify Trade Modal Drawer */}
      <AnimatePresence>
        {selectedTrade && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-bg-secondary border border-[#1e293b] rounded-2xl shadow-xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono">
                  <Zap className="w-4 h-4 text-brand-400" />
                  <span className="font-bold text-white text-sm">MODIFY POSITION — {selectedTrade.pair}</span>
                </div>
                <button
                  onClick={() => setSelectedTrade(null)}
                  disabled={updating}
                  className="text-xs text-[#64748b] hover:text-white uppercase tracking-wider font-mono"
                >
                  Close
                </button>
              </div>

              {/* Modify Controls */}
              <div className="p-5 space-y-4">
                <div className="p-3 rounded-lg bg-bg-card border border-[#1e293b] text-xs font-mono space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">ENTRY PRICE</span>
                    <span className="text-white font-bold">{selectedTrade.entryPrice.toFixed(5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">CURRENT STOP LOSS</span>
                    <span className="text-red-400 font-bold">{selectedTrade.stopLoss.toFixed(5)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    disabled={updating}
                    onClick={() => handleBreakEven(selectedTrade.id, selectedTrade.entryPrice)}
                    className="btn btn-secondary w-full py-2.5 text-xs font-bold font-mono flex items-center justify-center gap-1.5"
                  >
                    {updating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        SHIFT STOP TO BREAK EVEN (BE)
                      </>
                    )}
                  </button>
                  <button
                    disabled={updating}
                    onClick={() => handleCloseManual(selectedTrade)}
                    className="btn btn-ghost w-full py-2.5 text-xs font-bold font-mono bg-red-500/10 text-red-400 hover:bg-red-500/25 border border-red-500/10 flex items-center justify-center gap-1.5"
                  >
                    {updating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'MANUAL POSITION CLOSE (EXIT)'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
