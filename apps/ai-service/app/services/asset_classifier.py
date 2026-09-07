"""
Trade-Z AI Service — Unified Asset Classifier & Registry
Provides institutional classification, decimal precision, ATR baseline, and 24/7 session
detection across Forex, Crypto (BTC + All Altcoins), Commodities, and Indices.
"""

from typing import Dict, Any

# Curated catalog of known cryptocurrency bases
CRYPTO_BASES = {
    # Layer 1 / Layer 2
    "BTC": {"name": "Bitcoin", "decimals": 2, "base_price": 88500.0, "pip_val": 1.0, "atr_pct": 0.022},
    "ETH": {"name": "Ethereum", "decimals": 2, "base_price": 2820.0, "pip_val": 1.0, "atr_pct": 0.028},
    "SOL": {"name": "Solana", "decimals": 2, "base_price": 195.5, "pip_val": 1.0, "atr_pct": 0.038},
    "BNB": {"name": "BNB", "decimals": 2, "base_price": 650.0, "pip_val": 1.0, "atr_pct": 0.025},
    "XRP": {"name": "XRP", "decimals": 4, "base_price": 2.45, "pip_val": 100.0, "atr_pct": 0.045},
    "ADA": {"name": "Cardano", "decimals": 4, "base_price": 0.82, "pip_val": 100.0, "atr_pct": 0.042},
    "AVAX": {"name": "Avalanche", "decimals": 2, "base_price": 32.5, "pip_val": 1.0, "atr_pct": 0.045},
    "SUI": {"name": "Sui", "decimals": 4, "base_price": 3.15, "pip_val": 100.0, "atr_pct": 0.052},
    "NEAR": {"name": "NEAR", "decimals": 3, "base_price": 6.20, "pip_val": 10.0, "atr_pct": 0.048},
    "APT": {"name": "Aptos", "decimals": 3, "base_price": 8.90, "pip_val": 10.0, "atr_pct": 0.046},
    "DOT": {"name": "Polkadot", "decimals": 3, "base_price": 7.40, "pip_val": 10.0, "atr_pct": 0.038},
    "TON": {"name": "Toncoin", "decimals": 3, "base_price": 5.80, "pip_val": 10.0, "atr_pct": 0.035},
    "SEI": {"name": "Sei", "decimals": 4, "base_price": 0.52, "pip_val": 100.0, "atr_pct": 0.055},
    "KAS": {"name": "Kaspa", "decimals": 4, "base_price": 0.16, "pip_val": 100.0, "atr_pct": 0.045},
    "FTM": {"name": "Sonic/Fantom", "decimals": 4, "base_price": 0.78, "pip_val": 100.0, "atr_pct": 0.048},
    "INJ": {"name": "Injective", "decimals": 2, "base_price": 24.5, "pip_val": 1.0, "atr_pct": 0.048},
    "TIA": {"name": "Celestia", "decimals": 3, "base_price": 5.10, "pip_val": 10.0, "atr_pct": 0.055},
    "LTC": {"name": "Litecoin", "decimals": 2, "base_price": 112.0, "pip_val": 1.0, "atr_pct": 0.032},
    "BCH": {"name": "Bitcoin Cash", "decimals": 2, "base_price": 420.0, "pip_val": 1.0, "atr_pct": 0.035},
    "ATOM": {"name": "Cosmos", "decimals": 3, "base_price": 6.80, "pip_val": 10.0, "atr_pct": 0.042},
    "ICP": {"name": "Internet Computer", "decimals": 2, "base_price": 11.5, "pip_val": 1.0, "atr_pct": 0.045},
    "HBAR": {"name": "Hedera", "decimals": 4, "base_price": 0.28, "pip_val": 100.0, "atr_pct": 0.050},

    # AI & DePIN Altcoins
    "RENDER": {"name": "Render", "decimals": 3, "base_price": 7.20, "pip_val": 10.0, "atr_pct": 0.050},
    "FET": {"name": "ASI / Fetch", "decimals": 4, "base_price": 1.45, "pip_val": 100.0, "atr_pct": 0.055},
    "TAO": {"name": "Bittensor", "decimals": 2, "base_price": 520.0, "pip_val": 1.0, "atr_pct": 0.045},
    "GRT": {"name": "The Graph", "decimals": 4, "base_price": 0.22, "pip_val": 100.0, "atr_pct": 0.052},
    "AR": {"name": "Arweave", "decimals": 2, "base_price": 18.5, "pip_val": 1.0, "atr_pct": 0.048},
    "THETA": {"name": "Theta", "decimals": 3, "base_price": 1.85, "pip_val": 10.0, "atr_pct": 0.045},

    # DeFi & Infrastructure
    "LINK": {"name": "Chainlink", "decimals": 2, "base_price": 17.5, "pip_val": 1.0, "atr_pct": 0.035},
    "UNI": {"name": "Uniswap", "decimals": 3, "base_price": 9.80, "pip_val": 10.0, "atr_pct": 0.040},
    "AAVE": {"name": "Aave", "decimals": 2, "base_price": 215.0, "pip_val": 1.0, "atr_pct": 0.042},
    "ARB": {"name": "Arbitrum", "decimals": 4, "base_price": 0.72, "pip_val": 100.0, "atr_pct": 0.048},
    "OP": {"name": "Optimism", "decimals": 3, "base_price": 1.65, "pip_val": 10.0, "atr_pct": 0.048},
    "PENDLE": {"name": "Pendle", "decimals": 3, "base_price": 4.80, "pip_val": 10.0, "atr_pct": 0.052},
    "MKR": {"name": "Maker", "decimals": 1, "base_price": 1850.0, "pip_val": 1.0, "atr_pct": 0.035},
    "CRV": {"name": "Curve", "decimals": 4, "base_price": 0.38, "pip_val": 100.0, "atr_pct": 0.050},
    "RUNE": {"name": "THORChain", "decimals": 3, "base_price": 5.60, "pip_val": 10.0, "atr_pct": 0.052},

    # Memecoins & High Beta
    "DOGE": {"name": "Dogecoin", "decimals": 4, "base_price": 0.26, "pip_val": 100.0, "atr_pct": 0.055},
    "SHIB": {"name": "Shiba Inu", "decimals": 6, "base_price": 0.000022, "pip_val": 10000.0, "atr_pct": 0.060},
    "PEPE": {"name": "Pepe", "decimals": 8, "base_price": 0.0000095, "pip_val": 100000.0, "atr_pct": 0.068},
    "WIF": {"name": "dogwifhat", "decimals": 4, "base_price": 2.10, "pip_val": 100.0, "atr_pct": 0.065},
    "BONK": {"name": "Bonk", "decimals": 6, "base_price": 0.000028, "pip_val": 10000.0, "atr_pct": 0.065},
    "FLOKI": {"name": "Floki", "decimals": 6, "base_price": 0.000185, "pip_val": 10000.0, "atr_pct": 0.065},
    "POPCAT": {"name": "Popcat", "decimals": 4, "base_price": 1.15, "pip_val": 100.0, "atr_pct": 0.070},
}

TRADITIONAL_FIATS = {"EUR", "GBP", "USD", "JPY", "AUD", "NZD", "CAD", "CHF"}
COMMODITIES = {"XAU", "XAG", "GOLD", "SILVER", "OIL", "USOIL", "UKOIL", "BRENT", "WTI", "NATGAS", "COPPER"}
INDICES = {"US30", "NAS100", "SPX500", "GER40", "UK100", "JPN225", "DOW", "NASDAQ"}


def normalize_symbol(symbol: str) -> str:
    """Normalizes any symbol input into unified uppercase format."""
    if not symbol:
        return ""
    s = symbol.upper().strip().replace("/", "").replace(" ", "").replace("-", "")
    if s.endswith(".M") or s.endswith(".PRO"):
        s = s.split(".")[0]
    if s.endswith("USDT"):
        s = s.replace("USDT", "USD")
    elif s.endswith("USDC"):
        s = s.replace("USDC", "USD")
    elif s.endswith("BUSD"):
        s = s.replace("BUSD", "USD")

    # If only ticker was passed (e.g. SUI or TAO)
    if len(s) <= 5 and not s.endswith("USD") and s not in TRADITIONAL_FIATS and s not in COMMODITIES and s not in INDICES:
        s = f"{s}USD"

    return s


def classify_asset(symbol: str) -> Dict[str, Any]:
    """
    Classifies any asset (known or dynamically added new altcoin) into its institutional parameters.
    """
    s = normalize_symbol(symbol)

    # 1. Commodity Check
    if any(c in s for c in ["XAU", "GOLD"]):
        return {
            "symbol": s,
            "category": "commodity",
            "sub_category": "metal",
            "is_crypto": False,
            "is_altcoin": False,
            "is_24_7": False,
            "decimals": 2,
            "pip_mult": 10.0,
            "base_price": 2850.50,
            "typical_atr_pct": 0.012,
            "session": "London & NY Gold Session (07:00-21:00 UTC)",
        }
    if any(c in s for c in ["XAG", "SILVER"]):
        return {
            "symbol": s,
            "category": "commodity",
            "sub_category": "metal",
            "is_crypto": False,
            "is_altcoin": False,
            "is_24_7": False,
            "decimals": 3,
            "pip_mult": 100.0,
            "base_price": 32.40,
            "typical_atr_pct": 0.022,
            "session": "London & NY Metals Session (07:00-21:00 UTC)",
        }
    if any(c in s for c in ["OIL", "USOIL", "UKOIL", "BRENT", "WTI"]):
        return {
            "symbol": s,
            "category": "commodity",
            "sub_category": "energy",
            "is_crypto": False,
            "is_altcoin": False,
            "is_24_7": False,
            "decimals": 2,
            "pip_mult": 10.0,
            "base_price": 74.50,
            "typical_atr_pct": 0.020,
            "session": "Energy Session (08:00-21:00 UTC)",
        }

    # 2. Indices Check
    if any(idx in s for idx in INDICES):
        return {
            "symbol": s,
            "category": "index",
            "sub_category": "equity_index",
            "is_crypto": False,
            "is_altcoin": False,
            "is_24_7": False,
            "decimals": 2,
            "pip_mult": 1.0,
            "base_price": 43000.0 if "US30" in s else 21000.0 if "NAS" in s else 5850.0,
            "typical_atr_pct": 0.012,
            "session": "US Equity Open (13:30-21:00 UTC)",
        }

    # 3. Crypto & Altcoin Check (Known Catalog)
    for base, info in CRYPTO_BASES.items():
        if s.startswith(base) or s == f"{base}USD" or s == f"{base}USDT":
            is_btc_or_eth = base in ["BTC", "ETH"]
            return {
                "symbol": s,
                "category": "crypto",
                "sub_category": "major_crypto" if is_btc_or_eth else "altcoin",
                "is_crypto": True,
                "is_altcoin": not is_btc_or_eth,
                "is_24_7": True,
                "decimals": info["decimals"],
                "pip_mult": info["pip_val"],
                "base_price": info["base_price"],
                "typical_atr_pct": info["atr_pct"],
                "session": "Crypto 24/7 Institutional Session",
            }

    # 4. Unknown / Brand-New Crypto Altcoin Heuristic
    # If ends in USD/USDT/USDC and base is NOT a traditional fiat currency:
    if s.endswith("USD"):
        base_cand = s.replace("USD", "")
        if len(base_cand) >= 2 and base_cand not in TRADITIONAL_FIATS:
            return {
                "symbol": s,
                "category": "crypto",
                "sub_category": "altcoin",
                "is_crypto": True,
                "is_altcoin": True,
                "is_24_7": True,
                "decimals": 4,
                "pip_mult": 100.0,
                "base_price": 1.0000,
                "typical_atr_pct": 0.050,
                "session": "Crypto 24/7 Institutional Session",
            }

    # 5. Forex Check
    is_jpy = "JPY" in s
    return {
        "symbol": s,
        "category": "forex",
        "sub_category": "major" if s in ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD"] else "cross",
        "is_crypto": False,
        "is_altcoin": False,
        "is_24_7": False,
        "decimals": 3 if is_jpy else 5,
        "pip_mult": 100.0 if is_jpy else 10000.0,
        "base_price": 154.0 if is_jpy else (1.26 if "GBP" in s else 1.08),
        "typical_atr_pct": 0.008,
        "session": "Tokyo Session (00:00-09:00 UTC)" if is_jpy else "London & NY Session (07:00-21:00 UTC)",
    }
