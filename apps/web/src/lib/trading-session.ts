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

export function checkTradingSession(pair: string, customDate?: Date): SessionShieldStatus {
  const date = customDate || new Date();
  const utcDay = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const currentMinutes = utcHours * 60 + utcMinutes;
  const timeStr = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')} UTC`;

  const upper = pair.toUpperCase().replace('/', '').replace(' ', '');

  // 1. Crypto Pairs: 24/7 Perpetual Session
  const isCrypto =
    upper.includes('BTC') ||
    upper.includes('ETH') ||
    upper.includes('SOL') ||
    upper.includes('CRYPTO');

  if (isCrypto) {
    return {
      isEligible: true,
      isCrypto: true,
      currentUtcTime: timeStr,
      sessionName: 'Crypto 24/7 Institutional Session',
      activeHours: 'Always Open (24/7)',
      nextOpenUtc: 'Active Now',
      message: `${pair} operates on a 24/7 institutional decentralized session. Liquidity verified.`,
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

  // 3. Asset-Specific Intraday Sessions
  const isGold = upper.includes('XAU') || upper.includes('GOLD');
  const isAsianPair = upper.includes('JPY') || upper.includes('AUD') || upper.includes('NZD');

  // Asian / Tokyo Session: 00:00 to 09:00 UTC
  // London Session: 08:00 to 16:30 UTC
  // New York Session: 13:00 to 21:00 UTC
  // London / NY Overlap: 13:00 to 16:30 UTC

  if (isGold) {
    // Gold peak institutional liquidity: 07:00 UTC (London/Frankfurt Open) to 21:00 UTC (NY Close)
    const goldStart = 7 * 60; // 07:00 UTC (08:00 BST / European open)
    const goldEnd = 21 * 60; // 21:00 UTC
    const isOpen = currentMinutes >= goldStart && currentMinutes < goldEnd;

    if (!isOpen) {
      return {
        isEligible: false,
        isCrypto: false,
        currentUtcTime: timeStr,
        sessionName: 'London & New York Gold Session',
        activeHours: '07:00 – 21:00 UTC',
        nextOpenUtc: '07:00 UTC (London Open)',
        message: `XAUUSD is outside active London & New York session hours (${timeStr}). Outside session, institutional spreads widen and erratic wicks occur. Please wait until 07:00 UTC.`,
      };
    }

    const isOverlap = currentMinutes >= 12 * 60 && currentMinutes <= 16 * 60 + 30;
    return {
      isEligible: true,
      isCrypto: false,
      currentUtcTime: timeStr,
      sessionName: isOverlap ? 'London / NY Overlap (Prime)' : 'London & NY Gold Session',
      activeHours: '07:00 – 21:00 UTC',
      nextOpenUtc: 'Active Now',
      message: `XAUUSD in active high-liquidity session. Favorable execution spreads.`,
    };
  }

  if (isAsianPair) {
    // JPY / AUD / NZD pairs are active during Asian Session (00:00 - 09:00 UTC), London (07:00 - 16:30 UTC), and NY (12:00 - 21:00 UTC)
    // Dead zone: 21:00 UTC to 00:00 UTC (End of NY to Tokyo Open)
    const deadStart = 21 * 60;
    const isDeadZone = currentMinutes >= deadStart;

    if (isDeadZone) {
      return {
        isEligible: false,
        isCrypto: false,
        currentUtcTime: timeStr,
        sessionName: 'Inter-Session Liquidity Gap',
        activeHours: '00:00 – 21:00 UTC',
        nextOpenUtc: '00:00 UTC (Tokyo Open)',
        message: `${pair} is in the daily inter-session rollover gap (${timeStr}). Spreads are inflated. Resuming at 00:00 UTC Tokyo open.`,
      };
    }

    return {
      isEligible: true,
      isCrypto: false,
      currentUtcTime: timeStr,
      sessionName: currentMinutes < 7 * 60 ? 'Tokyo / Asian Session' : currentMinutes < 12 * 60 ? 'London Session' : 'London / NY Overlap',
      activeHours: '00:00 – 21:00 UTC',
      nextOpenUtc: 'Active Now',
      message: `${pair} in active trading session.`,
    };
  }

  // European / US Forex pairs (EURUSD, GBPUSD, EURGBP, USDCAD, USDCHF)
  // Active London (07:00 UTC / 08:00 BST) through New York close (21:00 UTC)
  const euroStart = 7 * 60; // 07:00 UTC
  const euroEnd = 21 * 60; // 21:00 UTC
  const isEuroActive = currentMinutes >= euroStart && currentMinutes < euroEnd;

  if (!isEuroActive) {
    return {
      isEligible: false,
      isCrypto: false,
      currentUtcTime: timeStr,
      sessionName: 'London & New York Forex Session',
      activeHours: '07:00 – 21:00 UTC',
      nextOpenUtc: '07:00 UTC (London Open)',
      message: `${pair} is outside active London & NY session hours (${timeStr}). Low volatility chop detected. Wait until 07:00 UTC London opening bells.`,
    };
  }

  const isPrime = currentMinutes >= 12 * 60 && currentMinutes <= 16 * 60 + 30;
  return {
    isEligible: true,
    isCrypto: false,
    currentUtcTime: timeStr,
    sessionName: isPrime ? 'London / NY Overlap (Peak Volume)' : 'Active London Session',
    activeHours: '07:00 – 21:00 UTC',
    nextOpenUtc: 'Active Now',
    message: `${pair} in active session with strong institutional volume.`,
  };
}
