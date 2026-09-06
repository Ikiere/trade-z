"""AI Backtesting & Learning Router."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.services.backtester import AIBacktester

router = APIRouter()
backtester = AIBacktester()


class BacktestRequest(BaseModel):
    pair: str = "EURUSD"
    timeframe: str = "15m"
    bars: int = 150
    risk_reward: float = 2.5
    min_confidence: float = 65.0


class TeachRequest(BaseModel):
    backtest_data: Dict[str, Any]


@router.post("/run")
async def run_backtest_endpoint(request: BacktestRequest):
    """
    Executes a historical step-through backtest over market candles.
    """
    results = backtester.run_simulation(
        symbol=request.pair,
        timeframe=request.timeframe,
        bars=request.bars,
        risk_reward=request.risk_reward,
        min_confidence=request.min_confidence
    )
    return results


@router.post("/teach")
async def teach_ai_endpoint(request: TeachRequest):
    """
    Analyzes winning vs losing setups to derive optimal strategy rules.
    """
    learning_report = backtester.teach_ai(request.backtest_data)
    return learning_report


@router.get("/profile")
async def get_strategy_profile():
    """
    Returns the active optimized strategy parameters.
    """
    return {
        "success": True,
        "profile": {
            "name": "Trade-Z Institutional SMC v2.0",
            "min_confidence_threshold": 70.0,
            "default_risk_reward": 2.5,
            "weights": {
                "structure": 0.22,
                "higher_timeframe": 0.20,
                "liquidity": 0.18,
                "zones": 0.18,
                "fundamentals": 0.08,
                "volume": 0.06,
                "trend_quality": 0.04,
                "momentum": 0.02,
                "volatility": 0.02
            }
        }
    }
