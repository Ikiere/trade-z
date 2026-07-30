import type {
  Ticker,
  Trade,
  Signal,
  Portfolio,
  PortfolioStats,
  EconomicEvent,
  JournalEntry,
  AIDecision,
  AIStatus,
} from '@trade-z/types';

// ============================================================================
// Mock Tickers
// ============================================================================

export const MOCK_TICKERS: Ticker[] = [
  // Forex
  { pair: 'EURUSD', name: 'Euro / US Dollar', category: 'forex', bid: 1.08524, ask: 1.08530, spread: 0.6, change24h: 0.0024, changePercent24h: 0.22, high24h: 1.08750, low24h: 1.08120, volume24h: 185200 },
  { pair: 'GBPUSD', name: 'British Pound / US Dollar', category: 'forex', bid: 1.26412, ask: 1.26420, spread: 0.8, change24h: -0.0035, changePercent24h: -0.28, high24h: 1.26900, low24h: 1.26250, volume24h: 142100 },
  { pair: 'USDJPY', name: 'US Dollar / Japanese Yen', category: 'forex', bid: 154.215, ask: 154.221, spread: 0.6, change24h: 0.820, changePercent24h: 0.53, high24h: 154.500, low24h: 153.250, volume24h: 210800 },
  { pair: 'AUDUSD', name: 'Australian Dollar / US Dollar', category: 'forex', bid: 0.65824, ask: 0.65832, spread: 0.8, change24h: 0.0008, changePercent24h: 0.12, high24h: 0.66100, low24h: 0.65500, volume24h: 95400 },
  { pair: 'USDCHF', name: 'US Dollar / Swiss Franc', category: 'forex', bid: 0.89240, ask: 0.89248, spread: 0.8, change24h: -0.0012, changePercent24h: -0.13, high24h: 0.89500, low24h: 0.89100, volume24h: 88700 },

  // Crypto
  { pair: 'BTCUSD', name: 'Bitcoin / US Dollar', category: 'crypto', bid: 64250.50, ask: 64251.50, spread: 100, change24h: 1450.25, changePercent24h: 2.31, high24h: 65100.00, low24h: 62500.00, volume24h: 38250 },
  { pair: 'ETHUSD', name: 'Ethereum / US Dollar', category: 'crypto', bid: 3425.20, ask: 3425.80, spread: 60, change24h: -42.80, changePercent24h: -1.23, high24h: 3510.00, low24h: 3380.00, volume24h: 145200 },
  { pair: 'SOLUSD', name: 'Solana / US Dollar', category: 'crypto', bid: 142.75, ask: 142.85, spread: 10, change24h: 8.45, changePercent24h: 6.29, high24h: 146.50, low24h: 132.00, volume24h: 894000 },

  // Commodities
  { pair: 'XAUUSD', name: 'Gold / US Dollar', category: 'commodities', bid: 2342.15, ask: 2342.35, spread: 20, change24h: 18.50, changePercent24h: 0.80, high24h: 2355.00, low24h: 2320.00, volume24h: 65400 },
  { pair: 'WTIUSD', name: 'Crude Oil WTI', category: 'commodities', bid: 78.42, ask: 78.46, spread: 4, change24h: -1.15, changePercent24h: -1.45, high24h: 79.90, low24h: 77.80, volume24h: 125000 },

  // Indices
  { pair: 'US500', name: 'S&P 500 Index', category: 'indices', bid: 5215.50, ask: 5216.00, spread: 50, change24h: 42.25, changePercent24h: 0.82, high24h: 5230.00, low24h: 5165.00, volume24h: 45000 },
  { pair: 'USTEC', name: 'Nasdaq 100 Index', category: 'indices', bid: 18120.20, ask: 18121.20, spread: 100, change24h: 215.50, changePercent24h: 1.20, high24h: 18250.00, low24h: 17850.00, volume24h: 55000 },
];

// ============================================================================
// Mock Portfolio Details
// ============================================================================

export const MOCK_PORTFOLIO: Portfolio = {
  id: 'port-1',
  userId: 'user-1',
  name: 'Primary Trading Account',
  description: 'AI-assisted main strategy account',
  balance: 104520.50,
  equity: 105642.20,
  margin: 1540.00,
  freeMargin: 104102.20,
  marginLevel: 6860.00,
  unrealizedPnl: 1121.70,
  realizedPnl: 4520.50,
  todayPnl: 342.10,
  currency: 'USD',
  isDefault: true,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-07-30T00:00:00Z',
};

export const MOCK_PORTFOLIO_STATS: PortfolioStats = {
  totalBalance: 104520.50,
  totalEquity: 105642.20,
  totalUnrealizedPnl: 1121.70,
  totalRealizedPnl: 4520.50,
  todayPnl: 342.10,
  weekPnl: 1850.40,
  monthPnl: 4520.50,
  allTimePnl: 4520.50,
  winRate: 72.4,
  profitFactor: 2.15,
  sharpeRatio: 1.85,
  maxDrawdown: 3.42,
  totalTrades: 58,
  activeTrades: 2,
};

// ============================================================================
// Mock Trades (Open & Closed)
// ============================================================================

export const MOCK_OPEN_TRADES: Trade[] = [
  {
    id: 'trade-open-1',
    userId: 'user-1',
    pair: 'EURUSD',
    type: 'market',
    direction: 'long',
    status: 'open',
    entryPrice: 1.08340,
    stopLoss: 1.07980,
    takeProfit: 1.09200,
    currentPrice: 1.08524,
    lotSize: 2.0,
    riskAmount: 720.00,
    riskReward: 2.39,
    riskPercent: 0.7,
    pnl: 368.00,
    pnlPercent: 0.35,
    pips: 18.4,
    aiConfidence: 94,
    aiReasoning: 'Bullish order block matching on H4, clear BOS on M15, high liquidity sweep.',
    openedAt: '2026-07-30T04:21:00Z',
    createdAt: '2026-07-30T04:21:00Z',
    updatedAt: '2026-07-30T05:30:00Z',
  },
  {
    id: 'trade-open-2',
    userId: 'user-1',
    pair: 'XAUUSD',
    type: 'market',
    direction: 'long',
    status: 'open',
    entryPrice: 2328.50,
    stopLoss: 2315.00,
    takeProfit: 2360.00,
    currentPrice: 2342.15,
    lotSize: 0.5,
    riskAmount: 675.00,
    riskReward: 2.33,
    riskPercent: 0.65,
    pnl: 682.50,
    pnlPercent: 0.65,
    pips: 136.5,
    aiConfidence: 89,
    aiReasoning: 'Gold swept weekly lows, bullish CHoCH on H1, session overlap momentum support.',
    openedAt: '2026-07-30T05:45:00Z',
    createdAt: '2026-07-30T05:45:00Z',
    updatedAt: '2026-07-30T06:12:00Z',
  },
];

export const MOCK_CLOSED_TRADES: Trade[] = [
  {
    id: 'trade-closed-1',
    userId: 'user-1',
    pair: 'USDJPY',
    type: 'market',
    direction: 'short',
    status: 'stopped_out',
    entryPrice: 153.850,
    stopLoss: 154.200,
    takeProfit: 153.000,
    exitPrice: 154.200,
    lotSize: 1.5,
    riskAmount: 525.00,
    riskReward: 2.43,
    riskPercent: 0.5,
    pnl: -525.00,
    pnlPercent: -0.5,
    pips: -35.0,
    aiConfidence: 88,
    openedAt: '2026-07-29T13:12:00Z',
    closedAt: '2026-07-29T16:45:00Z',
    createdAt: '2026-07-29T13:12:00Z',
    updatedAt: '2026-07-29T16:45:00Z',
  },
  {
    id: 'trade-closed-2',
    userId: 'user-1',
    pair: 'GBPUSD',
    type: 'market',
    direction: 'long',
    status: 'take_profit',
    entryPrice: 1.25800,
    stopLoss: 1.25400,
    takeProfit: 1.26800,
    exitPrice: 1.26800,
    lotSize: 2.5,
    riskAmount: 1000.00,
    riskReward: 2.5,
    riskPercent: 1.0,
    pnl: 2500.00,
    pnlPercent: 2.39,
    pips: 100.0,
    aiConfidence: 96,
    openedAt: '2026-07-28T09:40:00Z',
    closedAt: '2026-07-28T18:22:00Z',
    createdAt: '2026-07-28T09:40:00Z',
    updatedAt: '2026-07-28T18:22:00Z',
  },
  {
    id: 'trade-closed-3',
    userId: 'user-1',
    pair: 'BTCUSD',
    type: 'market',
    direction: 'long',
    status: 'closed',
    entryPrice: 62850.00,
    stopLoss: 62000.00,
    takeProfit: 65000.00,
    exitPrice: 63980.00,
    lotSize: 0.1,
    riskAmount: 85.00,
    riskReward: 2.53,
    riskPercent: 0.08,
    pnl: 113.00,
    pnlPercent: 0.11,
    pips: 1130.0,
    aiConfidence: 91,
    openedAt: '2026-07-27T18:30:00Z',
    closedAt: '2026-07-28T02:15:00Z',
    createdAt: '2026-07-27T18:30:00Z',
    updatedAt: '2026-07-28T02:15:00Z',
  },
];

// ============================================================================
// Mock AI Signals
// ============================================================================

export const MOCK_SIGNALS: Signal[] = [
  {
    id: 'sig-1',
    pair: 'EURUSD',
    direction: 'long',
    status: 'active',
    entryPrice: 1.08340,
    stopLoss: 1.07980,
    takeProfit: 1.09200,
    currentPrice: 1.08524,
    confidence: 94,
    strategy: 'Smart Money Concepts',
    tags: ['Order Block', 'BOS', 'H4 Alignment'],
    timeframe: '4h',
    riskReward: 2.39,
    riskPercent: 1.0,
    aiReasoning: 'Bullish H4 structure alignment. Liquidity has been swept from the Asia low, followed by a strong expansion breaking structure (BOS) to the upside. Price has retraced cleanly into the premium-to-discount order block.',
    confidenceBreakdown: {
      marketStructure: 95, trend: 92, momentum: 88, liquidity: 96, volume: 90,
      fairValueGap: 85, orderBlock: 94, breakOfStructure: 92, changeOfCharacter: 90,
      supportResistance: 80, ema: 85, vwap: 88, atr: 80, macd: 82, rsi: 75, adx: 78,
      bollingerBands: 70, averageDailyRange: 82, economicNews: 95, sessionQuality: 90,
      spread: 98, currencyStrength: 85, correlation: 88, historicalPattern: 90,
      riskReward: 92, overall: 94
    },
    createdAt: '2026-07-30T04:20:00Z',
    updatedAt: '2026-07-30T04:20:00Z',
  },
  {
    id: 'sig-2',
    pair: 'XAUUSD',
    direction: 'long',
    status: 'active',
    entryPrice: 2328.50,
    stopLoss: 2315.00,
    takeProfit: 2360.00,
    currentPrice: 2342.15,
    confidence: 89,
    strategy: 'Liquidity Grab',
    tags: ['Liquidity Sweep', 'H1 CHoCH', 'NY Open'],
    timeframe: '1h',
    riskReward: 2.33,
    riskPercent: 1.0,
    aiReasoning: 'Gold swept weekly equal lows at 2320, triggering stops. Strong recovery followed by a Change of Character (CHoCH) on the 1-hour chart. Entry triggered on the retest of the demand zone during NY Session open overlap.',
    confidenceBreakdown: {
      marketStructure: 90, trend: 85, momentum: 92, liquidity: 95, volume: 88,
      fairValueGap: 70, orderBlock: 85, breakOfStructure: 80, changeOfCharacter: 92,
      supportResistance: 82, ema: 78, vwap: 85, atr: 75, macd: 80, rsi: 85, adx: 82,
      bollingerBands: 75, averageDailyRange: 80, economicNews: 90, sessionQuality: 92,
      spread: 95, currencyStrength: 80, correlation: 85, historicalPattern: 82,
      riskReward: 88, overall: 89
    },
    createdAt: '2026-07-30T05:40:00Z',
    updatedAt: '2026-07-30T05:40:00Z',
  },
  {
    id: 'sig-3',
    pair: 'USDJPY',
    direction: 'short',
    status: 'rejected',
    entryPrice: 154.500,
    stopLoss: 154.950,
    takeProfit: 153.200,
    currentPrice: 154.215,
    confidence: 68,
    strategy: 'Mean Reversion',
    tags: ['RSI Overbought', 'Resistance Level'],
    timeframe: '15m',
    riskReward: 2.88,
    riskPercent: 0.5,
    aiReasoning: 'Opportunity rejected due to weak trend alignment. Higher timeframes (Daily/H4) remain aggressively bullish, making counter-trend shorts high risk. Upcoming US Unemployment claims news releases pose high volatility risks.',
    confidenceBreakdown: {
      marketStructure: 55, trend: 30, momentum: 80, liquidity: 65, volume: 60,
      fairValueGap: 50, orderBlock: 55, breakOfStructure: 40, changeOfCharacter: 50,
      supportResistance: 88, ema: 40, vwap: 50, atr: 70, macd: 75, rsi: 90, adx: 50,
      bollingerBands: 85, averageDailyRange: 80, economicNews: 10, sessionQuality: 70,
      spread: 95, currencyStrength: 65, correlation: 50, historicalPattern: 68,
      riskReward: 88, overall: 68
    },
    createdAt: '2026-07-30T06:30:00Z',
    updatedAt: '2026-07-30T06:30:00Z',
  },
];

// ============================================================================
// Mock Economic Calendar Events
// ============================================================================

export const MOCK_ECONOMIC_EVENTS: EconomicEvent[] = [
  {
    id: 'evt-1',
    title: 'USD Core PCE Price Index (MoM)',
    country: 'USA',
    currency: 'USD',
    impact: 'high',
    forecast: '0.2%',
    previous: '0.3%',
    actual: '0.2%',
    date: '2026-07-30',
    time: '12:30',
    timestamp: '2026-07-30T12:30:00Z',
  },
  {
    id: 'evt-2',
    title: 'EUR German CPI (YoY)',
    country: 'GER',
    currency: 'EUR',
    impact: 'high',
    forecast: '2.4%',
    previous: '2.2%',
    actual: undefined,
    date: '2026-07-30',
    time: '13:00',
    timestamp: '2026-07-30T13:00:00Z',
  },
  {
    id: 'evt-3',
    title: 'GBP GDP (QoQ)',
    country: 'UK',
    currency: 'GBP',
    impact: 'high',
    forecast: '0.4%',
    previous: '0.2%',
    actual: undefined,
    date: '2026-07-31',
    time: '07:00',
    timestamp: '2026-07-31T07:00:00Z',
  },
  {
    id: 'evt-4',
    title: 'USD Unemployment Claims',
    country: 'USA',
    currency: 'USD',
    impact: 'medium',
    forecast: '215K',
    previous: '220K',
    actual: '212K',
    date: '2026-07-30',
    time: '12:30',
    timestamp: '2026-07-30T12:30:00Z',
  },
];

// ============================================================================
// Mock AI Status
// ============================================================================

export const MOCK_AI_STATUS: AIStatus = {
  status: 'watching',
  message: 'AI Operating System scanning markets. High liquidity NY session active.',
  currentPair: 'XAUUSD',
  requiredConfidence: 95,
  currentConfidence: 82,
  activeScanCount: 42,
  lastScanAt: new Date().toISOString(),
};

// ============================================================================
// Mock Journal Entries
// ============================================================================

export const MOCK_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'j-1',
    userId: 'user-1',
    tradeId: 'trade-closed-2',
    title: 'Perfect execution on GBPUSD Long',
    content: 'Followed the plan 100%. The H4 bullish block held up perfectly. I waited patiently for the lower timeframe CHoCH before triggering the trade. Moved stop to break even early because of liquidity pools, but target was smashed with minimal drawdown.',
    mood: 'disciplined',
    tags: ['GBPUSD', 'Smart Money Concepts', 'Winning Trade'],
    screenshots: [],
    lessons: ['Patience pays off', 'Wait for structural displacement before entry'],
    rating: 5,
    date: '2026-07-28',
    createdAt: '2026-07-28T19:00:00Z',
    updatedAt: '2026-07-28T19:00:00Z',
  },
];
