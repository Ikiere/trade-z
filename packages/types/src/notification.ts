import type { UUID, Timestamp } from './common';

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: UUID;
  userId: UUID;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

export type NotificationType =
  | 'signal_new'
  | 'signal_expired'
  | 'trade_opened'
  | 'trade_closed'
  | 'trade_modified'
  | 'trade_stopped_out'
  | 'trade_take_profit'
  | 'ai_alert'
  | 'news_alert'
  | 'broker_connected'
  | 'broker_disconnected'
  | 'subscription_updated'
  | 'daily_summary'
  | 'system';

// ============================================================================
// Trade Journal Types
// ============================================================================

export interface JournalEntry {
  id: UUID;
  userId: UUID;
  tradeId?: UUID;
  title: string;
  content: string;
  mood: TradingMood;
  tags: string[];
  screenshots: string[];
  lessons: string[];
  rating: number; // 1-5
  date: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TradingMood =
  | 'confident'
  | 'cautious'
  | 'anxious'
  | 'frustrated'
  | 'disciplined'
  | 'greedy'
  | 'fearful'
  | 'neutral';
