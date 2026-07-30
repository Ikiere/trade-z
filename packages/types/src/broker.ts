import type { UUID, Timestamp } from './common';

// ============================================================================
// Broker Types
// ============================================================================

export interface BrokerConnection {
  id: UUID;
  userId: UUID;
  broker: BrokerType;
  name: string;
  status: BrokerStatus;
  accountId?: string;
  server?: string;
  // Connection details (encrypted)
  isDemo: boolean;
  isPrimary: boolean;
  lastSyncAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BrokerType =
  | 'paper'
  | 'mt4'
  | 'mt5'
  | 'ctrader'
  | 'interactive_brokers'
  | 'oanda'
  | 'alpaca';

export type BrokerStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'expired'
  | 'pending';

export interface BrokerAccount {
  brokerId: UUID;
  accountNumber: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  currency: string;
  server: string;
  isDemo: boolean;
}
