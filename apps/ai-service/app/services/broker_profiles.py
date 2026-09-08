"""
Trade-Z Broker Profiles Engine:
Defines authentic broker execution parameters, tick metrics, spread models,
slippage models, and margin requirements modeled after real MT5 brokers (Exness default).
"""

from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


class SymbolSpec(BaseModel):
    symbol: str
    asset_class: str  # forex, metal, crypto, index
    contract_size: float
    min_volume: float = 0.01
    vol_step: float = 0.01
    max_volume: float = 100.0
    tick_size: float
    tick_value: float
    decimals: int
    pip_multiplier: float
    typical_spread_pips: float
    news_spread_pips: float
    commission_per_lot: float = 0.0
    swap_long_points: float = -0.5
    swap_short_points: float = -0.3


class BrokerProfile(BaseModel):
    name: str
    display_name: str
    default_leverage: float = 2000.0
    margin_call_level: float = 60.0  # Percentage margin level triggering warning
    stop_out_level: float = 0.0     # Percentage margin level triggering liquidation (Exness 0%)
    execution_delay_ms: int = 45     # Realistic bridge latency
    supports_hedging: bool = True
    symbols: Dict[str, SymbolSpec] = Field(default_factory=dict)

    def get_symbol_spec(self, sym: str) -> SymbolSpec:
        upper = sym.upper().replace("/", "").replace(" ", "")
        for k, v in self.symbols.items():
            if k in upper or upper in k:
                return v

        # Fallback dynamic default
        if "XAU" in upper or "GOLD" in upper:
            return SymbolSpec(
                symbol=upper,
                asset_class="metal",
                contract_size=100.0,
                min_volume=0.01,
                vol_step=0.01,
                max_volume=100.0,
                tick_size=0.01,
                tick_value=1.0,
                decimals=2,
                pip_multiplier=10.0,
                typical_spread_pips=1.8,
                news_spread_pips=5.5
            )
        elif "BTC" in upper or "ETH" in upper or "SOL" in upper:
            return SymbolSpec(
                symbol=upper,
                asset_class="crypto",
                contract_size=1.0,
                min_volume=0.01,
                vol_step=0.01,
                max_volume=100.0,
                tick_size=0.01,
                tick_value=0.01,
                decimals=2,
                pip_multiplier=1.0,
                typical_spread_pips=12.0,
                news_spread_pips=35.0
            )
        else:
            is_jpy = "JPY" in upper
            return SymbolSpec(
                symbol=upper,
                asset_class="forex",
                contract_size=100000.0,
                min_volume=0.01,
                vol_step=0.01,
                max_volume=100.0,
                tick_size=0.001 if is_jpy else 0.00001,
                tick_value=0.67 if is_jpy else 1.0,
                decimals=3 if is_jpy else 5,
                pip_multiplier=100.0 if is_jpy else 10000.0,
                typical_spread_pips=0.8,
                news_spread_pips=2.4
            )


# Default Curated Broker Profiles
EXNESS_PROFILE = BrokerProfile(
    name="exness_standard",
    display_name="Exness Standard (1:2000 Leverage • 0% Stop-out)",
    default_leverage=2000.0,
    margin_call_level=60.0,
    stop_out_level=0.0,  # Exness famous zero-equity stop-out protection
    execution_delay_ms=35,
    symbols={
        "EURUSD": SymbolSpec(
            symbol="EURUSD",
            asset_class="forex",
            contract_size=100000.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.00001,
            tick_value=1.0,
            decimals=5,
            pip_multiplier=10000.0,
            typical_spread_pips=0.6,
            news_spread_pips=1.8,
            commission_per_lot=0.0
        ),
        "GBPUSD": SymbolSpec(
            symbol="GBPUSD",
            asset_class="forex",
            contract_size=100000.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.00001,
            tick_value=1.0,
            decimals=5,
            pip_multiplier=10000.0,
            typical_spread_pips=0.9,
            news_spread_pips=2.2,
            commission_per_lot=0.0
        ),
        "USDJPY": SymbolSpec(
            symbol="USDJPY",
            asset_class="forex",
            contract_size=100000.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.001,
            tick_value=0.67,
            decimals=3,
            pip_multiplier=100.0,
            typical_spread_pips=0.7,
            news_spread_pips=2.0,
            commission_per_lot=0.0
        ),
        "AUDUSD": SymbolSpec(
            symbol="AUDUSD",
            asset_class="forex",
            contract_size=100000.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.00001,
            tick_value=1.0,
            decimals=5,
            pip_multiplier=10000.0,
            typical_spread_pips=0.8,
            news_spread_pips=2.1,
            commission_per_lot=0.0
        ),
        "XAUUSD": SymbolSpec(
            symbol="XAUUSD",
            asset_class="metal",
            contract_size=100.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.01,
            tick_value=1.0,
            decimals=2,
            pip_multiplier=10.0,
            typical_spread_pips=1.8,
            news_spread_pips=5.0,
            commission_per_lot=0.0
        ),
        "BTCUSD": SymbolSpec(
            symbol="BTCUSD",
            asset_class="crypto",
            contract_size=1.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.01,
            tick_value=0.01,
            decimals=2,
            pip_multiplier=1.0,
            typical_spread_pips=12.0,
            news_spread_pips=35.0,
            commission_per_lot=0.0
        ),
        "ETHUSD": SymbolSpec(
            symbol="ETHUSD",
            asset_class="crypto",
            contract_size=1.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.01,
            tick_value=0.01,
            decimals=2,
            pip_multiplier=1.0,
            typical_spread_pips=1.5,
            news_spread_pips=4.2,
            commission_per_lot=0.0
        ),
    }
)

IC_MARKETS_PROFILE = BrokerProfile(
    name="ic_markets_raw",
    display_name="IC Markets Raw (1:500 Leverage • ECN Commission • 50% Stop-out)",
    default_leverage=500.0,
    margin_call_level=100.0,
    stop_out_level=50.0,
    execution_delay_ms=25,
    symbols={
        "EURUSD": SymbolSpec(
            symbol="EURUSD",
            asset_class="forex",
            contract_size=100000.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.00001,
            tick_value=1.0,
            decimals=5,
            pip_multiplier=10000.0,
            typical_spread_pips=0.1,
            news_spread_pips=0.8,
            commission_per_lot=7.0
        ),
        "XAUUSD": SymbolSpec(
            symbol="XAUUSD",
            asset_class="metal",
            contract_size=100.0,
            min_volume=0.01,
            vol_step=0.01,
            max_volume=100.0,
            tick_size=0.01,
            tick_value=1.0,
            decimals=2,
            pip_multiplier=10.0,
            typical_spread_pips=1.1,
            news_spread_pips=3.2,
            commission_per_lot=7.0
        ),
    }
)

AVAILABLE_BROKERS: Dict[str, BrokerProfile] = {
    "exness": EXNESS_PROFILE,
    "ic_markets": IC_MARKETS_PROFILE,
}


def get_broker_profile(name: Optional[str] = None) -> BrokerProfile:
    if not name:
        return EXNESS_PROFILE
    key = name.lower().replace(" ", "_")
    return AVAILABLE_BROKERS.get(key, EXNESS_PROFILE)
