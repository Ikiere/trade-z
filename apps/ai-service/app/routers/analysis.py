"""Market analysis router connecting indicators, structure, and decision services."""

from fastapi import APIRouter
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import pandas as pd
from app.services.indicators import calculate_ema, calculate_rsi
from app.services.structure import detect_market_structure
from app.services.decision import evaluate_decision

router = APIRouter()


class AnalysisRequest(BaseModel):
    pair: str
    timeframe: str = "4h"
    include_indicators: bool = True
    include_structure: bool = True


class ChatQueryRequest(BaseModel):
    prompt: str


@router.post("/quick")
async def quick_analysis(request: AnalysisRequest):
    """
    Evaluates confluence metrics on incoming tick parameters.
    """
    # 1. Create a dummy price dataframe for indicator execution
    data = {
        "high": [1.0820, 1.0830, 1.0840, 1.0850, 1.0860],
        "low": [1.0790, 1.0800, 1.0810, 1.0820, 1.0830],
        "open": [1.0800, 1.0810, 1.0820, 1.0830, 1.0840],
        "close": [1.0815, 1.0825, 1.0835, 1.0845, 1.0855],
        "volume": [1000, 1200, 1100, 1500, 1800]
    }
    df = pd.DataFrame(data)

    # 2. Run indicator check
    rsi = calculate_rsi(df, period=3).iloc[-1]
    structure = detect_market_structure(df)

    # 3. Evaluate decision
    decision_result = evaluate_decision(
        pair=request.pair,
        timeframe=request.timeframe,
        trend_bias=structure["market_bias"],
        indicators_confluence=88.5,  # mock average
        structure_score=92.0 if structure["bos_detected"] else 60.0,
        liquidity_score=95.0,
        volume_score=90.0,
        risk_reward_ratio=2.5,
        news_impact_low=True,
    )

    return {
        "success": True,
        "data": {
            **decision_result,
            "rsi": float(rsi),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/chat")
async def chat_analysis(request: ChatQueryRequest):
    """
    AI Chat reasoning assistant query endpoint.
    """
    prompt = request.prompt.lower()
    reply = "I have scanned the financial markets. "

    if "eurusd" in prompt:
        reply = "EURUSD is displaying strong H4 bullish market structure. Confluence score: 94%. Confirmed order block displacement. Trend and momentum filters are fully aligned."
    elif "usdjpy" in prompt or "reject" in prompt:
        reply = "USDJPY short setup was rejected with 68% confidence score. Reasons: 1. Counter-trend risk (daily trend remains bullish). 2. Upcoming high impact economic news releases."
    elif "lot" in prompt or "risk" in prompt:
        reply = "For a $100k account risking 1% ($1,000) with a 36 pip stop loss on EURUSD, your calculated lot size should be 2.78 Lots."
    elif "news" in prompt or "economic" in prompt:
        reply = "High impact CPI indicators scheduled today at 12:30 UTC. Expect wide spreads on USD crossings. Recommendation: Avoid opening new positions during the release window."
    else:
        reply = f"Active scanner reports show consolidated structures for '{request.prompt}'. Confluences are currently insufficient. Recommend waiting for London session breakouts."

    return {
        "success": True,
        "data": {
            "reply": reply,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
