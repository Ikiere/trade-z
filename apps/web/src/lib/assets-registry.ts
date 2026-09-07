/**
 * Comprehensive Trade-Z Asset Registry
 * Supports all major & minor Forex pairs, commodities, indices, and an expansive catalog
 * of Top Altcoins (L1s, L2s, AI, DeFi, Memecoins).
 * Also provides dynamic classification for ANY arbitrary new pair or token.
 */

export interface AssetDefinition {
  symbol: string;
  name: string;
  category: 'crypto' | 'forex' | 'commodity' | 'index';
  subCategory?: string;
  decimals: number;
  pipMultiplier: number;
  pipSize?: number;
  basePrice: number;
  is24_7: boolean;
  isCrypto?: boolean;
  description: string;
}

export const CURATED_ASSETS: AssetDefinition[] = [
  // ── 🪙 Crypto: Layer 1 & Layer 2 ─────────────────────────────────
  { symbol: 'BTCUSD', name: 'Bitcoin', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 88500.0, is24_7: true, description: 'Apex cryptocurrency & market compass' },
  { symbol: 'ETHUSD', name: 'Ethereum', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 2820.0, is24_7: true, description: 'Smart contract foundation' },
  { symbol: 'SOLUSD', name: 'Solana', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 195.5, is24_7: true, description: 'High-throughput Layer 1' },
  { symbol: 'BNBUSD', name: 'BNB', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 650.0, is24_7: true, description: 'BNB Chain utility & gas' },
  { symbol: 'XRPUSD', name: 'XRP', category: 'crypto', subCategory: 'l1_l2', decimals: 4, pipMultiplier: 100.0, basePrice: 2.45, is24_7: true, description: 'Cross-border liquidity network' },
  { symbol: 'ADAUSD', name: 'Cardano', category: 'crypto', subCategory: 'l1_l2', decimals: 4, pipMultiplier: 100.0, basePrice: 0.82, is24_7: true, description: 'Proof-of-Stake smart contract chain' },
  { symbol: 'AVAXUSD', name: 'Avalanche', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 32.5, is24_7: true, description: 'High-speed subnet architecture' },
  { symbol: 'SUIUSD', name: 'Sui Network', category: 'crypto', subCategory: 'l1_l2', decimals: 4, pipMultiplier: 100.0, basePrice: 3.15, is24_7: true, description: 'Next-gen Move-based high speed L1' },
  { symbol: 'NEARUSD', name: 'NEAR Protocol', category: 'crypto', subCategory: 'l1_l2', decimals: 3, pipMultiplier: 10.0, basePrice: 6.20, is24_7: true, description: 'Sharded developer-focused L1' },
  { symbol: 'APTUSD', name: 'Aptos', category: 'crypto', subCategory: 'l1_l2', decimals: 3, pipMultiplier: 10.0, basePrice: 8.90, is24_7: true, description: 'Move language scalable L1' },
  { symbol: 'DOTUSD', name: 'Polkadot', category: 'crypto', subCategory: 'l1_l2', decimals: 3, pipMultiplier: 10.0, basePrice: 7.40, is24_7: true, description: 'Interoperability multi-chain protocol' },
  { symbol: 'TONUSD', name: 'Toncoin', category: 'crypto', subCategory: 'l1_l2', decimals: 3, pipMultiplier: 10.0, basePrice: 5.80, is24_7: true, description: 'Telegram decentralized ecosystem' },
  { symbol: 'SEIUSD', name: 'Sei Network', category: 'crypto', subCategory: 'l1_l2', decimals: 4, pipMultiplier: 100.0, basePrice: 0.52, is24_7: true, description: 'Sector-specific trading L1' },
  { symbol: 'KASUSD', name: 'Kaspa', category: 'crypto', subCategory: 'l1_l2', decimals: 4, pipMultiplier: 100.0, basePrice: 0.16, is24_7: true, description: 'BlockDAG proof-of-work protocol' },
  { symbol: 'FTMUSD', name: 'Sonic (Fantom)', category: 'crypto', subCategory: 'l1_l2', decimals: 4, pipMultiplier: 100.0, basePrice: 0.78, is24_7: true, description: 'Ultra-fast EVM Layer 1' },
  { symbol: 'INJUSD', name: 'Injective', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 24.5, is24_7: true, description: 'Finance-optimized Layer 1' },
  { symbol: 'TIAUSD', name: 'Celestia', category: 'crypto', subCategory: 'l1_l2', decimals: 3, pipMultiplier: 10.0, basePrice: 5.10, is24_7: true, description: 'Modular data availability layer' },
  { symbol: 'LTCUSD', name: 'Litecoin', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 112.0, is24_7: true, description: 'Peer-to-peer payment classic' },
  { symbol: 'BCHUSD', name: 'Bitcoin Cash', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 420.0, is24_7: true, description: 'High-capacity Bitcoin fork' },
  { symbol: 'ATOMUSD', name: 'Cosmos', category: 'crypto', subCategory: 'l1_l2', decimals: 3, pipMultiplier: 10.0, basePrice: 6.80, is24_7: true, description: 'Internet of Blockchains Hub' },
  { symbol: 'ICPUSD', name: 'Internet Computer', category: 'crypto', subCategory: 'l1_l2', decimals: 2, pipMultiplier: 1.0, basePrice: 11.5, is24_7: true, description: 'Decentralized cloud compute' },
  { symbol: 'HBARUSD', name: 'Hedera', category: 'crypto', subCategory: 'l1_l2', decimals: 4, pipMultiplier: 100.0, basePrice: 0.28, is24_7: true, description: 'Enterprise Hashgraph ledger' },

  // ── 🤖 Crypto: AI & DePIN Altcoins ──────────────────────────────
  { symbol: 'RENDERUSD', name: 'Render Token', category: 'crypto', subCategory: 'ai_depin', decimals: 3, pipMultiplier: 10.0, basePrice: 7.20, is24_7: true, description: 'Decentralized GPU rendering & AI compute' },
  { symbol: 'FETUSD', name: 'Artificial Superintelligence', category: 'crypto', subCategory: 'ai_depin', decimals: 4, pipMultiplier: 100.0, basePrice: 1.45, is24_7: true, description: 'Autonomous AI agent ecosystem' },
  { symbol: 'TAOUSD', name: 'Bittensor', category: 'crypto', subCategory: 'ai_depin', decimals: 2, pipMultiplier: 1.0, basePrice: 520.0, is24_7: true, description: 'Decentralized open-source machine learning' },
  { symbol: 'GRTUSD', name: 'The Graph', category: 'crypto', subCategory: 'ai_depin', decimals: 4, pipMultiplier: 100.0, basePrice: 0.22, is24_7: true, description: 'Blockchain indexing & query layer' },
  { symbol: 'ARUSD', name: 'Arweave', category: 'crypto', subCategory: 'ai_depin', decimals: 2, pipMultiplier: 1.0, basePrice: 18.5, is24_7: true, description: 'Permanent decentralized storage network' },
  { symbol: 'THETAUSD', name: 'Theta Network', category: 'crypto', subCategory: 'ai_depin', decimals: 3, pipMultiplier: 10.0, basePrice: 1.85, is24_7: true, description: 'Decentralized video & AI edge delivery' },

  // ── 🦄 Crypto: DeFi & Infrastructure ────────────────────────────
  { symbol: 'LINKUSD', name: 'Chainlink', category: 'crypto', subCategory: 'defi', decimals: 2, pipMultiplier: 1.0, basePrice: 17.5, is24_7: true, description: 'Decentralized institutional oracle network' },
  { symbol: 'UNIUSD', name: 'Uniswap', category: 'crypto', subCategory: 'defi', decimals: 3, pipMultiplier: 10.0, basePrice: 9.80, is24_7: true, description: 'Leading decentralized automated market maker' },
  { symbol: 'AAVEUSD', name: 'Aave', category: 'crypto', subCategory: 'defi', decimals: 2, pipMultiplier: 1.0, basePrice: 215.0, is24_7: true, description: 'Decentralized non-custodial liquidity market' },
  { symbol: 'ARBUSD', name: 'Arbitrum', category: 'crypto', subCategory: 'defi', decimals: 4, pipMultiplier: 100.0, basePrice: 0.72, is24_7: true, description: 'Leading Ethereum Optimistic Rollup L2' },
  { symbol: 'OPUSD', name: 'Optimism', category: 'crypto', subCategory: 'defi', decimals: 3, pipMultiplier: 10.0, basePrice: 1.65, is24_7: true, description: 'Superchain EVM rollup ecosystem' },
  { symbol: 'PENDLEUSD', name: 'Pendle Finance', category: 'crypto', subCategory: 'defi', decimals: 3, pipMultiplier: 10.0, basePrice: 4.80, is24_7: true, description: 'Tokenized yield trading protocol' },
  { symbol: 'MKRUSD', name: 'Maker', category: 'crypto', subCategory: 'defi', decimals: 1, pipMultiplier: 1.0, basePrice: 1850.0, is24_7: true, description: 'Decentralized stablecoin credit protocol' },
  { symbol: 'CRVUSD', name: 'Curve DAO', category: 'crypto', subCategory: 'defi', decimals: 4, pipMultiplier: 100.0, basePrice: 0.38, is24_7: true, description: 'Deep liquidity stablecoin swap protocol' },
  { symbol: 'RUNEUSD', name: 'THORChain', category: 'crypto', subCategory: 'defi', decimals: 3, pipMultiplier: 10.0, basePrice: 5.60, is24_7: true, description: 'Cross-chain native asset liquidity protocol' },

  // ── 🐶 Crypto: High-Momentum Memecoins ──────────────────────────
  { symbol: 'DOGEUSD', name: 'Dogecoin', category: 'crypto', subCategory: 'meme', decimals: 4, pipMultiplier: 100.0, basePrice: 0.26, is24_7: true, description: 'Original meme currency & retail liquidity' },
  { symbol: 'SHIBUSD', name: 'Shiba Inu', category: 'crypto', subCategory: 'meme', decimals: 6, pipMultiplier: 10000.0, basePrice: 0.000022, is24_7: true, description: 'Decentralized community meme ecosystem' },
  { symbol: 'PEPEUSD', name: 'Pepe', category: 'crypto', subCategory: 'meme', decimals: 8, pipMultiplier: 100000.0, basePrice: 0.0000095, is24_7: true, description: 'High-volume cultural meme momentum' },
  { symbol: 'WIFUSD', name: 'dogwifhat', category: 'crypto', subCategory: 'meme', decimals: 4, pipMultiplier: 100.0, basePrice: 2.10, is24_7: true, description: 'Solana leading meme momentum asset' },
  { symbol: 'BONKUSD', name: 'Bonk', category: 'crypto', subCategory: 'meme', decimals: 6, pipMultiplier: 10000.0, basePrice: 0.000028, is24_7: true, description: 'Solana utility & community meme' },
  { symbol: 'FLOKIUSD', name: 'Floki', category: 'crypto', subCategory: 'meme', decimals: 6, pipMultiplier: 10000.0, basePrice: 0.000185, is24_7: true, description: 'Meme utility & gaming ecosystem' },
  { symbol: 'POPCATUSD', name: 'Popcat', category: 'crypto', subCategory: 'meme', decimals: 4, pipMultiplier: 100.0, basePrice: 1.15, is24_7: true, description: 'Solana viral meme asset' },

  // ── 💱 Forex Majors & Minors ────────────────────────────────────
  { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'forex', subCategory: 'major', decimals: 5, pipMultiplier: 10000.0, basePrice: 1.0845, is24_7: false, description: 'World largest liquid FX pair' },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', category: 'forex', subCategory: 'major', decimals: 5, pipMultiplier: 10000.0, basePrice: 1.2680, is24_7: false, description: 'Cable - High institutional London volume' },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', category: 'forex', subCategory: 'major', decimals: 3, pipMultiplier: 100.0, basePrice: 154.20, is24_7: false, description: 'Asian & NY liquidity powerhouse' },
  { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc', category: 'forex', subCategory: 'major', decimals: 5, pipMultiplier: 10000.0, basePrice: 0.9020, is24_7: false, description: 'Safe-haven currency pair' },
  { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar', category: 'forex', subCategory: 'major', decimals: 5, pipMultiplier: 10000.0, basePrice: 1.3620, is24_7: false, description: 'Loonie - Commodity-linked pair' },
  { symbol: 'AUDUSD', name: 'Australian Dollar / US Dollar', category: 'forex', subCategory: 'major', decimals: 5, pipMultiplier: 10000.0, basePrice: 0.6650, is24_7: false, description: 'Aussie - Risk-on sentiment barometer' },
  { symbol: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', category: 'forex', subCategory: 'major', decimals: 5, pipMultiplier: 10000.0, basePrice: 0.5980, is24_7: false, description: 'Kiwi - Global commodity & trade flow' },

  // Forex Crosses
  { symbol: 'EURGBP', name: 'Euro / British Pound', category: 'forex', subCategory: 'cross', decimals: 5, pipMultiplier: 10000.0, basePrice: 0.8550, is24_7: false, description: 'European cross rate' },
  { symbol: 'EURJPY', name: 'Euro / Japanese Yen', category: 'forex', subCategory: 'cross', decimals: 3, pipMultiplier: 100.0, basePrice: 167.20, is24_7: false, description: 'High-momentum European carry pair' },
  { symbol: 'GBPJPY', name: 'British Pound / Japanese Yen', category: 'forex', subCategory: 'cross', decimals: 3, pipMultiplier: 100.0, basePrice: 195.50, is24_7: false, description: 'The Dragon / Geppy - High ATR momentum cross' },
  { symbol: 'AUDJPY', name: 'Australian Dollar / Japanese Yen', category: 'forex', subCategory: 'cross', decimals: 3, pipMultiplier: 100.0, basePrice: 102.50, is24_7: false, description: 'Risk sentiment barometer cross' },
  { symbol: 'CADJPY', name: 'Canadian Dollar / Japanese Yen', category: 'forex', subCategory: 'cross', decimals: 3, pipMultiplier: 100.0, basePrice: 113.20, is24_7: false, description: 'Oil & Asian session liquidity' },
  { symbol: 'CHFJPY', name: 'Swiss Franc / Japanese Yen', category: 'forex', subCategory: 'cross', decimals: 3, pipMultiplier: 100.0, basePrice: 170.80, is24_7: false, description: 'Safe-haven divergence cross' },
  { symbol: 'EURAUD', name: 'Euro / Australian Dollar', category: 'forex', subCategory: 'cross', decimals: 5, pipMultiplier: 10000.0, basePrice: 1.6300, is24_7: false, description: 'European vs commodity currency cross' },
  { symbol: 'GBPAUD', name: 'British Pound / Australian Dollar', category: 'forex', subCategory: 'cross', decimals: 5, pipMultiplier: 10000.0, basePrice: 1.9050, is24_7: false, description: 'High daily pip range cross' },

  // ── 🏆 Commodities & Metals ─────────────────────────────────────
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', category: 'commodity', subCategory: 'metal', decimals: 2, pipMultiplier: 10.0, basePrice: 2850.50, is24_7: false, description: 'Spot Gold - Peak institutional liquidity' },
  { symbol: 'XAGUSD', name: 'Silver / US Dollar', category: 'commodity', subCategory: 'metal', decimals: 3, pipMultiplier: 100.0, basePrice: 32.40, is24_7: false, description: 'Spot Silver - High beta precious metal' },
  { symbol: 'USOIL', name: 'WTI Crude Oil', category: 'commodity', subCategory: 'energy', decimals: 2, pipMultiplier: 10.0, basePrice: 72.80, is24_7: false, description: 'US Light Sweet Crude Oil' },
  { symbol: 'UKOIL', name: 'Brent Crude Oil', category: 'commodity', subCategory: 'energy', decimals: 2, pipMultiplier: 10.0, basePrice: 76.50, is24_7: false, description: 'North Sea Brent Crude Oil' },

  // ── 📈 Major Indices ────────────────────────────────────────────
  { symbol: 'US30', name: 'Dow Jones Industrial Average', category: 'index', decimals: 2, pipMultiplier: 1.0, basePrice: 43200.0, is24_7: false, description: 'US Wall Street 30 Blue Chips' },
  { symbol: 'NAS100', name: 'Nasdaq 100 Tech Index', category: 'index', decimals: 2, pipMultiplier: 1.0, basePrice: 21100.0, is24_7: false, description: 'US Top 100 Tech Giants' },
  { symbol: 'SPX500', name: 'S&P 500 Index', category: 'index', decimals: 2, pipMultiplier: 1.0, basePrice: 5850.0, is24_7: false, description: 'Broad US Market Benchmark' },
  { symbol: 'GER40', name: 'German DAX 40', category: 'index', decimals: 2, pipMultiplier: 1.0, basePrice: 19800.0, is24_7: false, description: 'European Equity Engine' },
];

/**
 * Normalizes user-entered symbol input.
 * e.g. "sui" -> "SUIUSD", "btc/usdt" -> "BTCUSD", "xauusd.m" -> "XAUUSD"
 */
export function normalizePairSymbol(input: string): string {
  if (!input) return '';
  let clean = input
    .toUpperCase()
    .trim()
    .replace('/', '')
    .replace(' ', '')
    .replace('-', '')
    .replace('.M', '')
    .replace('.PRO', '');

  // Strip MT5 micro suffix if present
  if (clean.endsWith('M') && clean.length > 4 && !clean.endsWith('USDM')) {
    clean = clean.slice(0, -1);
  }

  // Convert USDT / USDC to USD for unified institutional naming
  if (clean.endsWith('USDT')) clean = clean.replace('USDT', 'USD');
  if (clean.endsWith('USDC')) clean = clean.replace('USDC', 'USD');
  if (clean.endsWith('BUSD')) clean = clean.replace('BUSD', 'USD');

  // If user only typed a standalone crypto ticker (e.g. SUI, TAO, SOL, PEPE)
  const TRADITIONAL_FIAT_BASES = ['EUR', 'GBP', 'USD', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
  if (clean.length <= 5 && !clean.endsWith('USD') && !TRADITIONAL_FIAT_BASES.includes(clean)) {
    clean = `${clean}USD`;
  }

  return clean;
}

/**
 * Checks if ANY symbol is a Crypto or Altcoin asset (24/7 perpetual trading).
 * Heuristic accurately identifies all known tokens AND arbitrary brand-new altcoins!
 */
export function isCryptoAsset(pair: string): boolean {
  const u = normalizePairSymbol(pair);

  // Check against curated assets
  const found = CURATED_ASSETS.find(a => a.symbol === u);
  if (found) return found.category === 'crypto';

  if (u.includes('CRYPTO') || u.endsWith('USDT') || u.endsWith('USDC')) return true;

  // Known crypto patterns
  const CRYPTO_TAGS = [
    'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'SUI', 'NEAR',
    'APT', 'DOT', 'TON', 'SEI', 'KAS', 'FTM', 'INJ', 'TIA', 'LTC', 'BCH',
    'LINK', 'UNI', 'AAVE', 'ARB', 'OP', 'PENDLE', 'RENDER', 'FET', 'TAO',
    'PEPE', 'SHIB', 'WIF', 'BONK', 'FLOKI', 'POPCAT', 'BOME', 'MEME',
    'MATIC', 'POL', 'ATOM', 'ICP', 'FIL', 'HBAR', 'VET', 'QNT', 'ALGO'
  ];
  if (CRYPTO_TAGS.some(t => u.includes(t))) return true;

  // Unknown token heuristic: ends with USD but prefix is not traditional fiat or metal
  const NON_CRYPTO_PREFIXES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY', 'XAU', 'XAG', 'OIL', 'NAS', 'SPX', 'GER'];
  if (u.endsWith('USD')) {
    const base = u.replace('USD', '');
    if (base.length >= 2 && !NON_CRYPTO_PREFIXES.includes(base)) {
      return true; // Brand-new altcoin!
    }
  }

  return false;
}

/**
 * Dynamically resolves metadata for ANY asset (known or newly added).
 */
export function resolveAssetMeta(pair: string): AssetDefinition & { pipSize: number; isCrypto: boolean; subCategory: string } {
  const norm = normalizePairSymbol(pair);
  const found = CURATED_ASSETS.find(a => a.symbol === norm);
  const isCrypt = isCryptoAsset(norm);

  if (found) {
    return {
      ...found,
      subCategory: found.subCategory || (isCrypt ? 'altcoin' : 'standard'),
      pipSize: found.pipMultiplier ? (1 / found.pipMultiplier) : 0.0001,
      isCrypto: isCrypt,
    };
  }

  // Auto-synthesize meta for brand new / custom assets
  const isJpy = norm.includes('JPY');
  const isMetal = norm.includes('XAU') || norm.includes('XAG') || norm.includes('GOLD');

  let decimals = 5;
  let pipMultiplier = 10000.0;
  let basePrice = 1.0000;

  if (isCrypt) {
    decimals = 4;
    pipMultiplier = 100.0;
    basePrice = 1.0000;
  } else if (isJpy) {
    decimals = 3;
    pipMultiplier = 100.0;
    basePrice = 150.0;
  } else if (isMetal) {
    decimals = 2;
    pipMultiplier = 10.0;
    basePrice = 2800.0;
  }

  return {
    symbol: norm,
    name: norm,
    category: isCrypt ? 'crypto' : isMetal ? 'commodity' : 'forex',
    subCategory: isCrypt ? 'altcoin' : isMetal ? 'metal' : 'standard',
    decimals,
    pipMultiplier,
    pipSize: 1 / pipMultiplier,
    basePrice,
    is24_7: isCrypt,
    isCrypto: isCrypt,
    description: isCrypt ? 'Custom 24/7 Decentralized Crypto Asset' : 'Institutional Market Pair',
  };
}

export const CATEGORIZED_ASSETS = {
  crypto_l1_l2: CURATED_ASSETS.filter(a => a.category === 'crypto' && a.subCategory === 'l1_l2'),
  crypto_ai_depin: CURATED_ASSETS.filter(a => a.category === 'crypto' && a.subCategory === 'ai_depin'),
  crypto_defi: CURATED_ASSETS.filter(a => a.category === 'crypto' && a.subCategory === 'defi'),
  crypto_memes: CURATED_ASSETS.filter(a => a.category === 'crypto' && a.subCategory === 'meme'),
  forex_majors: CURATED_ASSETS.filter(a => a.category === 'forex' && a.subCategory === 'major'),
  forex_crosses: CURATED_ASSETS.filter(a => a.category === 'forex' && a.subCategory === 'cross'),
  commodities: CURATED_ASSETS.filter(a => a.category === 'commodity'),
  indices: CURATED_ASSETS.filter(a => a.category === 'index'),
};

export const SUPPORTED_PAIRS = CURATED_ASSETS.map(a => a.symbol);
