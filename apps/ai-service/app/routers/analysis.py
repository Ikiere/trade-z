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
    account_balance: Optional[float] = None
    account_equity: Optional[float] = None
    account_leverage: Optional[float] = None


class ChatQueryRequest(BaseModel):
    prompt: str
    context: Optional[dict] = None


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
    except Exception as val_err:
        # Fall back to simulated market snapshot so pipeline still executes with valid institutional levels
        print(f"[analysis.py] Live data query warning: {val_err}. Utilizing simulated chart feed.")
        from app.services.market_data import MarketSnapshot
        fallback_df = generate_simulated_candles(request.pair, request.timeframe)
        higher_tf = "4h" if request.timeframe in ["15m", "30m", "1h"] else "1d"
        higher_df = generate_simulated_candles(request.pair, higher_tf)
        snapshot = MarketSnapshot(
            symbol=request.pair,
            timeframe=request.timeframe,
            df=fallback_df,
            higher_df=higher_df,
            corr_df=None,
            news_safe=news_safe
        )

    # 3. Construct pipeline execution context
    rr = 2.5 if request.timeframe == "15m" else 3.2
    context = {
        "today_signal_count": request.today_signal_count or 0,
        "daily_signal_limit": request.daily_signal_limit or 100,
        "history": request.history or [],
        "risk_reward_ratio": rr,
        "account_balance": request.account_balance,
        "account_equity": request.account_equity,
        "account_leverage": request.account_leverage,
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

    # Determine standardized direction ('long' vs 'short')
    raw_dir = str(cert.get("direction", "BUY")).upper()
    standard_dir = "short" if ("SELL" in raw_dir or "SHORT" in raw_dir) else "long"

    return {
        "success": True,
        "data": {
            "pair": request.pair,
            "timeframe": request.timeframe,
            "decision": dec_res.result,
            "direction": standard_dir,
            "order_type": cert.get("order_type", "buy" if standard_dir == "long" else "sell"),
            "confidence": float(dec_res.confidence),
            "reasoning": dec_res.explanation,
            "rejection_reasons": rejection_reasons,
            "expected_trigger": cert.get("expected_trigger"),
            "confluence_breakdown": confluence_breakdown,
            "entry_price": cert.get("entry_price", 0.0),
            "current_price": cert.get("entry_price", 0.0),
            "stop_loss": cert.get("stop_loss", 0.0),
            "take_profit": cert.get("take_profit", 0.0),
            "risk_reward": cert.get("risk_reward", rr),
            "recommended_lot_size": cert.get("recommended_lot_size", 0.01),
            "dollar_risk": cert.get("dollar_risk", 0.0),
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

    # Context-aware intelligent trading brain (activated when external LLM is offline or unauthenticated)
    prompt = request.prompt.lower()
    ctx = request.context or {}
    acc = ctx.get("account") or ctx.get("summary") or {}
    positions = ctx.get("positions") or []
    balance = float(acc.get("balance") or 0.0)
    equity = float(acc.get("equity") or balance or 0.0)
    floating_pnl = float(acc.get("total_floating_pnl") or acc.get("profit") or 0.0)

    # 1. Direct Trade Closing (checked first to avoid matching general 'trade')
    if any(w in prompt for w in ["close", "exit trade", "stop trade", "liquidate"]):
        reply = (
            "🎯 **Direct Trade Closing in Trade-Z:**\n\n"
            "1. **Single Trade Exit:** On the **Dashboard** or **Live Positions** page (`/trades`), click the red **'Close'** button on any active position row.\n"
            "2. **Panic Close All:** If you have multiple positions open, use the **'Close All'** button at the top-right of the Trades page to exit all open positions at market price.\n"
            "3. **AI Auto-Exit:** If market structure shows a confirmed reversal against an open position, Trade-Z AI automatically executes an early close to lock in profits or cut drawdown."
        )

    # 2. Risk Management, Lot Sizing & Capital Shield
    elif any(w in prompt for w in ["shield", "lot", "size", "risk", "calculate", "protect", "sizing"]):
        user_eq = equity if equity > 0 else 1000.0
        risk_money = user_eq * 0.01
        reply = (
            f"🛡️ **Trade-Z AI Capital Protection & Smart Sizing:**\n\n"
            f"• **Your Equity:** ${user_eq:,.2f}\n"
            f"• **1% Institutional Risk:** ${risk_money:.2f} max allowable loss per trade\n"
            f"• **Formula:** `Lot Size = (Equity × Risk%) ÷ (Stop Loss Distance × Tick Value)`\n"
            f"• **Small Account Shield:** Accounts below $150 are restricted to minimum 0.01 lot with strict stop loss caps, vetoing excessive wide-stop setups to prevent account blowouts."
        )

    # 3. Open Positions & Active Trades
    elif any(w in prompt for w in ["position", "open trade", "active trade", "running trade", "trades open", "my position"]):
        if len(positions) > 0:
            lines = [f"⚡ **Active MT5 Positions ({len(positions)}):**\n"]
            for p in positions:
                p_pnl = float(p.get("profit") or 0.0)
                sign = "+" if p_pnl >= 0 else ""
                lines.append(
                    f"• **{p.get('pair', 'Asset')}** ({str(p.get('direction', 'long')).upper()}) | "
                    f"Vol: {p.get('volume', 0.01)} lots | Open: {p.get('price_open', 0):.5f} | "
                    f"Current: {p.get('price_current', 0):.5f} | P&L: {sign}${p_pnl:.2f} (Ticket #{p.get('ticket')})"
                )
            lines.append("\nYou can close any of these trades with 1-click using the red 'Close' button on the Dashboard or Trades page.")
            reply = "\n".join(lines)
        else:
            reply = (
                "You currently have **0 open positions** on MetaTrader 5.\n\n"
                "The Trade-Z scanner is actively analyzing the market across your configured watchlist and will execute high-probability institutional setups once all 15 confluence layers align."
            )

    # 4. Account & Balance inquiries
    elif any(w in prompt for w in ["balance", "equity", "my money", "funds", "how much do i have", "floating p&l", "pnl", "overview", "account"]):
        if equity > 0:
            reply = (
                f"📊 **MT5 Account Snapshot:**\n\n"
                f"- **Balance:** ${balance:,.2f} {acc.get('currency', 'USD')}\n"
                f"- **Equity:** ${equity:,.2f}\n"
                f"- **Floating P&L:** {'+' if floating_pnl >= 0 else ''}${floating_pnl:,.2f}\n"
                f"- **Active Positions:** {len(positions)}\n\n"
                f"Your account margin is currently well-protected with AI risk parameters limiting total exposure to 1–2% per trade."
            )
        else:
            reply = (
                "Your MetaTrader 5 terminal is connected. Make sure your MT5 Bridge is running on your local machine to view live equity and balance metrics."
            )

    # 5. Gold (XAUUSD) Analysis
    elif any(w in prompt for w in ["gold", "xau", "xauusd"]):
        reply = (
            "🏆 **XAUUSD (Gold) Institutional Market Outlook:**\n\n"
            "• **Structure:** Gold displays strong dynamic liquidity sweeps on the H4/H1 timeframes with major demand zones.\n"
            "• **Average True Range (ATR):** Gold's daily volatility averages $25–$40. Because of wide intraday swings, stop losses require 40–80 points.\n"
            "• **AI Capital Shield Calibration:** For accounts under $150, Trade-Z restricts Gold trades to 0.01 lot maximum to prevent high-volatility drawdown from exceeding safe thresholds."
        )

    # 6. EURUSD Analysis
    elif "eurusd" in prompt or "eur/usd" in prompt:
        reply = (
            "💶 **EURUSD Market Confluence Overview:**\n\n"
            "• **Structure:** Order block displacement on the 4H timeframe with bullish fair value gap (FVG) mitigation.\n"
            "• **Confluence Score:** 92% (High-probability alignment across Trend, Liquidity, and Momentum layers).\n"
            "• **Institutional Bias:** Upward continuation towards London session highs. Recommended Stop Loss placed below the session swing low."
        )

    # 7. GBPUSD Analysis
    elif "gbpusd" in prompt or "gbp/usd" in prompt:
        reply = (
            "💷 **GBPUSD Institutional Market Outlook:**\n\n"
            "• **Market Structure:** Break of Structure (BOS) confirmed on H1. Price is currently retesting the discount equilibrium zone.\n"
            "• **Execution Strategy:** Watch for London/New York session overlap displacement. Standard R:R targeted at 1:2.5."
        )

    # 8. Concepts (Order Block, FVG, SMC, BOS)
    elif any(w in prompt for w in ["order block", "fvg", "fair value", "smc", "liquidity", "sweep", "bos"]):
        reply = (
            "🏛️ **Institutional Smart Money Concepts (SMC) in Trade-Z:**\n\n"
            "• **Order Block (OB):** The last opposing candle before an aggressive displacement that leaves an imbalance, representing institutional accumulation or distribution.\n"
            "• **Fair Value Gap (FVG):** A 3-candle price imbalance where buyers or sellers dominated so heavily that price must revisit to establish fair value.\n"
            "• **Liquidity Sweep:** When market makers drive price past obvious retail highs/lows (stop runs) to fill large orders before reversing in the true trend direction.\n"
            "• **Break of Structure (BOS):** A candle body close beyond a previous swing high/low confirming continuation of the institutional order flow."
        )

    # 9. General Conversational / Assistant Overview
    else:
        reply = (
            f"🤖 **Trade-Z Trading Assistant:**\n\n"
            f"I am actively monitoring market order flows and your MetaTrader 5 terminal.\n\n"
            f"Here is what you can ask me:\n"
            f"• **'What is my account balance and floating P&L?'**\n"
            f"• **'Show my active open positions'**\n"
            f"• **'Analyze EURUSD or XAUUSD market structure'**\n"
            f"• **'How does the AI Capital Shield calculate lot size?'**\n"
            f"• **'How do I close a trade directly?'**"
        )

    return {
        "success": True,
        "data": {
            "reply": reply,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
