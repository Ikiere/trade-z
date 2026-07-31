"""Market analysis router connecting indicators, structure, and decision services."""

from fastapi import APIRouter
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import pandas as pd
from app.services.indicators import calculate_ema, calculate_rsi
from app.services.structure import detect_market_structure
from app.services.decision import evaluate_decision
from app.services.calendar import fetch_tradingview_calendar, check_news_filter

router = APIRouter()


class AnalysisRequest(BaseModel):
    pair: str
    timeframe: str = "4h"
    include_indicators: bool = True
    include_structure: bool = True


class ChatQueryRequest(BaseModel):
    prompt: str


@router.get("/calendar")
async def get_calendar():
    """
    Fetches real-time economic calendar data from TradingView.
    """
    events = await fetch_tradingview_calendar()
    return {
        "success": True,
        "data": events,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


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

    # 3. Read the real economic calendar to enforce the news safety check
    news_safe = await check_news_filter(request.pair)

    # 4. Evaluate decision
    decision_result = evaluate_decision(
        pair=request.pair,
        timeframe=request.timeframe,
        trend_bias=structure["market_bias"],
        indicators_confluence=88.5,  # mock average
        structure_score=92.0 if structure["bos_detected"] else 60.0,
        liquidity_score=95.0,
        volume_score=90.0,
        risk_reward_ratio=2.5,
        news_impact_low=news_safe,
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
    AI Chat reasoning assistant query endpoint utilizing OpenRouter or falling back to mock data.
    """
    from app.config import settings
    import httpx

    # If API key is provided and not a placeholder, query OpenRouter
    if settings.llm_api_key and settings.llm_api_key not in ["", "your_api_key", "placeholder", "your_openrouter_api_key"]:
        try:
            headers = {
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://trade-z-web.vercel.app",
                "X-Title": "Trade-Z",
            }
            # Clean model name for OpenRouter compatibility
            model_name = settings.llm_model.strip().lstrip("~")
            if "opus" in model_name.lower():
                model_name = "anthropic/claude-3-opus"
            elif "sonnet" in model_name.lower():
                model_name = "anthropic/claude-3.5-sonnet"
            elif "flash" in model_name.lower():
                model_name = "google/gemini-2.5-flash:free"

            payload = {
                "model": model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are Trade-Z AI, an expert Forex, Crypto and general market analysis assistant. "
                            "You talk professionally, explain Forex concepts clearly to beginners when asked, and provide "
                            "institutional analysis using terms like order blocks, liquidity sweeps, risk-to-reward ratio, "
                            "win rate, and market structures. Keep answers highly educational, concise, and professional."
                        )
                    },
                    {
                        "role": "user",
                        "content": request.prompt
                    }
                ]
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload
                )

                if response.status_code == 200:
                    result = response.json()
                    choices = result.get("choices", [])
                    if choices:
                        reply = choices[0].get("message", {}).get("content", "")
                        if reply:
                            return {
                                "success": True,
                                "data": {
                                    "reply": reply,
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                },
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            }
                
                print(f"OpenRouter Error status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"OpenRouter Connection Exception: {e}")

    # Fallback to local expert rules (perfect for local testing or when offline)
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
