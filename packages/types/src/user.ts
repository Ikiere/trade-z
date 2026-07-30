import type { UUID, Timestamp } from './common';

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UserRole = 'user' | 'admin' | 'super_admin';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification';

export interface UserProfile {
  id: UUID;
  userId: UUID;
  displayName?: string;
  bio?: string;
  timezone: string;
  preferredCurrency: string;
  tradingExperience: TradingExperience;
  riskTolerance: RiskTolerance;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TradingExperience = 'beginner' | 'intermediate' | 'advanced' | 'professional';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

export interface UserSettings {
  id: UUID;
  userId: UUID;
  // Trading settings
  defaultLotSize: number;
  maxDailyLoss: number;
  maxOpenTrades: number;
  defaultRiskPerTrade: number;
  tradingMode: TradingMode;
  // Notification settings
  emailNotifications: boolean;
  pushNotifications: boolean;
  signalAlerts: boolean;
  tradeAlerts: boolean;
  newsAlerts: boolean;
  // Display settings
  theme: 'dark' | 'light' | 'system';
  chartStyle: 'candlestick' | 'line' | 'area';
  language: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TradingMode = 'manual' | 'semi_automatic' | 'fully_automatic';
