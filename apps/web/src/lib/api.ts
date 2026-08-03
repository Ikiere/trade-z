/**
 * API Base URL Resolver
 * Dynamically resolves the backend API URL based on the runtime domain,
 * bypassing Next.js build-time environment variable compilation limitations.
 */
export function getApiBaseUrl(): string {
  // 1. If explicit env variable is compile-time populated, use it
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // 2. If running in client browser, inspect the active hostname
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (
      host.includes('railway.app') || 
      host.includes('vercel.app') || 
      host.includes('trade-z-web')
    ) {
      return 'https://trade-z-production-9a14.up.railway.app';
    }
  }

  // 3. Fallback to local development port
  return 'http://localhost:3001';
}
