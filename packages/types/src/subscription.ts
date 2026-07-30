import type { UUID, Timestamp } from './common';

// ============================================================================
// Subscription Types
// ============================================================================

export interface Subscription {
  id: UUID;
  userId: UUID;
  plan: PlanType;
  status: SubscriptionStatus;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  cancelAtPeriodEnd: boolean;
  paystackCustomerId?: string;
  paystackSubscriptionId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PlanType = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused';

export interface Plan {
  id: PlanType;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: PlanFeature[];
  limits: PlanLimits;
  isPopular: boolean;
}

export interface PlanFeature {
  name: string;
  included: boolean;
  description?: string;
}

export interface PlanLimits {
  maxSignalsPerDay: number;
  maxOpenTrades: number;
  maxBrokerConnections: number;
  aiChatMessages: number;
  historicalDataDays: number;
  customAlerts: number;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  apiAccess: boolean;
}
