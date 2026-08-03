from app.engines.base import BaseEngine, EngineResult
from app.services.market_data import MarketSnapshot


class HistoricalPatternEngine(BaseEngine):
    """
    Layer 12: Parses recent closed trade results for the symbol
    to evaluate reinforcement learning bias.
    """
    def analyze(self, snapshot: MarketSnapshot, context: dict) -> EngineResult:
        history = context.get("history", [])

        if not history:
            return EngineResult(
                result="no_data",
                confidence=50.0,
                explanation="No historical closed trade patterns loaded for this symbol.",
                metrics={"win_rate": 0.0, "total_samples": 0},
                validation_status="valid"
            )

        wins = 0
        total_pnl = 0.0
        for trade in history:
            pnl = float(trade.get("pnl") or 0.0)
            total_pnl += pnl
            if pnl > 0 or trade.get("status") in ["take_profit", "won"]:
                wins += 1

        win_rate = (wins / len(history)) * 100.0
        confidence = 50.0 + (win_rate - 50.0) * 0.4  # boost/drag confidence

        explanation = f"Reinforcement history shows a {win_rate:.1f}% win rate over the last {len(history)} closed setups on {snapshot.symbol}."

        return EngineResult(
            result="stat_compiled",
            confidence=round(confidence, 2),
            explanation=explanation,
            metrics={
                "win_rate": round(win_rate, 2),
                "total_pnl": round(total_pnl, 2),
                "total_samples": len(history)
            },
            validation_status="valid"
        )
