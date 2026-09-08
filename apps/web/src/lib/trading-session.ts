/**
 * Institutional Trading Session Shield
 *
 * Enforces institutional session discipline across forex, commodity, and crypto markets.
 * Trading outside active session liquidity creates wide spreads, false breakouts, and high risk.
 * Crypto trades 24/7.
 */

export interface SessionShieldStatus {
  isEligible: boolean;
  isCrypto: boolean;
  currentUtcTime: string;
  sessionName: string;
  activeHours: string;
  nextOpenUtc: string;
  message: string;
}

import { isCryptoAsset, normalizePairSymbol } from '@/lib/assets-registry';

export function checkTradingSession(pair: string, customDate?: Date): SessionShieldStatus {
  const date = customDate || new Date();
  const utcDay = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const currentMinutes = utcHours * 60 + utcMinutes;
  const timeStr = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')} UTC`;

  const upper = normalizePairSymbol(pair);

  // 1. Crypto & Altcoin Pairs: 24/7 Perpetual Session
  const isCrypto = isCryptoAsset(upper);

  if (isCrypto) {
    return {
      isEligible: true,
      isCrypto: true,
      currentUtcTime: timeStr,
      sessionName: 'Crypto 24/7 Institutional Session',
      activeHours: 'Always Open (24/7)',
      nextOpenUtc: 'Active Now',
      message: `${upper} operates on a 24/7 institutional decentralized session. Liquidity verified.`,
    };
  }

  // 2. Traditional Forex & Metals Weekend Check
  // Friday closes at 21:00 UTC; Sunday reopens at 21:00 UTC (Sydney/Tokyo open)
  const isWeekend =
    utcDay === 6 || // Saturday all day
    (utcDay === 5 && currentMinutes >= 21 * 60) || // Friday after 21:00 UTC
    (utcDay === 0 && currentMinutes < 21 * 60); // Sunday before 21:00 UTC

  if (isWeekend) {
    return {
      isEligible: false,
      isCrypto: false,
      currentUtcTime: timeStr,
      sessionName: 'Weekend Market Close',
      activeHours: 'Sunday 21:00 UTC – Friday 21:00 UTC',
      nextOpenUtc: 'Sunday 21:00 UTC (Sydney Open)',
      message: `Forex and Commodity markets are closed for the weekend. Execution paused to protect capital until Sunday 21:00 UTC.`,
    };
  }

  // 3. Asset-Specific Intraday Sessions (Weekdays Sunday 21:00 UTC – Friday 21:00 UTC)
  const isGold = upper.includes('XAU') || upper.includes('GOLD');
  const isAsianPair = upper.includes('JPY') || upper.includes('AUD') || upper.includes('NZD');

  // Daily Rollover Spread Gap: 21:00 UTC to 22:00 UTC
  // Institutional inter-bank liquidity settlement. Broker spreads temporarily widen.
  const isRolloverGap = currentMinutes >= 21 * 60 && currentMinutes < 22 * 60;
  if (isRolloverGap) {
    return {
      isEligible: false,
      isCrypto: false,
      currentUtcTime: timeStr,
      sessionName: 'Daily Rollover Spread Gap',
      activeHours: '22:00 – 21:00 UTC (Next Day)',
      nextOpenUtc: '22:00 UTC (Tokyo Pre-Open)',
      message: `${upper} is in the daily interbank rollover gap (${timeStr}). Spreads temporarily widen during bank settlement. Reopening at 22:00 UTC.`,
    };
  }

  if (isGold) {
    // Peak volume: 07:00 to 21:00 UTC (London & NY)
    // Asian Gold trading: 22:00 to 07:00 UTC (Shanghai/Tokyo/Sydney)
    const isPeak = currentMinutes >= 7 * 60 && currentMinutes < 21 * 60;
    const isOverlap = currentMinutes >= 12 * 60 && currentMinutes <= 16 * 60 + 30;

    return {
      isEligible: true,
      isCrypto: false,
      currentUtcTime: timeStr,
      sessionName: isOverlap
        ? 'London / NY Overlap (Prime Volume)'
        : isPeak
        ? 'London & NY Gold Session'
        : 'Asian Gold Session (Tokyo / Shanghai)',
      activeHours: '22:00 – 21:00 UTC',
      nextOpenUtc: 'Active Now',
      message: isPeak
        ? `XAUUSD in active high-liquidity session. Favorable execution spreads.`
        : `XAUUSD in Asian session liquidity. Moderate volatility and slightly wider spreads.`,
    };
  }

  if (isAsianPair) {
    const isAsianPrime = currentMinutes < 7 * 60;
    return {
      isEligible: true,
      isCrypto: false,
      currentUtcTime: timeStr,
      sessionName: isAsianPrime
        ? 'Tokyo / Asian Session (Prime)'
        : currentMinutes < 12 * 60
        ? 'London Session'
        : 'London / NY Overlap',
      activeHours: '22:00 – 21:00 UTC',
      nextOpenUtc: 'Active Now',
      message: `${pair} in active trading session.`,
    };
  }

  // European / US Forex pairs (EURUSD, GBPUSD, EURGBP, USDCAD, USDCHF)
  // Active 24/5 with Peak London (07:00 UTC) through NY Close (21:00 UTC)
  const isEuroPeak = currentMinutes >= 7 * 60 && currentMinutes < 21 * 60;
  const isPrime = currentMinutes >= 12 * 60 && currentMinutes <= 16 * 60 + 30;

  return {
    isEligible: true,
    isCrypto: false,
    currentUtcTime: timeStr,
    sessionName: isPrime
      ? 'London / NY Overlap (Peak Volume)'
      : isEuroPeak
      ? 'Active London & NY Session'
      : 'Asian Intraday Session (Lower Volatility)',
    activeHours: '22:00 – 21:00 UTC',
    nextOpenUtc: 'Active Now',
    message: isEuroPeak
      ? `${pair} in active session with strong institutional volume.`
      : `${pair} trading in Asian session. Clean technical structure with moderate volatility.`,
  };
}
