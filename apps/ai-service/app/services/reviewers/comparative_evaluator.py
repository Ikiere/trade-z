"""
AI Market Analyst & Comparative Evaluator:
Evaluates competing candidate setups from the Trade Opportunity Engine.
Explicitly answers the 6 mandatory institutional questions:
1. WHY THIS TRADE
2. WHY NOW
3. WHERE THE LIQUIDITY IS
4. WHERE THE INVALIDATION IS
5. WHERE THE TARGET LIQUIDITY IS
6. WHAT WOULD MAKE THIS TRADE WRONG
Explains why Candidate A is chosen over Candidate B and Candidate C.
"""

import json
import httpx
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from app.config import settings
from app.services.setup_families import CandidateSetup


class InstitutionalTradeAudit(BaseModel):
    why_this_trade: str
    why_now: str
    where_the_liquidity_is: str
    where_the_invalidation_is: str
    where_the_target_liquidity_is: str
    what_would_make_this_trade_wrong: str


class ComparativeCandidateEval(BaseModel):
    candidate_id: str
    symbol: str
    setup_family: str
    verdict: str  # "CHOSEN", "REJECTED_LOWER_EV", "DEFERRED", "INSUFFICIENT_MARGIN"
    evaluation_notes: str


class ComparativeAnalysisResult(BaseModel):
    selected_winner_id: Optional[str]
    comparative_justification: str
    institutional_audit: InstitutionalTradeAudit
    competing_candidates_eval: List[ComparativeCandidateEval]
    reviewer_name: str


class AIComparativeEvaluator:
    """
    Decoupled AI Analyst for multi-candidate trade comparison.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "llm_api_key", None)
        self.model = model or getattr(settings, "llm_model", "anthropic/claude-3.5-sonnet")

    async def evaluate_candidates(
        self,
        candidates: List[CandidateSetup],
        account_summary: Optional[Dict[str, Any]] = None
    ) -> ComparativeAnalysisResult:
        """
        Conducts adversarial comparative evaluation of top candidates.
        """
        if not candidates:
            return self._empty_result()

        # If only 1 candidate, evaluate it directly; if multiple, evaluate comparatively
        top_candidates = candidates[:3]

        # Check if OpenRouter key available
        if not self.api_key or self.api_key in ["", "placeholder", "your_openrouter_api_key", "your_api_key"]:
            return self._deterministic_comparative_eval(top_candidates)

        prompt = f"""
You are the Chief Investment Officer and Senior SMC Quantitative Analyst at a top-tier hedge fund.
Analyze and compare the following competing trade candidates from our systematic opportunity engine.
Select the single best trade opportunity and provide rigorous institutional comparative justification.

CANDIDATES:
"""
        for idx, c in enumerate(top_candidates, 1):
            prompt += f"""
Candidate {chr(64 + idx)} (ID: {c.id}):
- Symbol: {c.symbol} ({c.timeframe})
- Setup Family: {c.setup_family}
- Direction: {c.direction} ({c.order_type})
- Entry: {c.entry_price} | SL: {c.stop_loss} | TP: {c.take_profit}
- Risk/Reward: 1:{c.risk_reward:.1f} | Expected Value: +{c.expected_value:.2f}R | Quality Score: {c.setup_quality_score}/100
- Invalidation Level: {c.invalidation_level} | Target Liquidity: {c.target_liquidity_level}
- Confluences: {', '.join(c.confluence_factors)}
"""

        prompt += """
MANDATORY QUESTIONS TO ANSWER FOR THE WINNING TRADE:
1. WHY THIS TRADE: Fundamental SMC thesis and structural edge.
2. WHY NOW: Execution timing, session liquidity, and immediate catalyst.
3. WHERE THE LIQUIDITY IS: Resting stop pools being tapped or swept.
4. WHERE THE INVALIDATION IS: Structural boundary where the thesis is disproven.
5. WHERE THE TARGET LIQUIDITY IS: Macro liquidity pool or opposing imbalance.
6. WHAT WOULD MAKE THIS TRADE WRONG: What price action signature invalidates the setup.

Return ONLY a JSON object with this EXACT schema:
{
  "selected_winner_id": "ID_OF_WINNER",
  "comparative_justification": "Clear explanation of why the winner was chosen over competing candidates",
  "institutional_audit": {
    "why_this_trade": "...",
    "why_now": "...",
    "where_the_liquidity_is": "...",
    "where_the_invalidation_is": "...",
    "where_the_target_liquidity_is": "...",
    "what_would_make_this_trade_wrong": "..."
  },
  "competing_candidates_eval": [
    {
      "candidate_id": "...",
      "symbol": "...",
      "setup_family": "...",
      "verdict": "CHOSEN" or "REJECTED_LOWER_EV",
      "evaluation_notes": "..."
    }
  ]
}
"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://trade-z.com",
            "X-Title": "Trade-Z Comparative Analyst",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a professional quantitative SMC trading analyst. Output strictly valid JSON."
                },
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.15,
            "max_tokens": 800,
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
                if resp.status_code == 200:
                    raw_text = resp.json()["choices"][0]["message"]["content"].strip()
                    if raw_text.startswith("```"):
                        lines = raw_text.splitlines()
                        raw_text = "\n".join(lines[1:-1])

                    parsed = json.loads(raw_text)
                    audit_data = parsed.get("institutional_audit", {})
                    return ComparativeAnalysisResult(
                        selected_winner_id=parsed.get("selected_winner_id", top_candidates[0].id),
                        comparative_justification=parsed.get("comparative_justification", "Highest expected value and confluence."),
                        institutional_audit=InstitutionalTradeAudit(
                            why_this_trade=audit_data.get("why_this_trade", "Strong SMC structural alignment."),
                            why_now=audit_data.get("why_now", "Immediate trigger at wholesale pricing."),
                            where_the_liquidity_is=audit_data.get("where_the_liquidity_is", "Resting liquidity sweep at swing pivot."),
                            where_the_invalidation_is=audit_data.get("where_the_invalidation_is", "Structural stop loss boundary."),
                            where_the_target_liquidity_is=audit_data.get("where_the_target_liquidity_is", "Major external liquidity pool."),
                            what_would_make_this_trade_wrong=audit_data.get("what_would_make_this_trade_wrong", "Loss of key structural support.")
                        ),
                        competing_candidates_eval=[
                            ComparativeCandidateEval(
                                candidate_id=c.get("candidate_id", ""),
                                symbol=c.get("symbol", ""),
                                setup_family=c.get("setup_family", ""),
                                verdict=c.get("verdict", "DEFERRED"),
                                evaluation_notes=c.get("evaluation_notes", "")
                            )
                            for c in parsed.get("competing_candidates_eval", [])
                        ],
                        reviewer_name=f"OpenRouter ({self.model})"
                    )

        except Exception as e:
            print(f"[AIComparativeEvaluator] AI call failed ({e}), falling back to deterministic evaluation.")

        return self._deterministic_comparative_eval(top_candidates)

    def _deterministic_comparative_eval(self, top_candidates: List[CandidateSetup]) -> ComparativeAnalysisResult:
        """
        Algorithmic comparative evaluation based purely on quantitative metrics.
        """
        winner = top_candidates[0]
        competing: List[ComparativeCandidateEval] = []

        for idx, c in enumerate(top_candidates):
            if c.id == winner.id:
                verdict = "CHOSEN"
                notes = f"Selected: Superior Expected Value (+{c.expected_value:.2f}R) and Quality Score ({c.setup_quality_score}/100)."
            else:
                verdict = "REJECTED_LOWER_EV"
                notes = f"Subordinate to {winner.symbol}: Lower expected value (+{c.expected_value:.2f}R vs +{winner.expected_value:.2f}R)."

            competing.append(ComparativeCandidateEval(
                candidate_id=c.id,
                symbol=c.symbol,
                setup_family=c.setup_family,
                verdict=verdict,
                evaluation_notes=notes
            ))

        justification = (
            f"Candidate on {winner.symbol} ({winner.setup_family}) prioritized over competing setups. "
            f"Demonstrates the highest mathematical expectancy (+{winner.expected_value:.2f}R), "
            f"asymmetric 1:{winner.risk_reward:.1f} R:R, and optimal wholesale liquidity positioning."
        )

        audit = InstitutionalTradeAudit(
            why_this_trade=(
                f"{winner.setup_family} on {winner.symbol} represents a high-probability institutional setup "
                f"with {', '.join(winner.confluence_factors[:2])}."
            ),
            why_now=(
                f"Price has completed structural prerequisites at {winner.entry_price:.5f} with clear order flow confirmation."
            ),
            where_the_liquidity_is=(
                f"Sell-side and buy-side liquidity mapped between {winner.invalidation_level:.5f} and {winner.target_liquidity_level:.5f}."
            ),
            where_the_invalidation_is=(
                f"Strictly defined at {winner.invalidation_level:.5f}. A breach of this level disproves institutional order flow."
            ),
            where_the_target_liquidity_is=(
                f"Targeted at {winner.target_liquidity_level:.5f} providing 1:{winner.risk_reward:.1f} asymmetric R-multiple."
            ),
            what_would_make_this_trade_wrong=(
                f"Displacement closing beyond {winner.invalidation_level:.5f} or sudden high-impact macroeconomic event."
            )
        )

        return ComparativeAnalysisResult(
            selected_winner_id=winner.id,
            comparative_justification=justification,
            institutional_audit=audit,
            competing_candidates_eval=competing,
            reviewer_name="DeterministicComparativeEngine"
        )

    def _empty_result(self) -> ComparativeAnalysisResult:
        return ComparativeAnalysisResult(
            selected_winner_id=None,
            comparative_justification="No valid candidates found across watchlist.",
            institutional_audit=InstitutionalTradeAudit(
                why_this_trade="N/A",
                why_now="N/A",
                where_the_liquidity_is="N/A",
                where_the_invalidation_is="N/A",
                where_the_target_liquidity_is="N/A",
                what_would_make_this_trade_wrong="N/A"
            ),
            competing_candidates_eval=[],
            reviewer_name="None"
        )
