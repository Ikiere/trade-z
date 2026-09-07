"""
Decoupled Trading Decision Reviewer Interface
LLMs operate strictly as non-executing critics (Reviewers), never as trade placers.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel, Field


class ReviewResult(BaseModel):
    """
    Standardized typed verdict produced by an AI or deterministic Reviewer.
    """
    decision: str = Field(..., description="Verdict: APPROVE, REJECT, or REQUEST_MORE_DATA")
    reason_codes: List[str] = Field(default_factory=list, description="Machine-readable reason tags")
    contradictions: List[str] = Field(default_factory=list, description="Contradictions spotted against SMC rules")
    risk_flags: List[str] = Field(default_factory=list, description="Risk flags identified")
    setup_quality: float = Field(default=50.0, description="Quality score 0-100")
    reviewer_name: str = Field(default="system", description="Identifier of the reviewer")
    critic_notes: str = Field(default="", description="Human-readable critique summary")


class TradingDecisionReviewer(ABC):
    """
    Abstract interface for trade setup critics.
    Reviewers evaluate deterministic setups and can only veto or approve.
    They NEVER execute MT5 trades directly.
    """

    @abstractmethod
    async def review_setup(self, setup_summary: dict) -> ReviewResult:
        """
        Reviews a proposed deterministic setup.
        Returns: ReviewResult
        """
        pass
