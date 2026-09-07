"""
OpenRouter AI Decision Reviewer
Implements a decoupled, read-only AI Critic that scrutinizes deterministic SMC trade setups.
"""

import json
import httpx
from typing import Dict, Any, Optional
from app.config import settings
from app.services.reviewers.base import TradingDecisionReviewer, ReviewResult


class OpenRouterReviewer(TradingDecisionReviewer):
    """
    Decoupled AI Critic.
    Scrutinizes deterministic setups against SMC rules and risk constraints.
    Cannot place orders or alter risk parameters.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "llm_api_key", None)
        self.model = model or getattr(settings, "llm_model", "google/gemini-2.0-flash-001")

    async def review_setup(self, setup_summary: dict) -> ReviewResult:
        """
        Submits setup to OpenRouter for adversarial review.
        """
        # Guard: If no valid API key configured, return fallback
        if not self.api_key or self.api_key in ["", "placeholder", "your_openrouter_api_key", "your_api_key"]:
            return ReviewResult(
                decision="APPROVE",
                reason_codes=["NO_AI_KEY_CONFIGURED", "DETERMINISTIC_PASS"],
                contradictions=[],
                risk_flags=[],
                setup_quality=float(setup_summary.get("confidence", 75.0)),
                reviewer_name="DeterministicReviewerFallback",
                critic_notes="OpenRouter API key not configured. Deterministic SMC layer rules accepted."
            )

        prompt = f"""
You are the Chief Risk Officer and Senior Smart Money Concepts (SMC) Critic at an institutional quant fund.
Review the following deterministic trade candidate rigorously.
Your ONLY role is to act as an adversarial critic to protect capital. You CANNOT place trades.

PROPOSED SETUP:
- Symbol: {setup_summary.get('symbol')}
- Timeframe: {setup_summary.get('timeframe')}
- Direction: {setup_summary.get('direction')}
- Order Type: {setup_summary.get('order_type')}
- Proposed Entry: {setup_summary.get('entry_price')}
- Proposed Stop Loss: {setup_summary.get('stop_loss')}
- Proposed Take Profit: {setup_summary.get('take_profit')}
- Risk / Reward Ratio: {setup_summary.get('risk_reward')}
- SMC Quality Score: {setup_summary.get('confidence')}
- Market Structure: {setup_summary.get('market_structure_summary')}
- Liquidity Sweep Findings: {setup_summary.get('liquidity_findings')}
- Institutional Zones: {setup_summary.get('institutional_zones')}
- Higher Timeframe Bias: {setup_summary.get('higher_timeframe_bias')}

RULES FOR REVIEW:
1. Reject if a BUY is chasing deep into Premium without a confirmed liquidity sweep.
2. Reject if a SELL is chasing deep into Discount without a confirmed liquidity sweep.
3. Reject if higher timeframe trend explicitly contradicts the entry direction without reversal confirmation.
4. Reject if entry is directly into an unmitigated opposing Order Block or Fair Value Gap.
5. If no lethal contradictions exist, output APPROVE. If minor ambiguity exists, output REQUEST_MORE_DATA. If structural violations exist, output REJECT.

Return ONLY a JSON object with this EXACT schema:
{{
  "decision": "APPROVE" | "REJECT" | "REQUEST_MORE_DATA",
  "reason_codes": ["STRING_CODE_1", "STRING_CODE_2"],
  "contradictions": ["description of any contradiction spotted"],
  "risk_flags": ["description of any risk flag"],
  "setup_quality": 0-100,
  "critic_notes": "concise 2-sentence rationale"
}}
"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://trade-z.com",
            "X-Title": "Trade-Z Institutional SMC Reviewer",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a strict institutional trade reviewer. Respond ONLY with valid JSON."
                },
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 400,
        }

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload
                )

                if response.status_code != 200:
                    print(f"[OpenRouterReviewer] HTTP {response.status_code}: {response.text}")
                    return ReviewResult(
                        decision="APPROVE",
                        reason_codes=["OPENROUTER_HTTP_ERROR", "DETERMINISTIC_PASS"],
                        contradictions=[],
                        risk_flags=["AI_CRITIC_UNAVAILABLE"],
                        setup_quality=float(setup_summary.get("confidence", 75.0)),
                        reviewer_name="DeterministicReviewerFallback",
                        critic_notes=f"OpenRouter returned HTTP {response.status_code}. Using deterministic SMC validation."
                    )

                data = response.json()
                content = data["choices"][0]["message"]["content"].strip()
                # Clean code blocks if present
                if content.startswith("```"):
                    lines = content.splitlines()
                    content = "\n".join(lines[1:-1])

                parsed = json.loads(content)
                decision = str(parsed.get("decision", "APPROVE")).upper().strip()
                if decision not in ["APPROVE", "REJECT", "REQUEST_MORE_DATA"]:
                    decision = "APPROVE"

                return ReviewResult(
                    decision=decision,
                    reason_codes=parsed.get("reason_codes", []),
                    contradictions=parsed.get("contradictions", []),
                    risk_flags=parsed.get("risk_flags", []),
                    setup_quality=float(parsed.get("setup_quality", setup_summary.get("confidence", 75.0))),
                    reviewer_name=f"OpenRouter ({self.model})",
                    critic_notes=str(parsed.get("critic_notes", ""))
                )

        except Exception as e:
            print(f"[OpenRouterReviewer] AI Critic review exception: {e}")
            return ReviewResult(
                decision="APPROVE",
                reason_codes=["CRITIC_EXCEPTION", "DETERMINISTIC_PASS"],
                contradictions=[],
                risk_flags=["AI_TIMEOUT_FALLBACK"],
                setup_quality=float(setup_summary.get("confidence", 75.0)),
                reviewer_name="DeterministicReviewerFallback",
                critic_notes=f"AI Critic timed out or parse failed ({str(e)}). Deterministic SMC execution maintained."
            )
