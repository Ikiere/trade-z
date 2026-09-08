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
    # ECN brokers charge on both open and close. For Exness (no commission), this is 0.0.
    # For IC Markets Raw, this equals commission_per_lot (round-trip charged separately).
    commission_per_lot_close: float = 0.0
    swap_long_points: float = -0.5
    swap_short_points: float = -0.3

    def spread_price(self) -> float:
        """
        Returns spread in actual price units (not pips).
        Formula: 1 pip in price units = tick_size * (pip_multiplier / 10.0)
        Examples:
          EURUSD: 0.6 pips * 0.00001 * (10000/10) = 0.6 * 0.00001 * 1000 = 0.00006  ✓
          XAUUSD: 1.8 pips * 0.01   * (10/10)    = 1.8 * 0.01 * 1      = 0.018     ✓
          USDJPY: 0.7 pips * 0.001  * (100/10)   = 0.7 * 0.001 * 10    = 0.007     ✓
          BTCUSD: 12  pips * 0.01   * (1/10)     = 12  * 0.01  * 0.1   = 0.012     ✓ (12 USD)
        """
        pip_in_price = self.tick_size * (self.pip_multiplier / 10.0)
        return round(self.typical_spread_pips * pip_in_price, self.decimals)

    def point_value_per_lot(self) -> float:
        """
        Returns dollar value of a single tick move for 1 standard lot.
        Used for swap and commission-per-pip calculations.
        Formula: tick_value / tick_size  (= $/tick / price-per-tick = $/price)
        """
        return self.tick_value / self.tick_size if self.tick_size > 0 else 0.0


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
            commission_per_lot=7.0,
            commission_per_lot_close=7.0
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
            commission_per_lot=7.0,
            commission_per_lot_close=7.0
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


def sync_from_mt5_symbol_info(
    symbol: str,
    mt5_info: Dict[str, Any],
    profile: Optional[BrokerProfile] = None
) -> SymbolSpec:
    """
    Dynamically synchronizes an authoritative SymbolSpec from live MT5 terminal bridge data.
    """
    prof = profile or EXNESS_PROFILE
    clean_sym = symbol.upper().replace("/", "").replace(" ", "")
    base_spec = prof.get_symbol_spec(clean_sym)

    digits = int(mt5_info.get("digits", base_spec.decimals))
    point = float(mt5_info.get("point", base_spec.tick_size))
    spread_points = float(mt5_info.get("spread", base_spec.typical_spread_pips * 10))

    pip_mult = base_spec.pip_multiplier
    spread_pips = spread_points / (10.0 if "JPY" in clean_sym or "XAU" in clean_sym else 10.0)

    updated_spec = SymbolSpec(
        symbol=clean_sym,
        asset_class=base_spec.asset_class,
        contract_size=float(mt5_info.get("contract_size", base_spec.contract_size)),
        min_volume=float(mt5_info.get("volume_min", base_spec.min_volume)),
        vol_step=float(mt5_info.get("volume_step", base_spec.vol_step)),
        max_volume=float(mt5_info.get("volume_max", base_spec.max_volume)),
        tick_size=point,
        tick_value=float(mt5_info.get("trade_tick_value", base_spec.tick_value)),
        decimals=digits,
        pip_multiplier=pip_mult,
        typical_spread_pips=round(spread_pips, 2) if spread_pips > 0 else base_spec.typical_spread_pips,
        news_spread_pips=base_spec.news_spread_pips,
        commission_per_lot=base_spec.commission_per_lot,
        swap_long_points=base_spec.swap_long_points,
        swap_short_points=base_spec.swap_short_points
    )
    prof.symbols[clean_sym] = updated_spec
    return updated_spec
