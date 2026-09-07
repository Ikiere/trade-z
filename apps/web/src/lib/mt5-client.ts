import { getApiBaseUrl } from '@/lib/api';
import { createClient } from '@/lib/supabase';

export function getDirectBridgeUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('tradez_vps_bridge_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  return process.env.NEXT_PUBLIC_MT5_BRIDGE_URL || 'http://localhost:5001';
}

export async function getAuthToken(): Promise<string | undefined> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  } catch {
    return undefined;
  }
}

/**
 * Universal resilient fetcher:
 * 1. Tries direct bridge URL (fast, works if client is on same machine or has direct access)
 * 2. If direct fails (like when on VPS or remote device), automatically proxies through backend API!
 */
export async function mt5Fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const directUrl = getDirectBridgeUrl();
  const apiBase = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // 1. Try direct call to bridge
  try {
    const controller = new AbortController();
    const timeoutMs = options.signal ? 3500 : 1800;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const directRes = await fetch(`${directUrl}${cleanEndpoint}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (directRes.ok) {
      return await directRes.json();
    }
  } catch (_) {
    // Direct call failed or unreachable (e.g. running on VPS without direct browser CORS or local)
  }

  // 2. Fall back to backend API proxy (which is connected to Azure VPS via MT5_BRIDGE_URL)
  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const apiPath = `/api/v1/broker/mt5${cleanEndpoint}`;
    const apiRes = await fetch(`${apiBase}${apiPath}`, {
      ...options,
      headers,
    });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && data.data && typeof data.data === 'object' && !data.positions && !data.trades) {
        return data.data;
      }
      return data;
    }
  } catch (err) {
    console.warn(`[MT5 Client] Proxy error on ${cleanEndpoint}:`, err);
  }

  return null;
}
