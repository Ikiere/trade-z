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

    // 4. Small Account Dollar Risk Guard (<$150 balance)
    if (balance > 0 && balance < 150) {
      const dollarRiskAt001 = stopLossDistancePips * 0.01 * 10.0;
      const maxAllowedRisk = Math.min(3.50, Math.max(1.50, balance * 0.05));
      if (dollarRiskAt001 > maxAllowedRisk) {
        throw new BadRequestException(
          `AI Capital Shield: Stop loss risk (~$${dollarRiskAt001.toFixed(2)}) exceeds safe 5% risk ($${maxAllowedRisk.toFixed(2)}) for your $${balance.toFixed(2)} balance. Trade Major Forex pairs (EURUSD, GBPUSD) with tighter stops.`,
        );
      }
    }

    return true;
  }

  /**
   * Calculate position size in lots
   */
  calculateLotSize(
    balance: number,
    riskPercent: number,
    stopLossDistancePips: number,
    pipValueUsd: number = 10.0, // standard lot pip value
  ): number {
    const riskAmount = balance * (riskPercent / 100);
    const rawLotSize = riskAmount / (stopLossDistancePips * pipValueUsd);
    
    // Round to 2 decimal places (standard broker precision)
    return Math.max(0.01, Math.round(rawLotSize * 100) / 100);
  }
}
