// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Get relative time string (e.g., "2 hours ago", "just now")
 */
export function getRelativeTime(date: string | Date): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Format date to display string
 */
export function formatDate(date: string | Date, format: 'short' | 'long' | 'time' = 'short'): string {
  const d = new Date(date);

  switch (format) {
    case 'short':
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    case 'long':
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    case 'time':
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    default:
      return d.toISOString();
  }
}

/**
 * Detect current trading session
 */
export function getCurrentTradingSession(): {
  session: string;
  isHighLiquidity: boolean;
  overlap: boolean;
} {
  const now = new Date();
  const utcHour = now.getUTCHours();

  // Session times in UTC
  const sessions = {
    sydney: { start: 21, end: 6 },
    tokyo: { start: 0, end: 9 },
    london: { start: 7, end: 16 },
    newYork: { start: 12, end: 21 },
  };

  const isInSession = (start: number, end: number) => {
    if (start > end) {
      return utcHour >= start || utcHour < end;
    }
    return utcHour >= start && utcHour < end;
  };

  const activeSessions = [];
  if (isInSession(sessions.sydney.start, sessions.sydney.end)) activeSessions.push('sydney');
  if (isInSession(sessions.tokyo.start, sessions.tokyo.end)) activeSessions.push('tokyo');
  if (isInSession(sessions.london.start, sessions.london.end)) activeSessions.push('london');
  if (isInSession(sessions.newYork.start, sessions.newYork.end)) activeSessions.push('newYork');

  const session = activeSessions[activeSessions.length - 1] || 'off_hours';
  const overlap = activeSessions.length > 1;
  const isHighLiquidity = activeSessions.includes('london') || activeSessions.includes('newYork');

  return { session, isHighLiquidity, overlap };
}

/**
 * Check if market is open (forex — Sunday 5pm ET to Friday 5pm ET)
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();

  // Market closed Saturday all day
  if (utcDay === 6) return false;
  // Market closed Sunday before 21:00 UTC (5pm ET)
  if (utcDay === 0 && utcHour < 21) return false;
  // Market closed Friday after 21:00 UTC (5pm ET)
  if (utcDay === 5 && utcHour >= 21) return false;

  return true;
}
