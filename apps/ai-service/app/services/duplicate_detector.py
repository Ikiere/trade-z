"""
Trade-Z Duplicate Setup & Event Fingerprinting Engine:
Prevents the engine from generating multiple effectively identical trades from the same market event.
Creates an institutional event fingerprint and enforces configurable cooldown periods:
- same-event cooldown (bars)
- same-zone cooldown (points / pips)
- symbol cooldown
"""

import hashlib
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field


class SetupFingerprint(BaseModel):
    fingerprint_hash: str
    symbol: str
    setup_family: str
    direction: str
    price_zone_anchor: float
    time_window_bar: int
    raw_signature: str


class DuplicateDetector:
    """
    Tracks historical setups and enforces multi-layered cooldown and fingerprint deduplication.
    """

    def __init__(
        self,
        event_cooldown_bars: int = 12,
        zone_cooldown_points: float = 0.0025,
        global_symbol_cooldown_bars: int = 4
    ):
        self.event_cooldown_bars = event_cooldown_bars
        self.zone_cooldown_points = zone_cooldown_points
        self.global_symbol_cooldown_bars = global_symbol_cooldown_bars

        # Historical executed/active setups: fingerprint_hash -> last_bar_index
        self.seen_fingerprints: Dict[str, int] = {}
        # Last trade bar per symbol: symbol -> bar_index
        self.last_trade_bar_by_symbol: Dict[str, int] = {}
        # Active price zones: symbol -> List[(anchor_price, bar_index)]
        self.active_zones_by_symbol: Dict[str, List[Tuple[float, int]]] = {}

    def compute_fingerprint(
        self,
        symbol: str,
        setup_family: str,
        direction: str,
        entry_price: float,
        bar_index: int,
        price_tolerance: float = 0.0020
    ) -> SetupFingerprint:
        """
        Generates a normalized fingerprint hash based on symbol, setup family, direction,
        and quantized price zone.
        """
        sym = symbol.upper().replace("/", "").replace(" ", "")
        dir_clean = direction.upper()
        # Quantize price zone to nearest tolerance band to catch near-identical levels
        zone_anchor = round(entry_price / max(0.0001, price_tolerance)) * price_tolerance
        time_block = bar_index // self.event_cooldown_bars

        raw = f"{sym}_{setup_family}_{dir_clean}_{zone_anchor:.5f}_{time_block}"
        h = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

        return SetupFingerprint(
            fingerprint_hash=h,
            symbol=sym,
            setup_family=setup_family,
            direction=dir_clean,
            price_zone_anchor=zone_anchor,
            time_window_bar=bar_index,
            raw_signature=raw
        )

    def is_duplicate_or_cooling_down(
        self,
        symbol: str,
        setup_family: str,
        direction: str,
        entry_price: float,
        current_bar_index: int,
        price_tolerance: Optional[float] = None
    ) -> Tuple[bool, str]:
        """
        Checks whether a proposed setup is a duplicate, inside a cooldown period,
        or re-testing the exact same zone too soon.
        """
        sym = symbol.upper().replace("/", "").replace(" ", "")
        tol = price_tolerance or self.zone_cooldown_points

        # 1. Global Symbol Cooldown Check
        last_sym_bar = self.last_trade_bar_by_symbol.get(sym, -999)
        if (current_bar_index - last_sym_bar) < self.global_symbol_cooldown_bars:
            return True, f"SYMBOL_COOLDOWN: {sym} traded {current_bar_index - last_sym_bar} bars ago (min {self.global_symbol_cooldown_bars})."

        # 2. Exact Event Fingerprint Check
        fp = self.compute_fingerprint(sym, setup_family, direction, entry_price, current_bar_index, tol)
        last_fp_bar = self.seen_fingerprints.get(fp.fingerprint_hash)
        if last_fp_bar is not None and (current_bar_index - last_fp_bar) < self.event_cooldown_bars:
            return True, f"DUPLICATE_EVENT: Same setup fingerprint ({fp.raw_signature}) seen at bar {last_fp_bar}."

        # 3. Same-Zone Cooldown Check
        zones = self.active_zones_by_symbol.get(sym, [])
        for anchor, bar in zones:
            if abs(entry_price - anchor) <= tol and (current_bar_index - bar) < self.event_cooldown_bars:
                return True, f"SAME_ZONE_COOLDOWN: Price level {entry_price} is within {tol} of prior zone {anchor} (bar {bar})."

        return False, "APPROVED"

    def register_setup(
        self,
        symbol: str,
        setup_family: str,
        direction: str,
        entry_price: float,
        bar_index: int,
        price_tolerance: Optional[float] = None
    ):
        """
        Registers a newly executed trade into fingerprint and cooldown stores.
        """
        sym = symbol.upper().replace("/", "").replace(" ", "")
        tol = price_tolerance or self.zone_cooldown_points

        fp = self.compute_fingerprint(sym, setup_family, direction, entry_price, bar_index, tol)
        self.seen_fingerprints[fp.fingerprint_hash] = bar_index
        self.last_trade_bar_by_symbol[sym] = bar_index

        zones = self.active_zones_by_symbol.setdefault(sym, [])
        zones.append((entry_price, bar_index))
        # Keep recent zones within 100 bars
        self.active_zones_by_symbol[sym] = [(p, b) for p, b in zones if (bar_index - b) <= 100]

    def is_duplicate(
        self,
        symbol: str,
        setup_family: str,
        direction: str,
        zone_price: float,
        current_bar: int,
        price_tolerance: Optional[float] = None
    ) -> Tuple[bool, str]:
        return self.is_duplicate_or_cooling_down(
            symbol=symbol,
            setup_family=setup_family,
            direction=direction,
            entry_price=zone_price,
            current_bar_index=current_bar,
            price_tolerance=price_tolerance
        )

    def register_execution(
        self,
        symbol: str,
        setup_family: str,
        direction: str,
        zone_price: float,
        current_bar: int,
        price_tolerance: Optional[float] = None
    ):
        self.register_setup(
            symbol=symbol,
            setup_family=setup_family,
            direction=direction,
            entry_price=zone_price,
            bar_index=current_bar,
            price_tolerance=price_tolerance
        )

    def reset(self):
        """Resets all tracking stores (for clean backtest replay)."""
        self.seen_fingerprints.clear()
        self.last_trade_bar_by_symbol.clear()
        self.active_zones_by_symbol.clear()


# Global detector instance
duplicate_detector = DuplicateDetector()
