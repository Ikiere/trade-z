import { z } from 'zod';

// ============================================================================
// User Validation Schemas
// ============================================================================

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  bio: z.string().max(500).optional(),
  timezone: z.string().optional(),
  preferredCurrency: z.string().optional(),
  tradingExperience: z
    .enum(['beginner', 'intermediate', 'advanced', 'professional'])
    .optional(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
});

export const updateSettingsSchema = z.object({
  defaultLotSize: z.number().positive().max(100).optional(),
  maxDailyLoss: z.number().positive().optional(),
  maxOpenTrades: z.number().int().positive().max(50).optional(),
  defaultRiskPerTrade: z.number().min(0.1).max(10).optional(),
  tradingMode: z.enum(['manual', 'semi_automatic', 'fully_automatic']).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  signalAlerts: z.boolean().optional(),
  tradeAlerts: z.boolean().optional(),
  newsAlerts: z.boolean().optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  chartStyle: z.enum(['candlestick', 'line', 'area']).optional(),
  language: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
