// ============================================================================
// Application Constants
// ============================================================================

export const APP_NAME = 'Trade-Z';
export const APP_DESCRIPTION = 'AI Trading Operating System';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Feature Flags
export const FEATURES = {
  AI_CHAT: true,
  BROKER_INTEGRATION: true,
  PAPER_TRADING: true,
  LIVE_TRADING: false, // Disabled in MVP
  PUSH_NOTIFICATIONS: false, // Future
  TWO_FACTOR_AUTH: false, // Future
  OAUTH: false, // Future
  MOBILE_APP: false, // Future
  DESKTOP_APP: false, // Future
} as const;

// Confidence Thresholds
export const AI_CONFIDENCE = {
  MINIMUM_TRADE: 85,
  HIGH_CONFIDENCE: 90,
  VERY_HIGH_CONFIDENCE: 95,
  MAXIMUM: 100,
} as const;

// Risk Management
export const RISK = {
  MAX_RISK_PER_TRADE: 2, // percent
  MAX_DAILY_LOSS: 5, // percent
  MAX_OPEN_TRADES: 5,
  DEFAULT_LOT_SIZE: 0.01,
  MAX_LOT_SIZE: 10,
} as const;
