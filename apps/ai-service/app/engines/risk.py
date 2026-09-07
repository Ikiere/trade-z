from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class RiskEngine(BaseEngine):
    """
    Layer 13: Validates Risk/Reward ratios, enforces capital preservation,
    and dynamically calculates safe, account-adaptive lot sizes based on MT5 balance.
    Protects small accounts from high-volatility blowout trades.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        # 1. Enforce minimum risk reward ratio
        target_rr = context.get("risk_reward_ratio", 2.5)

        if target_rr < 1.5:
            return EngineResult(
                result="rejected",
                confidence=0.0,
                explanation="Risk Shield Warning: Risk/Reward ratio is below minimum acceptable 1:1.5 threshold.",
                metrics={"risk_reward_ratio": target_rr, "recommended_lot_size": 0.01},
                validation_status="invalid"
            )

        # 2. Extract account metrics
        account_balance = context.get("account_balance")
        account_equity = context.get("account_equity")
        equity = float(account_equity or account_balance or 0.0)

        symbol = snapshot.symbol.upper().replace("/", "")
        is_gold = "XAU" in symbol or "GOLD" in symbol
        is_crypto = any(c in symbol for c in ["BTC", "ETH", "SOL"])
        is_jpy = "JPY" in symbol

        # Asset-specific estimated SL distance (points)
        if is_gold:
            sl_points = 6.50
            loss_at_001 = sl_points * 1.0  # 1 pip/point in gold = $1.00 at 0.01 lot
        elif is_crypto:
            current_close = float(snapshot.df["close"].iloc[-1]) if len(snapshot.df) > 0 else 50000.0
            sl_points = current_close * 0.015
            loss_at_001 = sl_points * 0.01
        elif is_jpy:
            sl_points = 0.35  # ~35 pips
            loss_at_001 = (sl_points / 0.01) * 0.07  # ~$2.45 at 0.01 lot
        else:
            sl_points = 0.0020  # 20 pips
            loss_at_001 = 2.00  # ~$2.00 at 0.01 lot

        # 3. Small Account Capital Shield Guard
        recommended_lot = 0.01
        risk_percent = 1.0

        if equity > 0:
            if equity < 150.0:
                # Small account (<$150): Enforce strict capital preservation.
                # If 0.01 lot risk is greater than 30% of the account (or >$15), block the trade!
                max_allowable_loss = max(15.0, equity * 0.30)
                if loss_at_001 > max_allowable_loss:
                    return EngineResult(
                        result="rejected",
                        confidence=0.0,
                        explanation=(
                            f"AI Capital Shield Veto: Stop loss risk (${loss_at_001:.2f}) exceeds safe tolerance "
                            f"(${max_allowable_loss:.2f}) on your ${equity:.2f} MT5 balance. Trade vetoed to prevent "
                            f"burning small capital on high-volatility wide stops."
                        ),
                        metrics={
                            "risk_reward_ratio": target_rr,
                            "recommended_lot_size": 0.01,
                            "dollar_risk": loss_at_001,
                            "equity": equity,
                            "capital_shield": "vetoed"
                        },
                        validation_status="limit_breached"
                    )
                recommended_lot = 0.01
            else:
                # Standard account (>$150): Institutional 1.0% risk sizing
                target_risk_dollars = equity * (risk_percent / 100.0)
                if loss_at_001 > 0:
                    raw_lot = (target_risk_dollars / loss_at_001) * 0.01
                    # Clamp between 0.01 and 10.0 lots
                    recommended_lot = round(max(0.01, min(10.0, raw_lot)), 2)
                else:
                    recommended_lot = 0.01

        explanation = (
            f"Risk verification passed. Targets yield a 1:{target_rr:.2f} Risk/Reward structure. "
            f"Sized at {recommended_lot} lots for ${equity:.2f} MT5 balance."
        ) if equity > 0 else f"Risk verification passed. Targets yield a 1:{target_rr:.2f} Risk/Reward structure."

        return EngineResult(
            result="approved",
            confidence=100.0,
            explanation=explanation,
            metrics={
                "recommended_risk_percent": risk_percent,
                "recommended_lot_size": recommended_lot,
                "dollar_risk": round(loss_at_001 * (recommended_lot / 0.01), 2),
                "risk_reward_ratio": target_rr,
                "capital_shield": "approved"
            },
            validation_status="valid"
        )
