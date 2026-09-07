'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, ShieldCheck, Loader2, RefreshCw, WifiOff,
  TrendingUp, TrendingDown, Clock, AlertCircle, XCircle,
  Activity, DollarSign, BarChart3
} from 'lucide-react';

const BRIDGE_URL = 'http://localhost:5001';

interface Mt5Position {
  ticket: number;
  symbol: string;
  pair: string;
  direction: 'long' | 'short';
  volume: number;
  price_open: number;
  price_current: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  comment: string;
  time: number;
  opened_at: string;
}

interface Mt5Order {
  ticket: number;
  symbol: string;
  pair: string;
  order_type: string;
  direction: 'long' | 'short';
  volume: number;
  price_open: number;
  price_current: number;
  sl: number;
  tp: number;
  time: number;
  created_at: string;
}

interface AccountSummary {
  open_positions_count: number;
  pending_orders_count: number;
  total_floating_pnl: number;
  balance: number;
  equity: number;
}

type BridgeStatus = 'connected' | 'disconnected' | 'loading';

function SummaryCard({ label, value, icon, colorClass }: {
  label: string; value: string; icon: React.ReactNode; colorClass: string;
}) {
  return (
    <div className={`card p-3.5 border ${colorClass}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] text-[#64748b] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-bold text-white font-mono">{value}</div>
    </div>
  );
}

function InfoRow({ label, value, valueClass = 'text-white' }: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[#64748b]">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

export default function TradesPage() {
  const [positions, setPositions] = useState<Mt5Position[]>([]);
  const [orders, setOrders] = useState<Mt5Order[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('loading');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Mt5Position | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'pending'>('positions');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/positions`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error('Bridge error');
      const data = await res.json();
      if (data.success) {
        setPositions(data.positions || []);
        setOrders(data.orders || []);
        setSummary(data.summary || null);
        setBridgeStatus('connected');
        setLastUpdated(new Date());
      }
    } catch {
      setBridgeStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    intervalRef.current = setInterval(fetchPositions, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPositions]);

  const handleCancelOrder = async (ticket: number) => {
    setCancelling(ticket);
    try {
      const res = await fetch(`${BRIDGE_URL}/cancel-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPositions();
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch {
      alert('Bridge unreachable. Make sure MT5 Bridge is running.');
    } finally {
      setCancelling(null);
    }
  };

  const pnlColor = (pnl: number) => pnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Live Positions</h1>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            REAL-TIME MT5 ACCOUNT FEED · AUTO-SYNCED EVERY 3s
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {bridgeStatus === 'connected' ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              MT5 LIVE
            </span>
          ) : bridgeStatus === 'disconnected' ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
              <WifiOff className="w-3 h-3" />
              BRIDGE OFFLINE
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-mono font-semibold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-full">
              <Loader2 className="w-3 h-3 animate-spin" />
              CONNECTING
            </span>
          )}
          <button
            onClick={fetchPositions}
            className="p-1.5 rounded-lg bg-bg-secondary border border-[#1e293b] hover:border-brand-500/50 transition-colors text-[#64748b] hover:text-white"
            title="Refresh now"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bridge Offline Banner */}
      {bridgeStatus === 'disconnected' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-mono text-red-300 space-y-1"
        >
          <div className="flex items-center gap-2 font-bold text-red-400">
            <WifiOff className="w-4 h-4" /> MT5 Bridge is not reachable
          </div>
          <div className="text-red-300/70">
            Start the bridge on your local machine:&nbsp;
            <code className="bg-red-500/20 px-1.5 py-0.5 rounded text-red-300">
              python apps/mt5-bridge/mt5_bridge.py
            </code>
          </div>
        </motion.div>
      )}

      {/* Account Summary Cards */}
      {summary && bridgeStatus === 'connected' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="Account Balance"
            value={`$${summary.balance.toLocaleString('en', { minimumFractionDigits: 2 })}`}
            icon={<DollarSign className="w-4 h-4 text-brand-400" />}
            colorClass="bg-brand-500/10 border-brand-500/20"
          />
          <SummaryCard
            label="Equity"
            value={`$${summary.equity.toLocaleString('en', { minimumFractionDigits: 2 })}`}
            icon={<BarChart3 className="w-4 h-4 text-blue-400" />}
            colorClass="bg-blue-500/10 border-blue-500/20"
          />
          <SummaryCard
            label="Floating P&L"
            value={`${summary.total_floating_pnl >= 0 ? '+' : ''}$${summary.total_floating_pnl.toFixed(2)}`}
            icon={<Activity className={`w-4 h-4 ${summary.total_floating_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />}
            colorClass={summary.total_floating_pnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}
          />
          <SummaryCard
            label="Open / Pending"
            value={`${summary.open_positions_count} / ${summary.pending_orders_count}`}
            icon={<Zap className="w-4 h-4 text-yellow-400" />}
            colorClass="bg-yellow-500/10 border-yellow-500/20"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-bg-secondary border border-[#1e293b] rounded-xl w-fit">
        {(['positions', 'pending'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                : 'text-[#64748b] hover:text-white'
            }`}
          >
            {tab === 'positions' ? `Open (${positions.length})` : `Pending (${orders.length})`}
          </button>
        ))}
      </div>

      {/* Tables */}
      <AnimatePresence mode="wait">
        {activeTab === 'positions' && (
          <motion.div key="positions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="card p-0 overflow-hidden">
            {bridgeStatus === 'loading' ? (
              <div className="text-center p-12 flex flex-col items-center gap-3 text-xs text-[#64748b]">
                <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                Connecting to MT5 bridge...
              </div>
            ) : positions.length === 0 ? (
              <div className="text-center p-12 space-y-3">
                <div className="w-14 h-14 rounded-full bg-bg-secondary border border-[#1e293b] flex items-center justify-center mx-auto text-[#64748b]">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <p className="text-sm font-semibold text-white">No open positions</p>
                <p className="text-xs text-[#64748b]">MT5 is connected — no active trades right now</p>
              </div>
            ) : (
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono bg-bg-secondary">
                      <th className="py-3 px-4">Asset</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">Size</th>
                      <th className="py-3 px-3 text-right hidden md:table-cell">Open Price</th>
                      <th className="py-3 px-3 text-right">Live Price</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">Stop Loss</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">Take Profit</th>
                      <th className="py-3 px-3 text-right">Floating P&L</th>
                      <th className="py-3 px-3 text-right">Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f172a] text-xs">
                    {positions.map((pos) => {
                      const isLong = pos.direction === 'long';
                      const isProfit = pos.profit >= 0;
                      const priceDiff = pos.price_current - pos.price_open;
                      const priceIsGood = isLong ? priceDiff >= 0 : priceDiff <= 0;
                      return (
                        <motion.tr key={pos.ticket} layout className="hover:bg-bg-hover/20 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                {isLong ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              </span>
                              <div>
                                <div className="font-bold text-white font-mono">{pos.pair}</div>
                                <div className="text-[9px] text-[#64748b] font-mono">#{pos.ticket}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-[#94a3b8] hidden sm:table-cell">{pos.volume.toFixed(2)} Lots</td>
                          <td className="py-3.5 px-3 text-right font-mono text-white hidden md:table-cell">{pos.price_open.toFixed(5)}</td>
                          <td className={`py-3.5 px-3 text-right font-mono font-bold ${priceIsGood ? 'text-emerald-400' : 'text-red-400'}`}>{pos.price_current.toFixed(5)}</td>
                          <td className="py-3.5 px-3 text-right font-mono text-red-400 hidden sm:table-cell">{pos.sl > 0 ? pos.sl.toFixed(5) : <span className="text-[#475569]">—</span>}</td>
                          <td className="py-3.5 px-3 text-right font-mono text-emerald-400 hidden sm:table-cell">{pos.tp > 0 ? pos.tp.toFixed(5) : <span className="text-[#475569]">—</span>}</td>
                          <td className={`py-3.5 px-3 text-right font-mono font-bold ${pnlColor(pos.profit)}`}>
                            <div>{isProfit ? '+' : ''}${pos.profit.toFixed(2)}</div>
                            {pos.swap !== 0 && <div className="text-[9px] text-[#475569]">swap: ${pos.swap.toFixed(2)}</div>}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <button onClick={() => setSelectedPosition(pos)} className="btn btn-secondary py-1 px-2.5 text-[10px] font-semibold font-mono">Details</button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'pending' && (
          <motion.div key="pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="card p-0 overflow-hidden">
            {orders.length === 0 ? (
              <div className="text-center p-12 space-y-3">
                <div className="w-14 h-14 rounded-full bg-bg-secondary border border-[#1e293b] flex items-center justify-center mx-auto text-[#64748b]">
                  <Clock className="w-7 h-7" />
                </div>
                <p className="text-sm font-semibold text-white">No pending orders</p>
                <p className="text-xs text-[#64748b]">All limit and stop orders placed by AI will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] font-semibold uppercase tracking-wider font-mono bg-bg-secondary">
                      <th className="py-3 px-4">Asset</th>
                      <th className="py-3 px-3">Order Type</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">Size</th>
                      <th className="py-3 px-3 text-right">Trigger Price</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">Market</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">Stop Loss</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">Take Profit</th>
                      <th className="py-3 px-3 text-right">Cancel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f172a] text-xs">
                    {orders.map((order) => {
                      const isLong = order.direction === 'long';
                      const isCancelling = cancelling === order.ticket;
                      return (
                        <motion.tr key={order.ticket} layout className="hover:bg-bg-hover/20 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                {isLong ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              </span>
                              <div>
                                <div className="font-bold text-white font-mono">{order.pair}</div>
                                <div className="text-[9px] text-[#64748b] font-mono">#{order.ticket}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 uppercase whitespace-nowrap">
                              {order.order_type}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-[#94a3b8] hidden sm:table-cell">{order.volume.toFixed(2)} Lots</td>
                          <td className="py-3.5 px-3 text-right font-mono text-white font-bold">{order.price_open.toFixed(5)}</td>
                          <td className="py-3.5 px-3 text-right font-mono text-[#94a3b8] hidden sm:table-cell">{order.price_current > 0 ? order.price_current.toFixed(5) : '—'}</td>
                          <td className="py-3.5 px-3 text-right font-mono text-red-400 hidden sm:table-cell">{order.sl > 0 ? order.sl.toFixed(5) : <span className="text-[#475569]">—</span>}</td>
                          <td className="py-3.5 px-3 text-right font-mono text-emerald-400 hidden sm:table-cell">{order.tp > 0 ? order.tp.toFixed(5) : <span className="text-[#475569]">—</span>}</td>
                          <td className="py-3.5 px-3 text-right">
                            <button
                              disabled={isCancelling}
                              onClick={() => handleCancelOrder(order.ticket)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                              title="Cancel order"
                            >
                              {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last synced */}
      {lastUpdated && (
        <p className="text-[10px] text-[#475569] font-mono text-right">
          Last synced: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {/* Position Details Modal */}
      <AnimatePresence>
        {selectedPosition && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-sm bg-bg-secondary border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-[#1e293b] flex items-center justify-between bg-bg-card">
                <div className="flex items-center gap-2 font-mono">
                  <Zap className="w-4 h-4 text-brand-400" />
                  <span className="font-bold text-white text-sm">{selectedPosition.pair} · #{selectedPosition.ticket}</span>
                </div>
                <button onClick={() => setSelectedPosition(null)} className="text-[#64748b] hover:text-white transition-colors">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="p-3 rounded-xl bg-bg-card border border-[#1e293b] text-xs font-mono space-y-2.5">
                  <InfoRow label="Direction" value={selectedPosition.direction.toUpperCase()} valueClass={selectedPosition.direction === 'long' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'} />
                  <InfoRow label="Volume" value={`${selectedPosition.volume.toFixed(2)} Lots`} />
                  <InfoRow label="Open Price" value={selectedPosition.price_open.toFixed(5)} />
                  <InfoRow label="Live Price" value={selectedPosition.price_current.toFixed(5)} valueClass="text-brand-400 font-bold" />
                  <InfoRow label="Stop Loss" value={selectedPosition.sl > 0 ? selectedPosition.sl.toFixed(5) : 'None'} valueClass="text-red-400" />
                  <InfoRow label="Take Profit" value={selectedPosition.tp > 0 ? selectedPosition.tp.toFixed(5) : 'None'} valueClass="text-emerald-400" />
                  {selectedPosition.swap !== 0 && (
                    <InfoRow label="Swap" value={`$${selectedPosition.swap.toFixed(2)}`} valueClass="text-[#94a3b8]" />
                  )}
                  <div className="pt-1 border-t border-[#1e293b]">
                    <InfoRow
                      label="Floating P&L"
                      value={`${selectedPosition.profit >= 0 ? '+' : ''}$${selectedPosition.profit.toFixed(2)}`}
                      valueClass={selectedPosition.profit >= 0 ? 'text-emerald-400 font-bold text-sm' : 'text-red-400 font-bold text-sm'}
                    />
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-[10px] font-mono text-yellow-400/80">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-1.5" />
                  To close or modify this trade, use the MT5 terminal directly. Direct close coming soon.
                </div>
                <button onClick={() => setSelectedPosition(null)} className="btn btn-secondary w-full py-2.5 text-xs font-bold font-mono">
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
