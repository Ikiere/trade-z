from abc import ABC, abstractmethod
from typing import Any, Dict
from pydantic import BaseModel
from app.services.market_data import MarketSnapshot


class EngineResult(BaseModel):
    """
    Standardized payload format produced by every pipeline engine layer.
    """
    result: Any
    confidence: float
    explanation: str
    metrics: Dict[str, Any]
    validation_status: str


class BaseEngine(ABC):
    """
    Abstract interface representing any layer of analysis in the
    multi-layer institutional decision pipeline.
    """
    @abstractmethod
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        """
        Executes analysis on the current market snapshot and context.
        Returns: EngineResult
        """
        pass
