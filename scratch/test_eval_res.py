import sys
import os
sys.path.insert(0, os.path.abspath("apps/ai-service"))

from app.services.reviewers.comparative_evaluator import comparative_evaluator
from app.services.setup_families import CandidateSetup

cand = CandidateSetup(
    id="SETUP-EURUSD-1",
    setup_id="SETUP-EURUSD-1",
    symbol="EURUSD",
    setup_family="BOS_FVG_CONTINUATION",
    direction="BUY",
    order_type="market",
    entry_price=1.0850,
    stop_loss=1.0830,
    take_profit=1.0900,
    risk_reward=2.5,
    invalidation_level=1.0825,
    target_liquidity_level=1.0910,
    setup_quality_score=85.0,
    expected_value=0.45
)

res = comparative_evaluator.evaluate_candidates_sync([cand])
print(f"Action: {res.action}")
print(f"Selected: {res.selected_candidate}")
print(f"Winner ID: {res.selected_winner_id}")
print(f"Confidence: {res.confidence}")
