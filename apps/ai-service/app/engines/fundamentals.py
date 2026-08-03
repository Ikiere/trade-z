from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class FundamentalEngine(BaseEngine):
    """
    Layer 11: Inspects the economic calendar events. Blocks execution
    during major interest rate releases (FOMC, CPI, NFP) to protect capital.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        news_safe = snapshot.news_safe

        result = "safe"
        confidence = 100.0
        explanation = "Economic calendar is clear of high-impact macroeconomic releases close to this session."

        if not news_safe:
            result = "high_risk_news"
            confidence = 0.0
            explanation = "Macro Shield Warning: Major economic news release (CPI/NFP/FOMC) scheduled. Trading blocked."

        return EngineResult(
            result=result,
            confidence=confidence,
            explanation=explanation,
            metrics={"news_safe": news_safe},
            validation_status="valid"
        )
