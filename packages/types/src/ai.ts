import type { UUID, Timestamp } from './common';

// ============================================================================
// AI Types
// ============================================================================

export interface AIDecision {
  id: UUID;
  signalId?: UUID;
  pair: string;
  decision: AIDecisionType;
  confidence: number;
  reasoning: string;
  analysis: MarketAnalysis;
  rejectionReasons?: string[];
  timestamp: Timestamp;
}

export type AIDecisionType = 'approve' | 'reject' | 'wait' | 'no_trade';

export interface MarketAnalysis {
  pair: string;
  timeframe: string;
  timestamp: Timestamp;
  // Structure
  marketStructure: MarketStructureAnalysis;
  // Indicators
  indicators: IndicatorAnalysis;
  // Context
  sentiment: MarketSentiment;
  sessionInfo: SessionInfo;
  newsImpact: NewsImpact;
  // Multi-timeframe
  multiTimeframe: MultiTimeframeAnalysis;
}

export interface MarketStructureAnalysis {
  trend: 'bullish' | 'bearish' | 'ranging' | 'unclear';
  trendStrength: number;
  breakOfStructure: boolean;
  changeOfCharacter: boolean;
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  supportLevels: number[];
  resistanceLevels: number[];
  liquidityPools: LiquidityPool[];
}

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  high: number;
  low: number;
  timeframe: string;
  strength: number;
  isMitigated: boolean;
}

export interface FairValueGap {
  type: 'bullish' | 'bearish';
  high: number;
  low: number;
  timeframe: string;
  isFilled: boolean;
}

export interface LiquidityPool {
  level: number;
  type: 'buy_side' | 'sell_side';
  strength: number;
}

export interface IndicatorAnalysis {
  ema: { ema20: number; ema50: number; ema100: number; ema200: number };
  rsi: { value: number; signal: 'overbought' | 'oversold' | 'neutral' };
  macd: { value: number; signal: number; histogram: number; crossover: string };
  adx: { value: number; plusDI: number; minusDI: number; trend: string };
  atr: { value: number; percentOfPrice: number };
  vwap: { value: number; deviation: number };
  bollingerBands: { upper: number; middle: number; lower: number; width: number };
}

export type MarketSentiment = 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';

export interface SessionInfo {
  currentSession: TradingSession;
  isHighLiquidity: boolean;
  sessionOverlap: boolean;
  hoursUntilClose: number;
}

export type TradingSession = 'sydney' | 'tokyo' | 'london' | 'new_york' | 'off_hours';

export interface NewsImpact {
  hasUpcomingNews: boolean;
  nextNewsEvent?: string;
  minutesUntilNews?: number;
  impact: 'high' | 'medium' | 'low' | 'none';
  recommendation: string;
}

export interface MultiTimeframeAnalysis {
  monthly: TimeframeSignal;
  weekly: TimeframeSignal;
  daily: TimeframeSignal;
  h4: TimeframeSignal;
  h1: TimeframeSignal;
  m15: TimeframeSignal;
  m5: TimeframeSignal;
  alignment: 'aligned' | 'conflicting' | 'partial';
}

export interface TimeframeSignal {
  timeframe: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  keyLevels: number[];
}

// AI Status for dashboard
export type AIStatusType =
  | 'watching'
  | 'scanning'
  | 'waiting'
  | 'analyzing'
  | 'confirming'
  | 'ready'
  | 'executing'
  | 'managing_trade'
  | 'rejecting'
  | 'no_trade'
  | 'paused'
  | 'offline';

export interface AIStatus {
  status: AIStatusType;
  message: string;
  currentPair?: string;
  requiredConfidence: number;
  currentConfidence?: number;
  activeScanCount: number;
  lastScanAt?: Timestamp;
}

// AI Chat
export interface AIChatMessage {
  id: UUID;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: Timestamp;
}

export interface AIChatSession {
  id: UUID;
  userId: UUID;
  title: string;
  messages: AIChatMessage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
