/**
 * Signal Validity and Live Price Evaluation Engine
 * Evaluates whether a signal is still actionable based on:
 * 1. Time to place elapsed (timeframe-based window)
 * 2. Current price vs Take Profit, Stop Loss, and Entry Price
 */

export interface SignalPriceParameters {
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  direction: 'long' | 'short';
  timeframe?: string;
  created_at: string;
  status: 'pending' | 'active' | 'executed' | 'expired' | 'rejected' | 'cancelled';
}

export interface SignalValidity {
  isValid: boolean;         // True if the setup can still be actively placed
  isExpired: boolean;       // True if no longer actionable (time elapsed, TP hit, SL hit, run away)
  badgeText: string;        // 'VALID' | 'EXPIRED' | 'TP HIT' | 'SL HIT' | 'MISSED ENTRY' | 'REJECTED' | 'EXECUTED'
  badgeBg: string;          // Tailwind background and border styling
  badgeColor: string;       // Tailwind text color
  reason: string;           // Clear user-facing explanation
  currentPrice: number;     // The resolved live/current market price
  priceDiffPips: number;    // Pip difference between current price and entry price
  isPipsFavorable: boolean; // Whether current price is at or better than entry
  timeRemaining?: string;   // Remaining actionable window e.g. "45m left" or "Expired 2h ago"
}

/**
 * Base market quotes used as anchors
 */
export const BASE_MARKET_PRICES: Record<string, number> = {
  EURUSD: 1.0845,
  GBPUSD: 1.2680,
  USDJPY: 154.20,
  XAUUSD: 2850.50,
  GOLD: 2850.50,
  BTCUSD: 88500.0,
  ETHUSD: 2820.0,
  AUDUSD: 0.6650,
  USDCAD: 1.3620,
  NZDUSD: 0.5890,
  USDCHF: 0.8840,
  EURGBP: 0.8550,
  EURJPY: 167.30,
  GBPJPY: 195.50,
};

/**
 * Returns pip decimal scale for a given asset
 */
export function getPipMultiplier(symbol: string): number {
  const sym = symbol.toUpperCase();
  if (sym.includes('JPY')) return 100; // 0.01 = 1 pip
  if (sym.includes('XAU') || sym.includes('GOLD')) return 10; // 0.10 = 1 point/pip
  if (sym.includes('BTC') || sym.includes('ETH')) return 1; // 1 USD = 1 point
  return 10000; // 0.0001 = 1 pip for standard forex
}

export function getPriceDecimals(symbol: string): number {
  const sym = symbol.toUpperCase();
  if (sym.includes('JPY')) return 3;
  if (sym.includes('XAU') || sym.includes('GOLD') || sym.includes('BTC') || sym.includes('ETH')) return 2;
  return 5;
}

/**
 * Get time-to-place window in milliseconds based on timeframe
 */
export function getActionableWindowMs(timeframe: string = '15m'): number {
  const tf = timeframe.toLowerCase();
  if (tf.includes('1m') || tf.includes('5m')) return 45 * 60 * 1000; // 45 mins
  if (tf.includes('15m')) return 90 * 60 * 1000; // 1.5 hours
  if (tf.includes('30m')) return 3 * 60 * 60 * 1000; // 3 hours
  if (tf.includes('1h') || tf.includes('60')) return 5 * 60 * 60 * 1000; // 5 hours
  if (tf.includes('4h') || tf.includes('240')) return 16 * 60 * 60 * 1000; // 16 hours
  if (tf.includes('1d') || tf.includes('d')) return 36 * 60 * 60 * 1000; // 36 hours
  return 2 * 60 * 60 * 1000; // default 2 hours
}

/**
 * Resolve live price with micro-fluctuation anchor if direct feed isn't passed
 */
export function resolveCurrentPrice(symbol: string, passedPrice?: number): number {
  if (passedPrice && passedPrice > 0) return passedPrice;

  const sym = symbol.toUpperCase().replace('/', '');
  const base = BASE_MARKET_PRICES[sym] || 1.0000;
  const decimals = getPriceDecimals(sym);

  return Number(base.toFixed(decimals));
}

/**
 * Evaluates whether a signal is still actionable or has expired
 */
export function evaluateSignalValidity(
  signal: SignalPriceParameters,
  currentPrice?: number
): SignalValidity {
  const entry = Number(signal.entry_price);
  const sl = Number(signal.stop_loss);
  const tp = Number(signal.take_profit);
  const isLong = signal.direction === 'long';
  const pipMult = getPipMultiplier(signal.timeframe || 'EURUSD');
  const decimals = getPriceDecimals(signal.timeframe || 'EURUSD');

  const resolvedPrice = Number((currentPrice || entry).toFixed(decimals));
  const diffFromEntry = isLong ? (resolvedPrice - entry) : (entry - resolvedPrice);
  const priceDiffPips = Number((diffFromEntry * pipMult).toFixed(1));

  // 1. Check explicit non-active database status
  if (signal.status === 'rejected') {
    return {
      isValid: false,
      isExpired: true,
      badgeText: 'REJECTED',
      badgeBg: 'bg-red-500/10 border-red-500/20',
      badgeColor: 'text-red-400',
      reason: 'Setup was flagged as risky by AI confluence filter.',
      currentPrice: resolvedPrice,
      priceDiffPips,
      isPipsFavorable: false,
    };
  }

  if (signal.status === 'executed') {
    return {
      isValid: false,
      isExpired: false,
      badgeText: 'EXECUTED',
      badgeBg: 'bg-blue-500/10 border-blue-500/20',
      badgeColor: 'text-blue-400',
      reason: 'Trade has already been executed on the broker.',
      currentPrice: resolvedPrice,
      priceDiffPips,
      isPipsFavorable: true,
    };
  }

  if (signal.status === 'cancelled') {
    return {
      isValid: false,
      isExpired: true,
      badgeText: 'CANCELLED',
      badgeBg: 'bg-slate-500/10 border-slate-500/20',
      badgeColor: 'text-slate-400',
      reason: 'Signal was manually or automatically cancelled.',
      currentPrice: resolvedPrice,
      priceDiffPips,
      isPipsFavorable: false,
    };
  }

  // 2. Check Time to Place Expiration
  const createdAtMs = new Date(signal.created_at).getTime();
  const nowMs = Date.now();
  const windowMs = getActionableWindowMs(signal.timeframe);
  const elapsedMs = nowMs - createdAtMs;

  let timeRemaining = '';
  const remainingMs = windowMs - elapsedMs;
  if (remainingMs > 0) {
    const mins = Math.floor(remainingMs / (60 * 1000));
    timeRemaining = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${mins}m left`;
  } else {
    const passedMins = Math.floor(Math.abs(remainingMs) / (60 * 1000));
    timeRemaining = passedMins >= 60 ? `Expired ${Math.floor(passedMins / 60)}h ago` : `Expired ${passedMins}m ago`;
  }

  if (elapsedMs > windowMs || signal.status === 'expired') {
    return {
      isValid: false,
      isExpired: true,
      badgeText: 'EXPIRED',
      badgeBg: 'bg-slate-500/15 border-slate-500/30',
      badgeColor: 'text-slate-400',
      reason: `Actionable entry window closed (${timeRemaining}). Market conditions have shifted.`,
      currentPrice: resolvedPrice,
      priceDiffPips,
      isPipsFavorable: false,
      timeRemaining,
    };
  }

  // 3. Price Comparison Check: Take Profit reached
  if (tp > 0) {
    if ((isLong && resolvedPrice >= tp) || (!isLong && resolvedPrice <= tp)) {
      return {
        isValid: false,
        isExpired: true,
        badgeText: 'TP HIT',
        badgeBg: 'bg-amber-500/15 border-amber-500/30',
        badgeColor: 'text-amber-400',
        reason: `Target reached at ${resolvedPrice.toFixed(decimals)}. Move completed — do not enter now.`,
        currentPrice: resolvedPrice,
        priceDiffPips,
        isPipsFavorable: true,
        timeRemaining,
      };
    }
  }

  // 4. Price Comparison Check: Stop Loss breached
  if (sl > 0) {
    if ((isLong && resolvedPrice <= sl) || (!isLong && resolvedPrice >= sl)) {
      return {
        isValid: false,
        isExpired: true,
        badgeText: 'SL HIT',
        badgeBg: 'bg-red-500/15 border-red-500/30',
        badgeColor: 'text-red-400',
        reason: `Stop loss level breached at ${resolvedPrice.toFixed(decimals)}. Trade setup is invalidated.`,
        currentPrice: resolvedPrice,
        priceDiffPips,
        isPipsFavorable: false,
        timeRemaining,
      };
    }
  }

  // 5. Price Comparison Check: Price ran too far past entry
  if (tp > 0 && entry > 0) {
    const totalTargetDist = Math.abs(tp - entry);
    const progressTowardTp = isLong ? (resolvedPrice - entry) : (entry - resolvedPrice);

    // If price moved >40% towards TP, entering now would destroy the Risk:Reward ratio
    if (progressTowardTp > totalTargetDist * 0.40) {
      return {
        isValid: false,
        isExpired: true,
        badgeText: 'MISSED ENTRY',
        badgeBg: 'bg-orange-500/15 border-orange-500/30',
        badgeColor: 'text-orange-400',
        reason: `Price already rallied ${priceDiffPips} pips past entry (+${Math.round((progressTowardTp / totalTargetDist) * 100)}% to TP). Risk/Reward no longer viable.`,
        currentPrice: resolvedPrice,
        priceDiffPips,
        isPipsFavorable: false,
        timeRemaining,
      };
    }
  }

  // 6. Signal is Active and fully Valid / Enterable!
  const isFavorable = diffFromEntry >= -0.0002;
  return {
    isValid: true,
    isExpired: false,
    badgeText: 'ACTIVE',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/30',
    badgeColor: 'text-emerald-400',
    reason: `Setup valid and in actionable zone (${timeRemaining}).`,
    currentPrice: resolvedPrice,
    priceDiffPips,
    isPipsFavorable: isFavorable,
    timeRemaining,
  };
}
