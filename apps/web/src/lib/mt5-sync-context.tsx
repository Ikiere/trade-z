'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/api';

import { mt5Fetch, getDirectBridgeUrl } from '@/lib/mt5-client';

const POSITIONS_POLL_INTERVAL_MS = 3000; // 3 seconds
const HISTORY_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface Mt5Position {
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

export interface Mt5Order {
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

export interface Mt5AccountSummary {
  open_positions_count: number;
  pending_orders_count: number;
  total_floating_pnl: number;
  balance: number;
  equity: number;
}

export interface Mt5AccountDetails {
  login: number;
  name: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  profit: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  leverage: number;
  trade_allowed: boolean;
  open_positions_count: number;
}

export type BridgeStatus = 'connected' | 'disconnected' | 'loading';

interface Mt5ContextType {
  bridgeStatus: BridgeStatus;
  positions: Mt5Position[];
  orders: Mt5Order[];
  summary: Mt5AccountSummary | null;
  account: Mt5AccountDetails | null;
  lastUpdated: Date | null;
  lastSyncAt: Date | null;
  syncedCount: number;
  syncing: boolean;
  refreshPositions: () => Promise<void>;
  closePosition: (ticket: number) => Promise<{ success: boolean; message?: string; error?: string }>;
  closeAllPositions: () => Promise<{ success: boolean; message?: string; error?: string }>;
  cancelOrder: (ticket: number) => Promise<{ success: boolean; message?: string; error?: string }>;
  modifyPosition: (ticket: number, sl: number, tp?: number) => Promise<{ success: boolean; message?: string; error?: string }>;
  triggerHistorySync: () => Promise<void>;
}

const Mt5Context = createContext<Mt5ContextType | null>(null);

export function Mt5SyncProvider({ children }: { children: React.ReactNode }) {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('loading');

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('tradez_bridge_connected') === 'true') {
      setBridgeStatus('connected');
    }
  }, []);
  const [positions, setPositions] = useState<Mt5Position[]>([]);
  const [orders, setOrders] = useState<Mt5Order[]>([]);
  const [summary, setSummary] = useState<Mt5AccountSummary | null>(null);
  const [account, setAccount] = useState<Mt5AccountDetails | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Sync state
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncedCount, setSyncedCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);

  // 1. Fetch live positions and account summary
  const fetchPositions = useCallback(async () => {
    try {
      const data = await mt5Fetch('/positions');
      if (data && data.success) {
        setPositions(data.positions || []);
        setOrders(data.orders || []);
        setSummary(data.summary || null);
        setBridgeStatus('connected');
        if (typeof window !== 'undefined') localStorage.setItem('tradez_bridge_connected', 'true');
        setLastUpdated(new Date());
      } else {
        setBridgeStatus('disconnected');
        if (typeof window !== 'undefined') localStorage.setItem('tradez_bridge_connected', 'false');
      }
    } catch {
      setBridgeStatus('disconnected');
      if (typeof window !== 'undefined') localStorage.setItem('tradez_bridge_connected', 'false');
    }
  }, []);

  // 2. Fetch full account info (margin, leverage, currency)
  const fetchAccount = useCallback(async () => {
    try {
      const data = await mt5Fetch('/account');
      if (data && data.connected && data.account) {
        setAccount(data.account);
      }
    } catch {
      // Handled by fetchPositions
    }
  }, []);

  // 3. Background AI history sync
  const triggerHistorySync = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    setSyncing(true);
    try {
      const bridgeData = await mt5Fetch('/history?days=90');
      if (!bridgeData || !bridgeData.success || !Array.isArray(bridgeData.trades)) {
        setSyncing(false);
        return;
      }

      const closedTrades = bridgeData.trades;
      if (closedTrades.length === 0) {
        setSyncing(false);
        setLastSyncAt(new Date());
        return;
      }

      let accInfo: { balance?: number; equity?: number } = {};
      try {
        const accData = await mt5Fetch('/account');
        if (accData && accData.account) {
          accInfo = { balance: accData.account.balance, equity: accData.account.equity };
        }
      } catch { /* optional */ }

      const apiBase = getApiBaseUrl();
      const syncRes = await fetch(`${apiBase}/api/v1/trades/sync-mt5`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ closedTrades, account: accInfo }),
        signal: AbortSignal.timeout(15000),
      });

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const count = syncData?.data?.synced ?? closedTrades.length;
        setSyncedCount(count);
        setLastSyncAt(new Date());
      }
    } catch (err) {
      console.warn('[MT5 Context Sync] Sync error:', err);
    } finally {
      setSyncing(false);
    }
  }, []);

  // 4. Direct Close Single Position
  const closePosition = useCallback(async (ticket: number) => {
    try {
      const data = await mt5Fetch('/close', {
        method: 'POST',
        body: JSON.stringify({ ticket }),
      });
      if (data && data.success) {
        await fetchPositions();
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data?.error || 'Failed to close position' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Bridge unreachable' };
    }
  }, [fetchPositions]);

  // 5. Emergency Panic Close All Positions
  const closeAllPositions = useCallback(async () => {
    try {
      const data = await mt5Fetch('/close-all', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (data && data.success) {
        await fetchPositions();
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data?.error || 'Failed to close positions' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Bridge unreachable' };
    }
  }, [fetchPositions]);

  // 6. Cancel Pending Order
  const cancelOrder = useCallback(async (ticket: number) => {
    try {
      const data = await mt5Fetch('/cancel-order', {
        method: 'POST',
        body: JSON.stringify({ ticket }),
      });
      if (data && data.success) {
        await fetchPositions();
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data?.error || 'Failed to cancel order' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Bridge unreachable' };
    }
  }, [fetchPositions]);

  // 7. Modify Position SL / TP (Breakeven or Trailing Stop)
  const modifyPosition = useCallback(async (ticket: number, sl: number, tp?: number) => {
    try {
      const data = await mt5Fetch('/modify', {
        method: 'POST',
        body: JSON.stringify({ ticket, sl, ...(tp !== undefined ? { tp } : {}) }),
      });
      if (data && data.success) {
        await fetchPositions();
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data?.error || 'Failed to modify position' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Bridge unreachable' };
    }
  }, [fetchPositions]);

  // Unified interval loops
  useEffect(() => {
    fetchPositions();
    fetchAccount();
    triggerHistorySync();

    const posInterval = setInterval(() => {
      fetchPositions();
    }, POSITIONS_POLL_INTERVAL_MS);

    const accInterval = setInterval(() => {
      fetchAccount();
    }, 15000);

    const syncInterval = setInterval(() => {
      triggerHistorySync();
    }, HISTORY_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(posInterval);
      clearInterval(accInterval);
      clearInterval(syncInterval);
    };
  }, [fetchPositions, fetchAccount, triggerHistorySync]);

  return (
    <Mt5Context.Provider
      value={{
        bridgeStatus,
        positions,
        orders,
        summary,
        account,
        lastUpdated,
        lastSyncAt,
        syncedCount,
        syncing,
        refreshPositions: fetchPositions,
        closePosition,
        closeAllPositions,
        cancelOrder,
        modifyPosition,
        triggerHistorySync,
      }}
    >
      {children}
    </Mt5Context.Provider>
  );
}

export function useMt5(): Mt5ContextType {
  const context = useContext(Mt5Context);
  if (!context) {
    throw new Error('useMt5 must be used within an Mt5SyncProvider');
  }
  return context;
}
