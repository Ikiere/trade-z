// ============================================================================
// Trade Calculation Utilities
// ============================================================================

/**
 * Calculate pip value for a given pair
 */
export function calculatePipValue(pair: string, lotSize: number): number {
  const isJpy = pair.toUpperCase().includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  // Standard lot = 100,000 units
  return pipSize * (lotSize * 100000);
}

/**
 * Calculate pips between two prices
 */
export function calculatePips(
  entryPrice: number,
  exitPrice: number,
  pair: string,
  direction: 'long' | 'short'
): number {
  const isJpy = pair.toUpperCase().includes('JPY');
  const multiplier = isJpy ? 100 : 10000;
  const diff =
    direction === 'long'
      ? (exitPrice - entryPrice) * multiplier
      : (entryPrice - exitPrice) * multiplier;
  return Math.round(diff * 10) / 10;
}

/**
 * Calculate risk-reward ratio
 */
export function calculateRiskReward(
  entry: number,
  stopLoss: number,
  takeProfit: number,
  direction: 'long' | 'short'
): number {
  let risk: number;
  let reward: number;

  if (direction === 'long') {
    risk = Math.abs(entry - stopLoss);
    reward = Math.abs(takeProfit - entry);
  } else {
    risk = Math.abs(stopLoss - entry);
    reward = Math.abs(entry - takeProfit);
  }

  if (risk === 0) return 0;
  return Math.round((reward / risk) * 100) / 100;
}

/**
 * Calculate position size based on risk
 */
export function calculatePositionSize(
  accountBalance: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number,
  pair: string
): number {
  const riskAmount = accountBalance * (riskPercent / 100);
  const isJpy = pair.toUpperCase().includes('JPY');
  const pipValue = isJpy ? 0.01 : 0.0001;
  const stopLossPips = Math.abs(entryPrice - stopLoss) / pipValue;

  if (stopLossPips === 0) return 0;

  // Calculate lot size (1 standard lot = 100,000 units)
  const pipValuePerLot = pipValue * 100000;
  const lotSize = riskAmount / (stopLossPips * pipValuePerLot);

  return Math.round(lotSize * 100) / 100;
}

/**
 * Calculate P&L
 */
export function calculatePnL(
  entryPrice: number,
  exitPrice: number,
  lotSize: number,
  direction: 'long' | 'short',
  pair: string
): number {
  const isJpy = pair.toUpperCase().includes('JPY');
  const multiplier = isJpy ? 100 : 10000;
  const units = lotSize * 100000;

  if (direction === 'long') {
    return ((exitPrice - entryPrice) * multiplier * units) / multiplier;
  } else {
    return ((entryPrice - exitPrice) * multiplier * units) / multiplier;
  }
}

/**
 * Calculate win rate
 */
export function calculateWinRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 10000) / 100;
}

/**
 * Calculate profit factor
 */
export function calculateProfitFactor(
  grossProfit: number,
  grossLoss: number
): number {
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return Math.round((grossProfit / Math.abs(grossLoss)) * 100) / 100;
}
