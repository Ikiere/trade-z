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

        from app.services.asset_classifier import classify_asset
        asset_info = classify_asset(snapshot.symbol)
        symbol = asset_info["symbol"]
        is_gold = asset_info["category"] == "commodity" and "metal" in asset_info.get("sub_category", "")
        is_crypto = asset_info["is_crypto"]
        is_jpy = "JPY" in symbol
        current_close = float(snapshot.df["close"].iloc[-1]) if len(snapshot.df) > 0 else asset_info["base_price"]

        # Asset-specific estimated SL distance (points)
        if is_gold:
            sl_points = 6.50
            loss_at_001 = sl_points * 1.0  # 1 pip/point in gold = $1.00 at 0.01 lot
        elif is_crypto:
            # Dynamic ATR scaling for BTC and all Altcoins
            atr_pct = asset_info.get("typical_atr_pct", 0.035)
            sl_points = current_close * atr_pct
            # Dollar loss on standard broker micro-lot (0.01 lot):
            # For BTC: 0.01 lot * $2000 move = $20. For micro-priced altcoins: proportional
            if current_close > 1000:
                loss_at_001 = max(1.0, sl_points * 0.01)
            elif current_close > 10:
                loss_at_001 = max(0.80, (sl_points / current_close) * 15.0)
            else:
                loss_at_001 = max(0.50, (sl_points / (current_close or 1.0)) * 10.0)
        elif is_jpy:
            sl_points = 0.35  # ~35 pips
            loss_at_001 = (sl_points / 0.01) * 0.07  # ~$2.45 at 0.01 lot
        elif asset_info["category"] == "index":
            sl_points = current_close * 0.008
            loss_at_001 = max(1.50, sl_points * 0.01)
        else:
            sl_points = 0.0020  # 20 pips
            loss_at_001 = 2.00  # ~$2.00 at 0.01 lot

        # 3. Small Account Capital Shield Guard (Hard 0.5% - 2.0% Maximum Risk)
        recommended_lot = 0.01
        risk_percent = float(context.get("risk_percent", 1.0) or 1.0)
        # Institutional hard cap: 0.5% to 2.0%
        effective_risk_pct = min(max(risk_percent, 0.5), 2.0)

        if equity > 0:
            max_allowable_loss = equity * (effective_risk_pct / 100.0)

            # Check if broker minimum 0.01 volume exceeds allowed risk dollars
            if loss_at_001 > max_allowable_loss:
                pct_loss = (loss_at_001 / equity) * 100.0
                return EngineResult(
                    result="rejected",
                    confidence=0.0,
                    explanation=(
                        f"AI Capital Shield Veto: Minimum volume (0.01 lot) with required stop distance risks ${loss_at_001:.2f} "
                        f"({pct_loss:.1f}% of equity), exceeding your maximum allowed {effective_risk_pct:.1f}% risk "
                        f"(${max_allowable_loss:.2f}) on current ${equity:.2f} equity. Trade rejected under small-account safety rules."
                    ),
                    metrics={
                        "risk_reward_ratio": target_rr,
                        "recommended_lot_size": 0.0,
                        "dollar_risk": loss_at_001,
                        "equity": equity,
                        "max_allowable_loss": max_allowable_loss,
                        "capital_shield": "vetoed"
                    },
                    validation_status="limit_breached"
                )

            # Sizing for accounts where loss_at_001 <= max_allowable_loss
            raw_lot = (max_allowable_loss / loss_at_001) * 0.01
            # Round down to nearest 0.01, clamped between 0.01 and 10.0 lots
            recommended_lot = round(max(0.01, min(10.0, raw_lot)), 2)

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
