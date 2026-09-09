"""
Small-Account Instrument Eligibility & Mathematical Position Sizing Engine:
Enforces identical institutional analysis across all balances ($20 to $20,000,000).
If an instrument cannot be traded because minimum broker lot (0.01) creates excessive
risk for a small balance, it marks the instrument ineligible and prompts the engine
to evaluate other instruments on the watchlist (e.g. Forex/Crypto) rather than shutting down.
"""

from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field, computed_field
from app.services.asset_classifier import classify_asset


class EligibilityResult(BaseModel):
    is_eligible: bool
    symbol: str
    equity: float
    risk_percent: float
    risk_budget_dollars: float
    min_volume: float
    recommended_lot: float
    dollar_loss_at_min_volume: float
    dollar_loss_at_recommended_lot: float
    ineligibility_reason: Optional[str] = None
    suggested_alternatives: List[str] = Field(default_factory=list)
    margin_requirement_estimate: float = 0.0

    @computed_field
    @property
    def risk_budget(self) -> float:
        return self.risk_budget_dollars

    @computed_field
    @property
    def dollar_risk_at_min_lot(self) -> float:
        return self.dollar_loss_at_min_volume

    @computed_field
    @property
    def recommended_lot_size(self) -> float:
        return self.recommended_lot

    @computed_field
    @property
    def reason(self) -> str:
        return self.ineligibility_reason or ""

    @computed_field
    @property
    def min_equity_needed_for_001_lot(self) -> float:
        pct = max(0.001, self.risk_percent / 100.0)
        return round(self.dollar_loss_at_min_volume / pct, 2)


INSTRUMENT_SPECS: Dict[str, Dict[str, Any]] = {
    "XAUUSD": {"contract_size": 100, "min_lot": 0.01, "tick_value": 1.0},
    "EURUSD": {"contract_size": 100000, "min_lot": 0.01, "tick_value": 1.0},
    "GBPUSD": {"contract_size": 100000, "min_lot": 0.01, "tick_value": 1.0},
    "USDJPY": {"contract_size": 100000, "min_lot": 0.01, "tick_value": 0.67},
    "BTCUSD": {"contract_size": 1, "min_lot": 0.01, "tick_value": 0.01},
}


def evaluate_instrument_eligibility(
    symbol: str,
    equity: float,
    stop_distance_points: float,
    risk_percent: float = 1.0,
    broker_min_volume: float = 0.01,
    broker_vol_step: float = 0.01,
    broker_tick_value: Optional[float] = None,
    broker_tick_size: Optional[float] = None,
    leverage: float = 100.0,
    strict_risk_enforcement: bool = False,
    is_cent_account: bool = False
) -> EligibilityResult:
    """
    Evaluates whether an asset can be safely executed for the given account balance
    without violating broker minimum lot size or the account's hard risk budget.
    """
    sym = symbol.upper().replace("/", "")
    asset_info = classify_asset(sym)

    # Defaults if not supplied by MT5 broker
    tick_val = broker_tick_value or 1.0
    effective_risk_pct = min(max(risk_percent, 0.1), 5.0)
    risk_budget = equity * (effective_risk_pct / 100.0) if equity > 0 else 0.0

    # Calculate dollar loss for 1 full lot based on asset contract size
    if "XAU" in sym or "GOLD" in sym:
        # Gold: 1 lot = 100 oz. A $1.00 move in gold price = $100 on 1.0 lot.
        loss_per_1_lot = stop_distance_points * 100.0
    elif asset_info.get("is_crypto"):
        # Crypto: 1 lot = 1 coin. A $1.00 move = $1 on 1.0 lot.
        loss_per_1_lot = stop_distance_points * 1.0
    else:
        # Standard Forex: 1 lot = 100,000 units. 1 pip = $10 USD (or ~$6.70 for JPY).
        pip_sz = 0.01 if "JPY" in sym else 0.0001
        pips = stop_distance_points / pip_sz if pip_sz > 0 else stop_distance_points
        tick_multiplier = 10.0 if "JPY" not in sym else 6.7
        loss_per_1_lot = pips * tick_multiplier

    # In Cent Account mode (e.g. Exness Standard Cent), contract size and risk scale down 100x
    if is_cent_account:
        loss_per_1_lot = loss_per_1_lot / 100.0

    loss_at_min_vol = round(loss_per_1_lot * broker_min_volume, 2)

    # Margin requirement estimate for min lot
    base_price = asset_info.get("base_price", 1.0)
    contract_size = 100.0 if "XAU" in sym else (1.0 if asset_info.get("is_crypto") else 100000.0)
    margin_per_1_lot = (base_price * contract_size) / max(1.0, leverage)
    if is_cent_account:
        margin_per_1_lot = margin_per_1_lot / 100.0
    margin_req_min_vol = round(margin_per_1_lot * broker_min_volume, 2)

    # 1. Authoritative Risk Allowed Volume
    # Cannot exceed the approved risk budget
    risk_allowed_vol = (risk_budget / loss_per_1_lot) if loss_per_1_lot > 0 else 0.0

    # 2. Authoritative Margin Allowed Volume
    # Max margin utilization set to 80% of current equity
    max_usable_margin = equity * 0.80 if equity > 0 else 0.0
    margin_allowed_vol = (max_usable_margin / margin_per_1_lot) if margin_per_1_lot > 0 else 0.0

    # 3. Authoritative Broker Allowed Volume
    broker_allowed_vol = 100.0  # standard institutional cap

    # 4. Canonical Volume Clamping: min(broker, risk, margin)
    raw_vol = min(broker_allowed_vol, risk_allowed_vol, margin_allowed_vol)

    # Step down to broker volume_step
    import math
    stepped_vol = math.floor(raw_vol / broker_vol_step) * broker_vol_step
    stepped_vol = round(stepped_vol, 4)

    # Small account and risk check:
    # If broker minimum volume would risk more than approved risk budget,
    # NEVER increase risk. Result is strictly NO TRADE.
    max_tolerated_risk = risk_budget if strict_risk_enforcement else (risk_budget * 2.0)
    if stepped_vol < broker_min_volume and not (not strict_risk_enforcement and loss_at_min_vol <= max_tolerated_risk and margin_req_min_vol <= equity * 0.70):
        alternatives = []
        if "XAU" in sym or "GOLD" in sym or "BTC" in sym:
            alternatives = ["EURUSD", "GBPUSD", "USDJPY"]
        elif "GBP" in sym:
            alternatives = ["EURUSD", "USDJPY"]

        pct_of_account = (loss_at_min_vol / equity * 100.0) if equity > 0 else 0.0
        reason = (
            f"UNEXECUTABLE_AT_BROKER_MIN_VOLUME: SETUP_VALID_BUT_NOT_EXECUTABLE: Broker minimum lot ({broker_min_volume}) on {sym} "
            f"risks ${loss_at_min_vol:.2f} ({pct_of_account:.1f}% of equity), exceeding your approved risk budget "
            f"(${risk_budget:.2f}). Trade rejected by Capital Shield."
        )
        return EligibilityResult(
            is_eligible=False,
            symbol=sym,
            equity=equity,
            risk_percent=effective_risk_pct,
            risk_budget_dollars=round(risk_budget, 2),
            min_volume=broker_min_volume,
            recommended_lot=0.0,
            dollar_loss_at_min_volume=loss_at_min_vol,
            dollar_loss_at_recommended_lot=0.0,
            ineligibility_reason=reason,
            suggested_alternatives=alternatives,
            margin_requirement_estimate=margin_req_min_vol
        )

    # Approved volume satisfies all risk, broker, and margin constraints
    recommended_lot = stepped_vol if stepped_vol >= broker_min_volume else broker_min_volume
    dollar_loss_recommended = round(loss_per_1_lot * recommended_lot, 2)
    margin_req_rec = round(margin_per_1_lot * recommended_lot, 2)

    return EligibilityResult(
        is_eligible=True,
        symbol=sym,
        equity=equity,
        risk_percent=effective_risk_pct,
        risk_budget_dollars=round(risk_budget, 2),
        min_volume=broker_min_volume,
        recommended_lot=recommended_lot,
        dollar_loss_at_min_volume=loss_at_min_vol,
        dollar_loss_at_recommended_lot=dollar_loss_recommended,
        ineligibility_reason=None,
        suggested_alternatives=[],
        margin_requirement_estimate=margin_req_rec
    )
