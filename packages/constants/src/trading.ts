// ============================================================================
// Trading Constants
// ============================================================================

export const FOREX_PAIRS = [
  // Majors
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  // Crosses
  'EURGBP', 'EURJPY', 'EURCHF', 'EURAUD', 'EURCAD', 'EURNZD',
  'GBPJPY', 'GBPCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD',
  'AUDJPY', 'AUDCHF', 'AUDCAD', 'AUDNZD',
  'NZDJPY', 'NZDCHF', 'NZDCAD',
  'CADJPY', 'CADCHF',
  'CHFJPY',
] as const;

export const CRYPTO_PAIRS = [
  'BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'DOTUSD',
  'LINKUSD', 'AVAXUSD', 'MATICUSD', 'UNIUSD',
] as const;

export const COMMODITY_PAIRS = [
  'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', // Metals
  'WTIUSD', 'BRNUSD', // Oil
  'NGASUSD', // Natural Gas
] as const;

export const INDEX_PAIRS = [
  'US30', 'US500', 'USTEC', 'UK100', 'DE40', 'JP225', 'AU200',
] as const;

export const ALL_PAIRS = [
  ...FOREX_PAIRS,
  ...CRYPTO_PAIRS,
  ...COMMODITY_PAIRS,
  ...INDEX_PAIRS,
] as const;

export const TIMEFRAMES = [
  { value: '1m', label: '1 Minute', shortLabel: '1M' },
  { value: '5m', label: '5 Minutes', shortLabel: '5M' },
  { value: '15m', label: '15 Minutes', shortLabel: '15M' },
  { value: '30m', label: '30 Minutes', shortLabel: '30M' },
  { value: '1h', label: '1 Hour', shortLabel: '1H' },
  { value: '4h', label: '4 Hours', shortLabel: '4H' },
  { value: '1d', label: '1 Day', shortLabel: '1D' },
  { value: '1w', label: '1 Week', shortLabel: '1W' },
  { value: '1M', label: '1 Month', shortLabel: '1MO' },
] as const;

export const TRADING_SESSIONS = {
  SYDNEY: { name: 'Sydney', startUTC: 21, endUTC: 6, emoji: '🇦🇺' },
  TOKYO: { name: 'Tokyo', startUTC: 0, endUTC: 9, emoji: '🇯🇵' },
  LONDON: { name: 'London', startUTC: 7, endUTC: 16, emoji: '🇬🇧' },
  NEW_YORK: { name: 'New York', startUTC: 12, endUTC: 21, emoji: '🇺🇸' },
} as const;
