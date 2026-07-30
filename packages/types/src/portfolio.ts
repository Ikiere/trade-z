import type { UUID, Timestamp } from './common';

// ============================================================================
// Portfolio Types
// ============================================================================

export interface Portfolio {
  id: UUID;
  userId: UUID;
  name: string;
  description?: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  unrealizedPnl: number;
  realizedPnl: number;
  todayPnl: number;
  currency: string;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PortfolioStats {
  totalBalance: number;
  totalEquity: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  todayPnl: number;
  weekPnl: number;
  monthPnl: number;
  allTimePnl: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  activeTrades: number;
}

export interface PortfolioSnapshot {
  id: UUID;
  portfolioId: UUID;
  balance: number;
  equity: number;
  pnl: number;
  tradeCount: number;
  snapshotDate: string;
  createdAt: Timestamp;
}
