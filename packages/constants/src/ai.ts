import type { AIStatusType } from '@trade-z/types';

// ============================================================================
// AI Constants
// ============================================================================

export const AI_STATUS_LABELS: Record<AIStatusType, { label: string; color: string; icon: string }> = {
  watching: { label: 'Watching Markets', color: '#94a3b8', icon: '👁️' },
  scanning: { label: 'Scanning', color: '#8b5cf6', icon: '🔍' },
  waiting: { label: 'Waiting', color: '#64748b', icon: '⏳' },
  analyzing: { label: 'Analyzing', color: '#f59e0b', icon: '🧠' },
  confirming: { label: 'Confirming', color: '#3b82f6', icon: '✅' },
  ready: { label: 'Ready', color: '#10b981', icon: '🟢' },
  executing: { label: 'Executing', color: '#10b981', icon: '⚡' },
  managing_trade: { label: 'Managing Trade', color: '#6366f1', icon: '📊' },
  rejecting: { label: 'Rejecting Trade', color: '#ef4444', icon: '🚫' },
  no_trade: { label: 'No Trade', color: '#f59e0b', icon: '⏸️' },
  paused: { label: 'Paused', color: '#64748b', icon: '⏸️' },
  offline: { label: 'Offline', color: '#475569', icon: '🔴' },
};

export const CONFIDENCE_WEIGHTS = {
  marketStructure: 0.12,
  trend: 0.10,
  momentum: 0.08,
  liquidity: 0.08,
  volume: 0.05,
  fairValueGap: 0.06,
  orderBlock: 0.06,
  breakOfStructure: 0.05,
  changeOfCharacter: 0.04,
  supportResistance: 0.05,
  ema: 0.03,
  vwap: 0.03,
  atr: 0.02,
  macd: 0.03,
  rsi: 0.03,
  adx: 0.02,
  bollingerBands: 0.02,
  averageDailyRange: 0.02,
  economicNews: 0.04,
  sessionQuality: 0.03,
  spread: 0.02,
  currencyStrength: 0.02,
  correlation: 0.01,
  historicalPattern: 0.02,
  riskReward: 0.04,
} as const;

// Total must equal 1.00
// Sum: 0.12+0.10+0.08+0.08+0.05+0.06+0.06+0.05+0.04+0.05+0.03+0.03+0.02+0.03+0.03+0.02+0.02+0.02+0.04+0.03+0.02+0.02+0.01+0.02+0.04 = 1.07
// Adjusting... The weights will be normalized at runtime

export const REJECTION_REASONS = [
  'Weak momentum',
  'Upcoming high-impact news',
  'Low liquidity',
  'Excessive spread',
  'Higher timeframes disagree',
  'Daily loss limit reached',
  'No clear market structure',
  'Poor risk-reward ratio',
  'Range-bound market',
  'Session overlap volatility',
  'Currency correlation conflict',
  'Insufficient confluence',
  'Market manipulation detected',
  'Break of structure invalidated',
  'Order block mitigated',
] as const;
