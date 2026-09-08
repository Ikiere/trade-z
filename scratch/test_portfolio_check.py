import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))

from app.services.portfolio_risk import portfolio_risk_engine, PortfolioPosition

# Position 1: XAUUSD Long (Gold base, USD quote)
# If someone is Long XAUUSD, they are Short USD!
existing = [
    PortfolioPosition(
        ticket=100001,
        symbol="XAUUSD",
        direction="long",
        volume=0.01,
        entry_price=2756.0,
        stop_loss=2755.0,
        take_profit=2780.0,
        risk_amount=1.0,
        required_margin=1.5,
        unrealized_pnl=0.0
    )
]

# Candidate: EURUSD BUY (EUR base, USD quote) -> also Short USD!
can_add, reason = portfolio_risk_engine.evaluate_new_trade(
    current_positions=existing,
    candidate_symbol="EURUSD",
    candidate_direction="BUY",
    risk_amount=1.0,
    required_margin=1.0,
    account_equity=100.0,
    used_margin=1.5
)

print(f"Can add EURUSD alongside XAUUSD? {can_add}")
print(f"Reason: {reason}")
