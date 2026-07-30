// ============================================================================
// API Configuration
// ============================================================================

export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    VERIFY_EMAIL: '/auth/verify-email',
    ME: '/auth/me',
  },
  // Users
  USERS: {
    PROFILE: '/users/profile',
    SETTINGS: '/users/settings',
    AVATAR: '/users/avatar',
  },
  // Trades
  TRADES: {
    BASE: '/trades',
    OPEN: '/trades/open',
    CLOSED: '/trades/closed',
    STATS: '/trades/stats',
    CERTIFICATE: (id: string) => `/trades/${id}/certificate`,
  },
  // Signals
  SIGNALS: {
    BASE: '/signals',
    ACTIVE: '/signals/active',
    HISTORY: '/signals/history',
  },
  // Portfolio
  PORTFOLIO: {
    BASE: '/portfolio',
    STATS: '/portfolio/stats',
    HISTORY: '/portfolio/history',
  },
  // AI
  AI: {
    ANALYZE: '/ai/analyze',
    CHAT: '/ai/chat',
    STATUS: '/ai/status',
    DECISIONS: '/ai/decisions',
  },
  // Broker
  BROKER: {
    BASE: '/broker',
    CONNECT: '/broker/connect',
    DISCONNECT: '/broker/disconnect',
    ACCOUNTS: '/broker/accounts',
  },
  // Notifications
  NOTIFICATIONS: {
    BASE: '/notifications',
    READ: (id: string) => `/notifications/${id}/read`,
    READ_ALL: '/notifications/read-all',
  },
  // Subscriptions
  SUBSCRIPTIONS: {
    BASE: '/subscriptions',
    PLANS: '/subscriptions/plans',
    CHECKOUT: '/subscriptions/checkout',
    PORTAL: '/subscriptions/portal',
    WEBHOOK: '/subscriptions/webhook',
  },
  // Health
  HEALTH: '/health',
} as const;

export function getApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  return `${baseUrl}${path}`;
}
