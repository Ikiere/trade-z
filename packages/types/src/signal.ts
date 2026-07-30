import type { UUID, Timestamp } from './common';
import type { TradeDirection } from './trade';

// ============================================================================
// Signal Types
// ============================================================================

export interface Signal {
  id: UUID;
  userId?: UUID;
  pair: string;
  direction: TradeDirection;
  status: SignalStatus;
  // Price levels
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  // AI Analysis
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  aiReasoning: string;
  timeframe: Timeframe;
  // Risk
  riskReward: number;
  riskPercent: number;
  // Metadata
  strategy: string;
  tags: string[];
  expiresAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SignalStatus =
  | 'pending'
  | 'active'
  | 'executed'
  | 'expired'
  | 'rejected'
  | 'cancelled';

export interface ConfidenceBreakdown {
  marketStructure: number;
  trend: number;
  momentum: number;
  liquidity: number;
  volume: number;
  fairValueGap: number;
  orderBlock: number;
  breakOfStructure: number;
  changeOfCharacter: number;
  supportResistance: number;
  ema: number;
  vwap: number;
  atr: number;
  macd: number;
  rsi: number;
  adx: number;
  bollingerBands: number;
  averageDailyRange: number;
  economicNews: number;
  sessionQuality: number;
  spread: number;
  currencyStrength: number;
  correlation: number;
  historicalPattern: number;
  riskReward: number;
  overall: number;
}

export type Timeframe =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '4h'
  | '1d'
  | '1w'
  | '1M';
