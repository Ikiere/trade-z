import type { UUID, Timestamp } from './common';

// ============================================================================
// Trade Types
// ============================================================================

export interface Trade {
  id: UUID;
  userId: UUID;
  signalId?: UUID;
  brokerId?: UUID;
  // Trade details
  pair: string;
  type: TradeType;
  direction: TradeDirection;
  status: TradeStatus;
  // Price levels
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice?: number;
  exitPrice?: number;
  // Size
  lotSize: number;
  // Risk
  riskAmount: number;
  riskReward: number;
  riskPercent: number;
  // P&L
  pnl?: number;
  pnlPercent?: number;
  pips?: number;
  // AI
  aiConfidence?: number;
  aiReasoning?: string;
  // Timestamps
  openedAt?: Timestamp;
  closedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TradeType = 'market' | 'limit' | 'stop';
export type TradeDirection = 'long' | 'short';
export type TradeStatus =
  | 'pending'
  | 'open'
  | 'closed'
  | 'cancelled'
  | 'stopped_out'
  | 'take_profit'
  | 'partially_closed'
  | 'break_even';

export interface TradeStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;
  totalPnl: number;
  totalPips: number;
  averageRiskReward: number;
  bestTrade: number;
  worstTrade: number;
  averagePnl: number;
  profitFactor: number;
  maxDrawdown: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

export interface TradeCertificate {
  tradeId: UUID;
  pair: string;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  riskReward: number;
  confidence: number;
  trend: string;
  liquidity: string;
  orderBlock: string;
  fairValueGap: string;
  volume: string;
  newsImpact: string;
  aiRecommendation: string;
  detailedExplanation: string;
  timestamp: Timestamp;
  executionHistory: TradeExecutionEvent[];
}

export interface TradeExecutionEvent {
  id: UUID;
  tradeId: UUID;
  event: string;
  description: string;
  previousValue?: number;
  newValue?: number;
  timestamp: Timestamp;
}
