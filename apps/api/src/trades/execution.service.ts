import { Injectable } from '@nestjs/common';
import { TradesService } from './trades.service';

@Injectable()
export class ExecutionService {
  constructor(private readonly tradesService: TradesService) {}

  /**
   * Processes incoming AI Trade signals based on execution modes:
   * - Manual: Stores signal only.
   * - Semi-Auto: Trigger execution alert.
   * - Fully-Auto: Place order autonomously.
   */
  async processSignal(
    userId: string,
    mode: 'manual' | 'semi_automatic' | 'fully_automatic',
    signal: {
      pair: string;
      direction: 'long' | 'short';
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      confidence: number;
    },
  ) {
    if (mode === 'fully_automatic') {
      // Execute automatically if confluences pass parameters checks
      if (signal.confidence >= 85.0) {
        return this.tradesService.executeTrade(userId, {
          pair: signal.pair,
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          riskPercent: 1.0, // default Auto risk percent limit
        });
      }
    }
    
    // Manual/Semi-Auto modes just return the signal alert payload
    return {
      status: 'pending_approval',
      mode,
      signal,
    };
  }
}
