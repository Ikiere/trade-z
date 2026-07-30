import type { UUID, Timestamp } from './common';

// ============================================================================
// Market Data Types
// ============================================================================

export interface MarketData {
  pair: string;
  bid: number;
  ask: number;
  spread: number;
  high: number;
  low: number;
  open: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: Timestamp;
}

export interface Candle {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Ticker {
  pair: string;
  name: string;
  category: AssetCategory;
  bid: number;
  ask: number;
  spread: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export type AssetCategory = 'forex' | 'crypto' | 'stocks' | 'commodities' | 'indices';

export interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  forecast?: string;
  previous?: string;
  actual?: string;
  date: string;
  time: string;
  timestamp: Timestamp;
}
