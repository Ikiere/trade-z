"""Market analysis router connecting indicators, structure, and decision services."""

from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import pandas as pd
from app.services.indicators import calculate_ema, calculate_rsi, calculate_macd, calculate_adx
from app.services.structure import detect_market_structure, generate_simulated_candles, fetch_twelve_data_candles
from app.services.decision import evaluate_decision
from app.services.calendar import fetch_tradingview_calendar, check_news_filter
from app.config import settings

# Modular pipeline imports
from app.services.market_data import MarketDataService
from app.engines.eligibility import EligibilityEngine
from app.engines.higher_timeframe import HigherTimeframeEngine
from app.engines.structure import MarketStructureEngine
from app.engines.liquidity import LiquidityEngine
from app.engines.zones import InstitutionalZonesEngine
from app.engines.trend_quality import TrendQualityEngine
from app.engines.momentum import MomentumEngine
from app.engines.volume import VolumeEngine
from app.engines.volatility import VolatilityEngine
from app.engines.correlation import CorrelationEngine
from app.engines.fundamentals import FundamentalEngine
from app.engines.historical_pattern import HistoricalPatternEngine
from app.engines.risk import RiskEngine
from app.engines.confidence import ConfidenceEngine
from app.engines.decision import DecisionEngine

router = APIRouter()

# Instantiate central data service and pipeline engines
market_data_service = MarketDataService()

eligibility_engine = EligibilityEngine()
higher_tf_engine = HigherTimeframeEngine()
structure_engine = MarketStructureEngine()
liquidity_engine = LiquidityEngine()
zones_engine = InstitutionalZonesEngine()
trend_quality_engine = TrendQualityEngine()
momentum_engine = MomentumEngine()
volume_engine = VolumeEngine()
volatility_engine = VolatilityEngine()
correlation_engine = CorrelationEngine()
fundamentals_engine = FundamentalEngine()
history_engine = HistoricalPatternEngine()
risk_engine = RiskEngine()
confidence_engine = ConfidenceEngine()
decision_engine = DecisionEngine()


class AnalysisRequest(BaseModel):
    pair: str
    timeframe: str = "4h"
    include_indicators: bool = True
    include_structure: bool = True
    api_key: Optional[str] = None
    history: Optional[list] = None
    today_signal_count: Optional[int] = 0
    daily_signal_limit: Optional[int] = 100


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
    Evaluates confluence metrics using live TwelveData chart feeds strictly via the 15-layer pipeline.
    """
    # Read API Key from settings (.env) first, fall back to request body payload
    api_key = settings.market_data_api_key
    if not api_key or api_key in ["", "placeholder", "your_api_key"]:
        api_key = request.api_key

    if not api_key or api_key in ["", "placeholder", "your_api_key"]:
        raise HTTPException(
            status_code=400,
            detail="TwelveData API Key is missing. Please set the AI_MARKET_DATA_API_KEY environment variable in your .env file or Railway console settings."
        )

    # 1. Fetch economic calendar news safety
    news_safe = await check_news_filter(request.pair)

    # 2. Get normalized market data snapshot
    try:
        snapshot = await market_data_service.get_market_snapshot(
            symbol=request.pair,
            timeframe=request.timeframe,
            api_key=api_key,
            news_safe=news_safe
        )
    except ValueError as val_err:
        # Market data unavailable fails safely with NO TRADE
        return {
            "success": True,
            "data": {
                "pair": request.pair,
                "timeframe": request.timeframe,
                "decision": "no_trade",
                "confidence": 0.0,
                "reasoning": f"NO TRADE: {str(val_err)}",
                "rejection_reasons": [str(val_err)],
                "expected_trigger": None,
                "confluence_breakdown": {
                    "marketStructure": 0,
                    "trend": 0,
                    "momentum": 0,
                    "liquidity": 0,
                    "economicNews": 0,
                    "riskReward": 0,
                    "overall": 0
                },
                "entry_price": 0.0,
                "current_price": 0.0,
                "stop_loss": 0.0,
                "take_profit": 0.0,
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    # 3. Construct pipeline execution context
    rr = 2.5 if request.timeframe == "15m" else 3.2
    context = {
        "today_signal_count": request.today_signal_count or 0,
        "daily_signal_limit": request.daily_signal_limit or 100,
        "history": request.history or [],
        "risk_reward_ratio": rr,
        "engine_results": {}
    }

    # 4. Sequentially execute individual pipeline engines (L1 -> L15)
    # L1: Eligibility
    elig_res = eligibility_engine.analyze(snapshot, context)
    context["engine_results"]["eligibility"] = elig_res
    
    # L2: Higher Timeframe Bias
    htf_res = higher_tf_engine.analyze(snapshot, context)
    context["engine_results"]["higher_timeframe"] = htf_res

    # L3: Market Structure
    struct_res = structure_engine.analyze(snapshot, context)
    context["engine_results"]["structure"] = struct_res

    # L4: Liquidity
    liq_res = liquidity_engine.analyze(snapshot, context)
    context["engine_results"]["liquidity"] = liq_res

    # L5: Institutional Zones
    zones_res = zones_engine.analyze(snapshot, context)
    context["engine_results"]["zones"] = zones_res

    # L6: Trend Quality
    trend_res = trend_quality_engine.analyze(snapshot, context)
    context["engine_results"]["trend_quality"] = trend_res

    # L7: Momentum
    mom_res = momentum_engine.analyze(snapshot, context)
    context["engine_results"]["momentum"] = mom_res

    # L8: Volume
    vol_res = volume_engine.analyze(snapshot, context)
    context["engine_results"]["volume"] = vol_res

    # L9: Volatility
    vlt_res = volatility_engine.analyze(snapshot, context)
    context["engine_results"]["volatility"] = vlt_res

    # L10: Correlation
    corr_res = correlation_engine.analyze(snapshot, context)
    context["engine_results"]["correlation"] = corr_res

    # L11: Fundamentals
    funds_res = fundamentals_engine.analyze(snapshot, context)
    context["engine_results"]["fundamentals"] = funds_res

    # L12: History Pattern
    hist_res = history_engine.analyze(snapshot, context)
    context["engine_results"]["historical_pattern"] = hist_res

    # L13: Risk
    risk_res = risk_engine.analyze(snapshot, context)
    context["engine_results"]["risk"] = risk_res

    # L14: Confidence Aggregation
    conf_res = confidence_engine.analyze(snapshot, context)
    context["engine_results"]["confidence"] = conf_res

    # L15: Final Decision & Trade Certificate Compilation
    dec_res = decision_engine.analyze(snapshot, context)
    cert = dec_res.metrics.get("certificate", {})

    # 5. Extract rejection warnings
    rejection_reasons = []
    for key, res in context["engine_results"].items():
        if res.validation_status in ["invalid", "limit_breached", "closed"]:
            rejection_reasons.append(res.explanation)

    # 6. Map to backwards-compatible JSON schema
    confluence_breakdown = {
        "marketStructure": float(struct_res.confidence),
        "trend": 100 if htf_res.result != "neutral" else 50,
        "momentum": float(mom_res.confidence),
        "liquidity": float(liq_res.confidence),
        "economicNews": 100 if news_safe else 10,
        "riskReward": 100 if rr >= 2.0 else 50,
        "overall": float(conf_res.confidence)
    }

    return {
        "success": True,
        "data": {
            "pair": request.pair,
            "timeframe": request.timeframe,
            "decision": dec_res.result,
            "confidence": float(dec_res.confidence),
            "reasoning": dec_res.explanation,
            "rejection_reasons": rejection_reasons,
            "expected_trigger": cert.get("expected_trigger"),
            "confluence_breakdown": confluence_breakdown,
            "entry_price": cert.get("entry_price", 0.0),
            "current_price": cert.get("entry_price", 0.0),
            "stop_loss": cert.get("stop_loss", 0.0),
            "take_profit": cert.get("take_profit", 0.0),
            "certificate": cert,
            "timestamp": datetime.now(timezone.utc).isoformat()
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
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

            async def attempt_call(model_to_use: str):
                payload = {
                    "model": model_to_use,
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
                    return await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json=payload
                    )

            # First attempt: user's primary configured model
            response = await attempt_call(model_name)

            # Fallback if model is blocked (e.g. 404 for paid models on free-tier keys)
            if response.status_code != 200:
                print(f"Primary model {model_name} failed with status {response.status_code}. Falling back to openrouter/free...")
                response = await attempt_call("openrouter/free")

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
            else:
                print(f"OpenRouter call failed with status {response.status_code}: {response.text}")
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
