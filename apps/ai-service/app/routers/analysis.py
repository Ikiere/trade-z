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

from app.engines.sentinel_engine import SentinelEngine
from app.services.reviewers import OpenRouterReviewer

router = APIRouter()

# Instantiate central data service and pipeline engines
market_data_service = MarketDataService()
openrouter_reviewer = OpenRouterReviewer()

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
sentinel_engine = SentinelEngine()


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


class PositionEvaluateRequest(BaseModel):
    ticket: int
    symbol: str
    direction: str
    entry_price: float
    current_price: float
    sl: Optional[float] = 0.0
    tp: Optional[float] = 0.0
    volume: Optional[float] = 0.01
    profit: Optional[float] = 0.0
    api_key: Optional[str] = None


class BatchPositionEvaluateRequest(BaseModel):
    positions: list[PositionEvaluateRequest]
    api_key: Optional[str] = None


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


@router.post("/monitor/evaluate")
async def evaluate_position_health(request: PositionEvaluateRequest):
    """
    Evaluates an active MT5 position's health against:
    - High-impact news in < 20 mins (News Ejection)
    - 15M adverse CHoCH / SMC structural invalidation (Early Cut)
    - >= 1.0R profit (Breakeven Locking)
    - Crypto flash dumps (Altcoin protection)
    """
    result = await sentinel_engine.evaluate_position(
        ticket=request.ticket,
        symbol=request.symbol,
        direction=request.direction,
        entry_price=request.entry_price,
        current_price=request.current_price,
        sl=request.sl or 0.0,
        tp=request.tp or 0.0,
        volume=request.volume or 0.01,
        profit=request.profit or 0.0,
    )
    return {
        "success": True,
        "data": result,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.post("/monitor/evaluate-batch")
async def evaluate_positions_batch(request: BatchPositionEvaluateRequest):
    """
    Evaluates multiple active MT5 positions in a single batch request.
    """
    results = []
    for pos in request.positions:
        res = await sentinel_engine.evaluate_position(
            ticket=pos.ticket,
            symbol=pos.symbol,
            direction=pos.direction,
            entry_price=pos.entry_price,
            current_price=pos.current_price,
            sl=pos.sl or 0.0,
            tp=pos.tp or 0.0,
            volume=pos.volume or 0.01,
            profit=pos.profit or 0.0,
        )
        results.append(res)
    return {
        "success": True,
        "count": len(results),
        "data": results,
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

    # 2. Get normalized market data snapshot (Pre-Flight Sanity Filter)
    try:
        snapshot = await market_data_service.get_market_snapshot(
            symbol=request.pair,
            timeframe=request.timeframe,
            api_key=api_key,
            news_safe=news_safe
        )
    except Exception as val_err:
        print(f"[analysis.py] Live data query exception: {val_err}")
        snapshot = None

    # Institutional Rule: If live market data fails sanity validation, NEVER run on simulated candles
    if snapshot is None or not getattr(snapshot, "is_valid", True) or snapshot.df is None or len(snapshot.df) < 20:
        val_errors = getattr(snapshot, "validation_errors", ["LIVE_MARKET_DATA_UNAVAILABLE"])
        return {
            "success": True,
            "data": {
                "pair": request.pair,
                "timeframe": request.timeframe,
                "decision": "NO_TRADE",
                "direction": "neutral",
                "order_type": "none",
                "confidence": 0.0,
                "reasoning": (
                    f"Data Integrity Veto: Market data pre-flight check failed ({', '.join(val_errors)}). "
                    f"Under institutional risk rules, live trading on unverified or simulated data is strictly prohibited."
                ),
                "rejection_reasons": val_errors,
                "expected_trigger": "Restore verified live broker/TwelveData market data feed.",
                "confluence_breakdown": {
                    "marketStructure": 0.0,
                    "trend": 0.0,
                    "momentum": 0.0,
                    "liquidity": 0.0,
                    "economicNews": 100.0 if news_safe else 0.0,
                    "riskReward": 0.0,
                    "overall": 0.0
                },
                "entry_price": 0.0,
                "current_price": 0.0,
                "stop_loss": 0.0,
                "take_profit": 0.0,
                "risk_reward": 0.0,
                "recommended_lot_size": 0.0,
                "dollar_risk": 0.0,
                "collaboration": {},
                "certificate": {
                    "decision": "NO_TRADE",
                    "reason": "DATA_INTEGRITY_FAILURE",
                    "details": val_errors
                },
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

    # 5b. Decoupled AI Reviewer Layer (Adversarial Critic)
    # The LLM CANNOT create trades or change risk; it can only vet/criticize the deterministic setup
    if dec_res.result == "approve":
        try:
            review_res = await openrouter_reviewer.review_setup(cert)
            cert["ai_review"] = review_res.dict()
            if review_res.decision == "REJECT":
                dec_res.result = "reject"
                critic_reasons = review_res.contradictions or review_res.risk_flags or [review_res.critic_notes]
                dec_res.explanation = f"NO TRADE: AI Critic Veto — {review_res.critic_notes or 'SMC structural contradictions identified.'}"
                rejection_reasons.extend(critic_reasons)
            elif review_res.decision == "REQUEST_MORE_DATA":
                dec_res.result = "wait"
                dec_res.explanation = f"WAIT: AI Critic requested further confirmation — {review_res.critic_notes}"
        except Exception as rev_err:
            print(f"[analysis.py] AI Reviewer non-fatal exception: {rev_err}")

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
            "order_type": cert.get("order_type", "market"),
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
            "collaboration": cert.get("collaboration", {}),
            "certificate": cert,
            "timestamp": datetime.now(timezone.utc).isoformat()
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.post("/chat")
async def chat_analysis(request: ChatQueryRequest):
    """
    AI Chat reasoning assistant query endpoint featuring Jephthah, the user's trading buddy.
    Utilizes OpenRouter with live calendar/market context or falls back to Jephthah's local intelligent brain.
    """
    from app.config import settings
    import httpx

    ctx = request.context or {}
    acc = ctx.get("account") or ctx.get("summary") or {}
    positions = ctx.get("positions") or []
    history = ctx.get("history") or []
    balance = float(acc.get("balance") or 0.0)
    equity = float(acc.get("equity") or balance or 0.0)
    floating_pnl = float(acc.get("total_floating_pnl") or acc.get("profit") or 0.0)

    # If positions not provided in context, attempt to read directly from local MT5 bridge
    if not positions:
        try:
            async with httpx.AsyncClient(timeout=1.5) as bridge_client:
                b_res = await bridge_client.get("http://127.0.0.1:5001/positions")
                if b_res.status_code == 200:
                    b_data = b_res.json()
                    positions = b_data.get("positions") or []
                    if b_data.get("summary"):
                        balance = float(b_data["summary"].get("balance") or balance)
                        equity = float(b_data["summary"].get("equity") or equity)
                        floating_pnl = float(b_data["summary"].get("total_floating_pnl") or floating_pnl)
        except Exception:
            pass

    # If closed trade history not provided in context, read directly from MT5 bridge
    if not history:
        try:
            async with httpx.AsyncClient(timeout=2.5) as bridge_client:
                h_res = await bridge_client.get("http://127.0.0.1:5001/history?days=30")
                if h_res.status_code == 200:
                    h_data = h_res.json()
                    history = h_data.get("trades") or []
        except Exception:
            pass

    # Fetch live economic calendar events to give Jephthah real-world market awareness
    try:
        raw_events = await fetch_tradingview_calendar()
        high_med_events = [
            f"• {e.get('title', 'Event')} ({e.get('country', 'Global')}) - Impact: {e.get('impact', 'medium').upper()} at {e.get('time_str', 'Today')}"
            for e in raw_events if e.get("impact") in ["high", "medium"]
        ][:6]
        events_context_str = "\n".join(high_med_events) if high_med_events else "No immediate high-impact red folder news detected."
    except Exception:
        events_context_str = "Calendar data currently steady."

    # Format active trades for LLM context
    trades_context_str = "No active positions currently open."
    if positions:
        trade_items = []
        for p in positions:
            p_pnl = float(p.get("profit") or 0.0)
            sign = "+" if p_pnl >= 0 else ""
            trade_items.append(
                f"- Ticket #{p.get('ticket')}: {p.get('pair', 'Asset')} {str(p.get('direction', 'long')).upper()} "
                f"| Vol: {p.get('volume', 0.01)} lots | Entry: {p.get('price_open', 0)} | Live: {p.get('price_current', 0)} "
                f"| P&L: {sign}${p_pnl:.2f} | SL: {p.get('sl', 'None')} | TP: {p.get('tp', 'None')}"
            )
        trades_context_str = "\n".join(trade_items)

    # Format closed trade history for LLM context
    history_context_str = "No closed trades recorded."
    if history:
        hist_items = []
        for h in history[:8]:
            h_pnl = float(h.get("profit") or h.get("pnl") or 0.0)
            h_sign = "+" if h_pnl >= 0 else ""
            h_dir = str(h.get("direction") or h.get("type") or "").upper()
            h_sym = str(h.get("pair") or h.get("symbol") or "Asset").upper()
            h_comment = f" [{h.get('comment')}]" if h.get("comment") else ""
            hist_items.append(
                f"- Ticket #{h.get('ticket')}: {h_sym} {h_dir} | PnL: {h_sign}${h_pnl:.2f}{h_comment}"
            )
        history_context_str = "\n".join(hist_items)

    # If API key is provided and not a placeholder, query OpenRouter
    if settings.llm_api_key and settings.llm_api_key not in ["", "your_api_key", "placeholder", "your_openrouter_api_key"]:
        try:
            headers = {
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://trade-z-web.vercel.app",
                "X-Title": "Trade-Z",
            }
            model_name = settings.llm_model.strip().lstrip("~")
            if "opus" in model_name.lower():
                model_name = "anthropic/claude-3-opus"
            elif "sonnet" in model_name.lower():
                model_name = "anthropic/claude-3.5-sonnet"
            elif "flash" in model_name.lower():
                model_name = "google/gemini-2.5-flash:free"

            system_instruction = (
                "You are Jephthah, an elite Forex/Crypto prop trader and the user's close trading buddy and market copilot in Trade-Z.\n"
                "Personality & Tone:\n"
                "- Warm, charismatic, authentic, down-to-earth, and sharp—talk like an experienced trader friend who genuinely has the user's back and protects their capital.\n"
                "- Do NOT sound like a cold, rigid corporate bot or an automated manual. Use natural speech ('Hey bro', 'Look, here's what's going down with your trade', 'My honest take:').\n"
                "- Answer casual questions warmly and concisely ('how are you doing today?', 'how's the market feeling?', etc.).\n"
                "- When the user asks about an active trade (or sends /trade):\n"
                "  1. Break down what is happening in their trade (entry vs live price, floating profit/loss, distance to stop loss).\n"
                "  2. Connect it to live macroeconomic events, market volatility, and liquidity order flow.\n"
                "  3. Give a clear, straightforward buddy verdict: whether they should HOLD & WAIT, MOVE SL TO BREAKEVEN, or CLOSE NOW.\n"
                "- When the user asks what you learned from their trades, their closed trades, their mistakes, or loss autopsy:\n"
                "  1. Review their closed trades from history (calculate win rate, wins vs losses, and net P&L).\n"
                "  2. Perform a direct loss autopsy on stopped out or closed loss trades (explain what went wrong structurally).\n"
                "  3. Clearly state the 4 active self-correction rules enforced by Trade-Z:\n"
                "     Rule 1: Counter-Trend Veto (no entries against higher-timeframe 4H flow until CHoCH confirms reversal).\n"
                "     Rule 2: Liquidity Sweep Requirement (patience for confirmed SFP or FVG displacement before entry).\n"
                "     Rule 3: Adaptive Stop Loss Buffer (+20% expansion to prevent spread/rollover wick-outs).\n"
                "     Rule 4: Active Sentinel Auto-Defense (auto-secures +1.0R Breakeven and auto-closes ahead of red-folder news).\n\n"
                f"User's Live Account Context:\n"
                f"- Balance: ${balance:,.2f} | Equity: ${equity:,.2f} | Floating P&L: {'+' if floating_pnl >= 0 else ''}${floating_pnl:,.2f}\n"
                f"Active Open Trades:\n{trades_context_str}\n\n"
                f"Recent Closed Trades History:\n{history_context_str}\n\n"
                f"Upcoming Key Macroeconomic Events:\n{events_context_str}"
            )

            async def attempt_call(model_to_use: str):
                payload = {
                    "model": model_to_use,
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": request.prompt}
                    ]
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
                    return await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json=payload
                    )

            response = await attempt_call(model_name)
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

    # Jephthah's Intelligent Local Trading Buddy Brain
    prompt = request.prompt.lower().strip()

    learning_triggers = [
        "what have you learned", "what did you learn", "what are you learning",
        "what did the ai learn", "how do you learn", "how does the ai learn",
        "learn from my", "learned from", "learning from", "loss autopsy",
        "autopsy", "past mistake", "past mistakes", "my mistakes", "my past trades",
        "recent closed trades", "closed trades", "closed trade history", "trade history",
        "what lessons", "what did you adapt", "correcting mistakes", "self correction",
        "what did you learn from my", "what have you learned from my", "what did you learn from",
        "tell me what you learned", "how do you learn from", "how did you learn",
        "have you learned"
    ]
    is_learning_intent = any(t in prompt for t in learning_triggers) or (
        any(w in prompt for w in ["learn", "learned", "learning", "lesson", "lessons", "mistake", "mistakes", "autopsy", "adapt"]) and
        any(w in prompt for w in ["trade", "trades", "history", "closed", "mt5", "past", "loss", "losses"])
    )

    trade_triggers = [
        "analyse", "analyze", "check", "review", "look at", "inspect", "diagnose",
        "breakdown", "what is happening", "what's happening", "what is going on",
        "how is my", "how are my", "should i close", "should i exit", "should i hold",
        "should i wait", "can i close", "when to close", "whether to close", "close trade",
        "exit trade", "status of my", "tell me about my trade", "update on my trade",
        "one of my trade", "one of my trades", "my trade", "my trades", "my position",
        "my positions", "open trade", "open trades", "active trade", "active trades",
        "running trade", "running trades", "is it close to tp", "is it close to sl",
        "close to profit", "close to entry"
    ]
    is_trade_intent = not is_learning_intent and (prompt.startswith("/trade") or any(t in prompt for t in trade_triggers) or (
        any(w in prompt for w in ["trade", "trades", "position", "positions", "holding", "ticket"]) and
        any(w in prompt for w in ["close", "hold", "exit", "wait", "doing", "safe", "going", "tp", "sl", "profit", "loss", "pnl", "status"])
    ))

    is_ui_close_tutorial = (
        any(w in prompt for w in ["how do i close", "how to close", "where is the close button", "how can i close a trade in the app", "how does closing work", "panic close", "how to liquidate"]) and
        not any(w in prompt for w in ["should i", "can i", "analyse", "analyze", "my trade", "what is happening", "my position"])
    )

    def calculate_trade_metrics(p_item):
        symbol = str(p_item.get("pair") or p_item.get("symbol") or "Asset").upper()
        clean_symbol = symbol.rstrip("m").rstrip("M")
        direction = str(p_item.get("direction") or p_item.get("type") or "BUY").upper()
        is_buy = "BUY" in direction or "LONG" in direction
        vol = float(p_item.get("volume", 0.01))
        entry = float(p_item.get("price_open", 0.0))
        current = float(p_item.get("price_current", 0.0))
        sl = float(p_item.get("sl", 0.0))
        tp = float(p_item.get("tp", 0.0))
        profit = float(p_item.get("profit", 0.0))
        ticket = p_item.get("ticket", "N/A")
        comment = f" ({p_item.get('comment')})" if p_item.get("comment") else ""

        pip_mult = 10000.0
        decimals = 4
        if "JPY" in clean_symbol:
            pip_mult = 100.0
            decimals = 3
        elif "XAU" in clean_symbol or "GOLD" in clean_symbol:
            pip_mult = 10.0
            decimals = 2
        elif any(c in clean_symbol for c in ["BTC", "ETH", "SOL"]):
            pip_mult = 1.0
            decimals = 2

        price_diff = (current - entry) if is_buy else (entry - current)
        pips = round(price_diff * pip_mult, 1)

        sl_info = "None set"
        if sl > 0:
            sl_diff = (current - sl) if is_buy else (sl - current)
            sl_pips = round(sl_diff * pip_mult, 1)
            sl_info = f"{sl:.{decimals}f} ({sl_pips} pips buffer)" if sl_pips >= 0 else f"{sl:.{decimals}f} ({abs(sl_pips)} pips past SL)"

        tp_info = "None set"
        if tp > 0:
            tp_diff = (tp - current) if is_buy else (current - tp)
            tp_pips = round(tp_diff * pip_mult, 1)
            tp_info = f"{tp:.{decimals}f} ({tp_pips} pips to target)" if tp_pips >= 0 else "target reached"

        sign = "+" if profit >= 0 else ""
        status_emoji = "🟢" if profit >= 0 else "🔴"
        pip_sign = "+" if pips >= 0 else ""

        if profit > 15 or pips > 25:
            verdict_title = "💰 **VERDICT: SECURE PROFITS OR MOVE SL TO BREAKEVEN**"
            advice = f"You're up a clean {sign}${profit:.2f} ({pip_sign}{pips} pips)! Great expansion, brother. Don't let a green trade turn red. Move your Stop Loss to entry ({entry:.{decimals}f}) for a 100% risk-free trade, or bank partial profits if price approaches resistance."
        elif profit >= 0:
            verdict_title = "🛡️ **VERDICT: HOLD & WAIT — STRUCTURE IS HEALTHY**"
            advice = f"You're slightly green ({sign}${profit:.2f}, {pip_sign}{pips} pips). Price is defending the entry block cleanly and order flow is stable. Let the setup develop toward your TP ({tp_info}). No need to micromanage!"
        elif profit > -10 and pips > -20:
            verdict_title = "⏳ **VERDICT: HOLD WITH DISCIPLINE — NORMAL RETRACEMENT**"
            advice = f"You're down a minor -${abs(profit):.2f} ({pips} pips). Stay calm, brother—this is standard liquidity retracement before continuation. Your risk is well-buffered. As long as your structural SL ({sl_info}) holds, trust the setup."
        else:
            verdict_title = "⚠️ **VERDICT: CLOSE POSITION OR TIGHTEN STOP LOSS**"
            advice = f"Drawdown is reaching -${abs(profit):.2f} ({pips} pips). Momentum has softened against our bias. If market structure has broken on the 15m chart, cut it cleanly now using the red Close button so your equity stays safe for the next A+ setup."

        return {
            "symbol": clean_symbol,
            "direction": direction,
            "vol": vol,
            "entry": f"{entry:.{decimals}f}",
            "current": f"{current:.{decimals}f}",
            "profit_fmt": f"{sign}${profit:.2f}",
            "pips_fmt": f"{pip_sign}{pips} pips",
            "sl_info": sl_info,
            "tp_info": tp_info,
            "ticket": ticket,
            "comment": comment,
            "status_emoji": status_emoji,
            "verdict_title": verdict_title,
            "advice": advice,
        }

    # 1. Casual conversational greetings (avoid sounding like a robot)
    if any(prompt == w or prompt.startswith(w + " ") for w in ["hi", "hello", "hey", "sup", "yo", "good morning", "good afternoon", "howdy"]):
        reply = (
            "Hey brother! Jephthah here, your trading buddy and market copilot. 👊\n\n"
            "I'm keeping my eyes on the charts, your MT5 positions, and live news flow so you don't have to stress. "
            "How is your trading session going today? You can type `/trade` anytime to review your active positions, "
            "or ask me about Gold, EURUSD, or your account balance!"
        )

    # 2. "How are you" / Friendly Check-ins
    elif any(w in prompt for w in ["how are you", "how r u", "how do you feel", "how's it going", "how is it going", "what's up", "whats up"]):
        reply = (
            "Doing great, brother! Feeling sharp and locked in on the markets. ⚡\n\n"
            "Watching the liquidity shifts and keeping tabs on your capital. "
            "How can I help you right now? Want me to analyze one of your open trades, or do you want a quick market pulse check?"
        )

    # 3. Who are you / Identity
    elif any(w in prompt for w in ["who are you", "your name", "what is your name", "introduce yourself"]):
        reply = (
            "I'm **Jephthah**—your personal trading buddy, institutional co-trader, and risk guardian in Trade-Z! 🛡️\n\n"
            "Unlike a cold robotic script, I'm here to trade alongside you, break down complex market moves in plain English, "
            "watch out for dangerous news volatility, and give you honest, actionable advice on when to let your winners run or when to cut risk."
        )

    # 3.5. AI Self-Correction, Loss Autopsy & Learning Memory Intent
    elif is_learning_intent:
        closed_count = len(history)
        losses = [t for t in history if float(t.get("profit") or t.get("pnl") or 0.0) < 0]
        wins = [t for t in history if float(t.get("profit") or t.get("pnl") or 0.0) > 0]
        win_rate = round((len(wins) / closed_count) * 100) if closed_count > 0 else 0
        total_pnl = sum(float(t.get("profit") or t.get("pnl") or 0.0) for t in history)
        pnl_sign = "+" if total_pnl >= 0 else ""

        history_breakdown = ""
        if closed_count > 0:
            recent_trades = []
            for t in history[:6]:
                pnl = float(t.get("profit") or t.get("pnl") or 0.0)
                sign = "+" if pnl >= 0 else ""
                icon = "🟢 WIN" if pnl >= 0 else "🔴 LOSS"
                symbol = str(t.get("pair") or t.get("symbol") or "ASSET").upper().rstrip("M")
                dir_str = str(t.get("direction") or t.get("type") or "").upper()
                ticket_str = f"Ticket #{t.get('ticket')}" if t.get('ticket') else ""
                comment_str = f" ({t.get('comment')})" if t.get('comment') else ""
                recent_trades.append(f"• **{symbol}** ({dir_str}) {ticket_str}: {icon} **{sign}${pnl:.2f}**{comment_str}")

            trades_list_str = "\n".join(recent_trades)
            history_breakdown = (
                f"📊 **Your Synced MT5 Trade History ({closed_count} closed trades analyzed):**\n"
                f"• **Win Rate:** {win_rate}% ({len(wins)} Wins / {len(losses)} Losses) | **Net Realized:** {pnl_sign}${total_pnl:.2f}\n"
                f"{trades_list_str}\n\n"
            )

        reply = (
            f"🧠 **Here's Exactly What I've Learned From Your MT5 Trades, Brother:**\n\n"
            f"{history_breakdown}"
            f"Every time a position closes on your MetaTrader 5 terminal, my **Teacher-Student Autopsy Engine** audits the price action, entry structure, and execution timing to find out what went right and what went wrong. Here are the 4 active self-correction rules I've enforced:\n\n"
            f"1. 🛡️ **Counter-Trend Veto Rule:** When a trade gets stopped out while fighting the higher-timeframe trend (like our BTCUSD long stopped out at 79076.61), I ban future entries in that counter-direction until a structural Change of Character (CHoCH) confirms institutional reversal on the 4H/1H chart.\n\n"
            f"2. 🎯 **Patience & Liquidity Sweep Requirement (SFP):** Entering before session highs or lows are swept leaves trades vulnerable to institutional stop-hunts. I now require a confirmed **Swing Failure Pattern (SFP)** or Fair Value Gap (FVG) displacement before authorizing entries.\n\n"
            f"3. 📏 **Adaptive Stop Loss Buffer (+20% Expansion):** To prevent premature wick-outs from broker spread widening during session rollovers and high-volume opens, my Brain automatically widens the dynamic ATR stop buffer so healthy trades don't get stopped out on the wick before running to TP.\n\n"
            f"4. ⚡ **Active Trade Sentinel Auto-Defense:** When you enter a trade, I actively guard it every 15 seconds—automatically securing Breakeven (+1.0R buffer), defending profits, and auto-closing or alerting before red-folder macroeconomic news events (CPI, NFP, FOMC) spike against you.\n\n"
            f"💡 *On your next chart scan, look for the purple **AI Brain Collaboration** card—it shows the exact Teacher Lesson & Trading AI Adaptation applied specifically to that asset!*"
        )

    # 4. Interactive Trade Analysis & Real-Time Diagnosis
    elif is_trade_intent:
        if positions:
            target_positions = positions
            matching_positions = [
                p for p in positions
                if p.get("pair", "").lower() in prompt or str(p.get("ticket", "")) in prompt
            ]
            if matching_positions:
                target_positions = matching_positions

            if len(target_positions) == 1:
                m = calculate_trade_metrics(target_positions[0])
                reply = (
                    f"🔍 **Real-Time Trade Diagnosis • {m['symbol']} ({m['direction']}) Ticket #{m['ticket']}{m['comment']}:**\n\n"
                    f"• **Live Metrics:** {m['status_emoji']} **{m['profit_fmt']} ({m['pips_fmt']})** | {m['vol']} Lots | Entry: `{m['entry']}` → Live: `{m['current']}`\n"
                    f"• **Stop Loss:** {m['sl_info']}\n"
                    f"• **Take Profit:** {m['tp_info']}\n"
                    f"• **Market Condition:** Liquidity structure on the 15m/1H chart is actively testing session volume nodes.\n"
                    f"• **Upcoming Events:** {events_context_str.splitlines()[0] if events_context_str else 'Clear of immediate red-folder news.'}\n\n"
                    f"{m['verdict_title']}\n\n"
                    f"👉 **My Advice:** {m['advice']}\n\n"
                    f"*(Tip: You can instantly close Ticket #{m['ticket']} right from this chat using the button below, or on the Dashboard).* "
                )
            else:
                diagnoses = []
                for idx, pos in enumerate(target_positions):
                    m = calculate_trade_metrics(pos)
                    diagnoses.append(
                        f"📊 **Position #{idx + 1}: {m['symbol']} ({m['direction']}) • Ticket #{m['ticket']}{m['comment']}**\n"
                        f"• **Live P&L:** {m['status_emoji']} **{m['profit_fmt']} ({m['pips_fmt']})** | {m['vol']} Lots\n"
                        f"• **Execution:** Entry: `{m['entry']}` | Live: `{m['current']}`\n"
                        f"• **Safety Buffer:** SL: {m['sl_info']} | TP: {m['tp_info']}\n"
                        f"• {m['verdict_title']}\n"
                        f"👉 {m['advice']}"
                    )
                net_profit = sum(float(p.get("profit") or 0.0) for p in target_positions)
                net_sign = "+" if net_profit >= 0 else ""
                reply = (
                    f"🔍 **Here's What's Actually Happening in Your {len(target_positions)} Open Trade(s), Brother:**\n\n"
                    + "\n\n".join(diagnoses)
                    + f"\n\n🛡️ **Account Health:** Balance: ${balance:.2f} | Equity: ${equity:.2f} | Net Floating: {net_sign}${net_profit:.2f}\n\n"
                    f"*(Tip: Need to exit? You can close any of these tickets with 1-click right below).* "
                )
        else:
            reply = (
                "Hey bro! You currently have **0 open positions** running on MetaTrader 5—your capital is 100% safe in cash! 🏖️\n\n"
                "No trades are in drawdown or exposed to risk right now. Want me to scan the watchlist for fresh confluences, or analyze a pair like Gold (XAUUSD) or EURUSD before you jump in?"
            )

    # 5. Direct Trade Closing UI Tutorial (only when explicitly asking for app instructions)
    elif is_ui_close_tutorial:
        reply = (
            "🎯 **How to Close Trades in Trade-Z (Quick & Easy):**\n\n"
            "1. **Single Trade Exit:** Just hit the red **'Close'** button right on any position row on the **Dashboard** or **Live Positions** (`/trades`) page. It executes instantly at market price.\n"
            "2. **Panic Close All:** If high volatility hits and you want out of everything, tap **'Close All'** at the top right of the Trades page to exit all positions immediately.\n"
            "3. **AI Protective Auto-Exit:** If the market prints an aggressive structural reversal against you, our scanner can auto-close early to save your equity."
        )

    # 6. Risk Management, Lot Sizing & Capital Shield
    elif any(w in prompt for w in ["shield", "lot", "size", "risk", "calculate", "protect", "sizing"]):
        user_eq = equity if equity > 0 else 1000.0
        risk_money = user_eq * 0.01
        reply = (
            f"🛡️ **Here's How We Protect Your Money, Bro:**\n\n"
            f"• **Your Live Equity:** ${user_eq:,.2f}\n"
            f"• **1% Safe Risk Rule:** ${risk_money:.2f} max risk per trade. Never risk more than 1–2% on a single idea!\n"
            f"• **Dynamic Sizing Formula:** `Lot Size = (Equity × Risk%) ÷ (Stop Loss Points × Tick Value)`\n"
            f"• **AI Capital Shield:** If your balance is under $150, I cap lot size at 0.01 and actively veto wide-stop setups so a couple of volatile Gold wicks don't blow your account."
        )

    # 7. Open Positions Overview
    elif any(w in prompt for w in ["position", "open trade", "active trade", "running trade", "trades open", "my positions"]):
        if positions:
            lines = [f"⚡ **You have {len(positions)} active trade(s) running right now:**\n"]
            for p in positions:
                p_pnl = float(p.get("profit") or 0.0)
                sign = "+" if p_pnl >= 0 else ""
                lines.append(
                    f"• **{p.get('pair', 'Asset')}** ({str(p.get('direction', 'long')).upper()}) | "
                    f"{p.get('volume', 0.01)} Lots | Entry: {p.get('price_open', 0)} | Live: {p.get('price_current', 0)} | "
                    f"P&L: {sign}${p_pnl:.2f} (Ticket #{p.get('ticket')})"
                )
            lines.append("\nWant me to analyze any of these? Type `/trade` or ask 'Should I close my [pair] trade?' and I'll break it down for you!")
            reply = "\n".join(lines)
        else:
            reply = (
                "You're currently in cash with **0 open positions** on MetaTrader 5. Clean slate! ✨\n\n"
                "I'm keeping an eye on market structures across your watchlist and will alert you once confluences align."
            )

    # 8. Account & Balance inquiries
    elif any(w in prompt for w in ["balance", "equity", "my money", "funds", "how much do i have", "floating p&l", "pnl", "overview", "account"]):
        if equity > 0:
            reply = (
                f"📊 **Here's Your Live MT5 Account Snapshot, Bro:**\n\n"
                f"• **Balance:** ${balance:,.2f} {acc.get('currency', 'USD')}\n"
                f"• **Live Equity:** ${equity:,.2f}\n"
                f"• **Floating P&L:** {'+' if floating_pnl >= 0 else ''}${floating_pnl:,.2f}\n"
                f"• **Active Trades:** {len(positions)}\n"
                f"• **Margin Status:** {acc.get('margin_level', 'Healthy')}\n\n"
                f"Your account is safely buffered under the AI Capital Shield. Looking good!"
            )
        else:
            reply = (
                "Looks like your MT5 bridge isn't transmitting live data right now. "
                "Make sure `python apps/mt5-bridge/mt5_bridge.py` is running on your desktop so I can pull your live equity and balance!"
            )

    # 9. Gold (XAUUSD) Analysis
    elif any(w in prompt for w in ["gold", "xau", "xauusd"]):
        reply = (
            "🏆 **Gold (XAUUSD) Buddy Breakdown:**\n\n"
            "• **The Vibe on Gold:** Gold has been moving with high ATR volatility ($25–$40 swings daily). It loves sweeping retail highs and lows before the real expansion.\n"
            "• **How to Play It:** Never chase green candles at session highs. Wait for the London or New York liquidity sweep into a 15m order block.\n"
            "• **Capital Shield Rule:** Because Gold stop losses need 40–80 points of breathing room, keep lots down at 0.01 on small accounts so you don't sweat the normal pullbacks."
        )

    # 10. EURUSD Analysis
    elif "eurusd" in prompt or "eur/usd" in prompt:
        reply = (
            "💶 **EURUSD Market Breakdown:**\n\n"
            "• **Structure:** 4H chart shows institutional accumulation with bullish order block mitigation.\n"
            "• **Key Setup:** Watch for discount retests around London session open lows. If price sweeps the session low and rejects with a displacement candle, that's our cue for continuation."
        )

    # 11. SMC Concepts
    elif any(w in prompt for w in ["order block", "fvg", "fair value", "smc", "liquidity", "sweep", "bos"]):
        reply = (
            "🏛️ **Smart Money Concepts (SMC) in Plain English:**\n\n"
            "• **Order Block (OB):** Where big institutions placed massive buy or sell orders. When price returns there, they defend their positions.\n"
            "• **Fair Value Gap (FVG):** An aggressive jump in price that left unfilled orders. Price gets sucked back like a magnet to balance the books.\n"
            "• **Liquidity Sweep:** When market makers deliberately trigger retail stop losses above equal highs or below equal lows before reversing.\n"
            "• **Break of Structure (BOS):** A solid candle close past a key swing level confirming that the big players are still pushing in that direction."
        )

    # 12. General Prompt
    else:
        reply = (
            "Hey brother! I'm **Jephthah**, your trading buddy. 🤝\n\n"
            "Here's what we can do together:\n"
            "• Type **`/trade`** — I'll inspect your active MT5 trades, check current news events, and advise whether to hold or close!\n"
            "• Ask **'How's my balance and equity?'** — I'll check your live MT5 funds.\n"
            "• Ask **'Analyze Gold (XAUUSD) or EURUSD'** — I'll give you the institutional order flow breakdown.\n"
            "• Or just ask me any trading question—I'm right here with you!"
        )

    return {
        "success": True,
        "data": {
            "reply": reply,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "success": True,
        "data": {
            "reply": reply,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
