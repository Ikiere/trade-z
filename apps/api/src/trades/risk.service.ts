import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class RiskService {
  /**
   * Validate if a trade conforms to risk management limits
   */
  async validateTrade(
    balance: number,
    equity: number,
    stopLossDistancePips: number,
    riskPercent: number,
    maxDailyLossPercent: number,
    currentDailyLossPercent: number,
    currentOpenPositionsCount: number,
    maxOpenPositionsLimit: number,
  ): Promise<boolean> {
    // 1. Drawdown Guard
    if (currentDailyLossPercent >= maxDailyLossPercent) {
      throw new BadRequestException(
        `Risk violation: Daily drawdown limit hit (${currentDailyLossPercent}% / ${maxDailyLossPercent}%). No new trades allowed.`,
      );
    }

    // 2. Max Open Positions Guard
    if (currentOpenPositionsCount >= maxOpenPositionsLimit) {
      throw new BadRequestException(
        `Risk violation: Maximum open positions limit reached (${currentOpenPositionsCount} / ${maxOpenPositionsLimit}).`,
      );
    }

    // 3. Distance Guard
    if (stopLossDistancePips <= 0) {
      throw new BadRequestException('Stop Loss distance must be greater than zero pips.');
    }

    // 4. Strict Risk Budget Enforcement (Zero Affordable Override)
    const riskBudget = balance * (riskPercent / 100);
    const lossAtMinLot = stopLossDistancePips * 0.01 * 10.0;
    if (balance > 0 && lossAtMinLot > riskBudget) {
      throw new BadRequestException(
        `UNEXECUTABLE_AT_BROKER_MIN_VOLUME: Stop loss risk at minimum broker lot 0.01 (~$${lossAtMinLot.toFixed(2)}) ` +
        `exceeds approved risk budget ($${riskBudget.toFixed(2)}). Trade rejected by Capital Shield.`,
      );
    }

    return true;
  }

  /**
   * Calculate position size in lots strictly clamped to risk budget and rounded DOWN to step
   */
  calculateLotSize(
    balance: number,
    riskPercent: number,
    stopLossDistancePips: number,
    pipValueUsd: number = 10.0,
    minVolume: number = 0.01,
    volStep: number = 0.01,
  ): number {
    const riskBudget = balance * (riskPercent / 100);
    const lossPerLot = stopLossDistancePips * pipValueUsd;
    if (lossPerLot <= 0) return 0.0;
    const rawLotSize = riskBudget / lossPerLot;
    
    // Round DOWN to nearest broker volume step
    const stepped = Math.floor(rawLotSize / volStep) * volStep;
    const rounded = Math.round(stepped * 100) / 100;
    if (rounded < minVolume) {
      return 0.0; // Unexecutable at broker minimum volume
    }
    return rounded;
  }
}
