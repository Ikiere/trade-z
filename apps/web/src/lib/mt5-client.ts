import { getApiBaseUrl } from '@/lib/api';
import { createClient } from '@/lib/supabase';

export function getDirectBridgeUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('tradez_vps_bridge_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  return process.env.NEXT_PUBLIC_MT5_BRIDGE_URL || 'http://40.123.242.172:5001';
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
 * 1. If on HTTPS and bridge URL is unencrypted HTTP, skips direct call to prevent ERR_CONNECTION_REFUSED
 * 2. Uses secure backend API proxy on Render, which connects to the VPS bridge at MT5_BRIDGE_URL!
 */
export async function mt5Fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const directUrl = getDirectBridgeUrl();
  const apiBase = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isDirectHttp = directUrl.startsWith('http://');

  // 1. Try direct call to bridge ONLY if on local development (http:) or if bridge has https:
  // On production https://trade-z-web.vercel.app, calling an unencrypted http:// IP will produce
  // browser console net::ERR_CONNECTION_REFUSED / mixed content warnings.
  if (!isHttps || !isDirectHttp) {
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
      // Direct call failed or unreachable
    }
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
