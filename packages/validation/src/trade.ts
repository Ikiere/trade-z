import { z } from 'zod';

// ============================================================================
// Trade Validation Schemas
// ============================================================================

export const createTradeSchema = z.object({
  pair: z.string().min(1, 'Trading pair is required'),
  direction: z.enum(['long', 'short'], { required_error: 'Direction is required' }),
  type: z.enum(['market', 'limit', 'stop'], { required_error: 'Trade type is required' }),
  entryPrice: z.number().positive('Entry price must be positive'),
  stopLoss: z.number().positive('Stop loss must be positive'),
  takeProfit: z.number().positive('Take profit must be positive'),
  lotSize: z
    .number()
    .positive('Lot size must be positive')
    .max(100, 'Lot size cannot exceed 100'),
  riskPercent: z
    .number()
    .min(0.1, 'Risk must be at least 0.1%')
    .max(10, 'Risk cannot exceed 10%'),
  brokerId: z.string().uuid().optional(),
});

export const updateTradeSchema = z.object({
  stopLoss: z.number().positive('Stop loss must be positive').optional(),
  takeProfit: z.number().positive('Take profit must be positive').optional(),
  lotSize: z.number().positive('Lot size must be positive').optional(),
});

export const closeTradeSchema = z.object({
  exitPrice: z.number().positive('Exit price must be positive').optional(),
  reason: z.string().optional(),
});

export type CreateTradeInput = z.infer<typeof createTradeSchema>;
export type UpdateTradeInput = z.infer<typeof updateTradeSchema>;
export type CloseTradeInput = z.infer<typeof closeTradeSchema>;
