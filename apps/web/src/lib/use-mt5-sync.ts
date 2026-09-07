/**
 * useMt5Sync — Background AI Training Sync Hook
 *
 * Silently polls the local MT5 bridge every 5 minutes to sync
 * closed trade history to Supabase, feeding the AI loss autopsy
 * and pattern learning pipeline (HistoricalPatternEngine Layer 12).
 *
 * Mount once in the dashboard layout — no visible UI required.
 */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/api';
import { mt5Fetch } from '@/lib/mt5-client';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

export interface Mt5SyncState {
  bridgeConnected: boolean;
  lastSyncAt: Date | null;
  syncedCount: number;
  syncing: boolean;
  error: string | null;
}

export function useMt5Sync(): Mt5SyncState {
  const [state, setState] = useState<Mt5SyncState>({
    bridgeConnected: false,
    lastSyncAt: null,
    syncedCount: 0,
    syncing: false,
    error: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    const supabase = createClient();

    // 1. Require authenticated user session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    setState(prev => ({ ...prev, syncing: true, error: null }));

    try {
      // 2. Fetch last 90 days of closed trade history from MT5 bridge (direct or backend proxy)
      const bridgeData = await mt5Fetch('/history?days=90');

      if (!bridgeData || !bridgeData.success || !Array.isArray(bridgeData.trades)) {
        setState(prev => ({ ...prev, bridgeConnected: false, syncing: false }));
        return;
      }

      setState(prev => ({ ...prev, bridgeConnected: true }));

      const closedTrades: any[] = bridgeData.trades;
      if (closedTrades.length === 0) {
        setState(prev => ({ ...prev, syncing: false, lastSyncAt: new Date() }));
        return;
      }

      // 3. Optionally fetch live account info for portfolio balance update
      let account: { balance?: number; equity?: number } = {};
      try {
        const accData = await mt5Fetch('/account');
        if (accData && (accData.balance || accData.account?.balance)) {
          account = {
            balance: accData.account?.balance ?? accData.balance,
            equity: accData.account?.equity ?? accData.equity,
          };
        }
      } catch { /* account fetch is optional */ }

      // 4. POST closed trades to backend sync-mt5 endpoint → persists to Supabase
      const apiBase = getApiBaseUrl();
      const syncRes = await fetch(apiBase + '/api/v1/trades/sync-mt5', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ closedTrades, account }),
        signal: AbortSignal.timeout(15000),
      });

      if (!syncRes.ok) {
        const errData = await syncRes.json().catch(() => ({})) as Record<string, any>;
        throw new Error(errData?.message || 'Sync failed: HTTP ' + syncRes.status);
      }

      const syncData = await syncRes.json() as Record<string, any>;
      const syncedCount: number = syncData?.data?.synced ?? closedTrades.length;

      setState(prev => ({
        ...prev,
        syncing: false,
        lastSyncAt: new Date(),
        syncedCount,
        error: null,
      }));

      console.log('[MT5 Sync] Synced ' + syncedCount + ' closed trades to AI learning pipeline.');
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Unknown sync error';
      const isConnectionError =
        msg.includes('fetch') ||
        msg.includes('timeout') ||
        msg.includes('Failed to fetch') ||
        msg.includes('network');
      setState(prev => ({
        ...prev,
        syncing: false,
        bridgeConnected: isConnectionError ? false : prev.bridgeConnected,
        error: msg,
      }));
    }
  }, []);

  useEffect(() => {
    // Run immediately on mount, then every 5 minutes
    runSync();
    intervalRef.current = setInterval(runSync, SYNC_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runSync]);

  return state;
}
 
