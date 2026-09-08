"""
Trade-Z Structured Trading Experience Memory:
Maintains an empirical database of all simulated and live trade setups,
enabling statistical similarity retrieval, expectancy lookup, and regime edge mapping.
Does not rely on vague emotional LLM prompts; anchors decisions in mathematical data.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class ExperienceRecord(BaseModel):
    id: str
    ticket: int
    symbol: str
    setup_family: str
    direction: str
    session: str
    regime: str
    htf_trend: str
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    outcome: str  # WIN | LOSS | BREAKEVEN
    r_multiple: float
    net_pnl: float
    mfe_r: float
    mae_r: float
    exit_reason: str
    root_cause: str
    timestamp: str


class SimilarityQueryResponse(BaseModel):
    symbol: str
    setup_family: str
    sample_size: int
    win_rate: float
    average_r: float
    expectancy: float
    profit_factor: float
    average_mfe_r: float
    average_mae_r: float
    statistical_edge: str  # POSITIVE | NEUTRAL | NEGATIVE | INSUFFICIENT_DATA
    matching_records: List[ExperienceRecord] = []


class ExperienceMemory:
    """
    In-memory and indexed experience storage for statistical setup evaluation.
    """

    def __init__(self):
        self.records: List[ExperienceRecord] = []

    def add_record(self, rec: ExperienceRecord):
        self.records.append(rec)

    def query_similar(
        self,
        symbol: str,
        setup_family: str,
        session: Optional[str] = None,
        regime: Optional[str] = None
    ) -> SimilarityQueryResponse:
        sym = symbol.upper().replace("/", "")
        matches = [
            r for r in self.records
            if r.symbol == sym and r.setup_family == setup_family
        ]

        # Filter by session if provided
        if session and session != "ALL":
            filtered_session = [r for r in matches if r.session.upper() == session.upper()]
            if len(filtered_session) >= 5:
                matches = filtered_session

        # Filter by regime if provided
        if regime and regime != "ALL":
            filtered_regime = [r for r in matches if r.regime.upper() == regime.upper()]
            if len(filtered_regime) >= 5:
                matches = filtered_regime

        sample_size = len(matches)
        if sample_size == 0:
            return SimilarityQueryResponse(
                symbol=sym,
                setup_family=setup_family,
                sample_size=0,
                win_rate=50.0,
                average_r=0.0,
                expectancy=0.0,
                profit_factor=1.0,
                average_mfe_r=0.0,
                average_mae_r=0.0,
                statistical_edge="INSUFFICIENT_DATA",
                matching_records=[]
            )

        wins = [r for r in matches if r.outcome == "WIN"]
        losses = [r for r in matches if r.outcome == "LOSS"]
        win_rate = (len(wins) / sample_size * 100.0)
        avg_r = sum(r.r_multiple for r in matches) / sample_size
        gross_pos = sum(r.r_multiple for r in wins)
        gross_neg = abs(sum(r.r_multiple for r in losses))
        profit_factor = round(gross_pos / gross_neg, 2) if gross_neg > 0 else (3.0 if gross_pos > 0 else 1.0)
        avg_mfe = sum(r.mfe_r for r in matches) / sample_size
        avg_mae = sum(r.mae_r for r in matches) / sample_size

        # Empirical Expectancy (EV in R): (P_win * avg_win_R) - (P_loss * 1.0)
        p_win = len(wins) / sample_size
        p_loss = len(losses) / sample_size
        avg_win_r = (sum(r.r_multiple for r in wins) / len(wins)) if wins else 2.0
        ev = round((p_win * avg_win_r) - (p_loss * 1.0), 2)

        edge = "POSITIVE" if ev > 0.3 else ("NEUTRAL" if ev >= -0.1 else "NEGATIVE")
        if sample_size < 10:
            edge = "INSUFFICIENT_DATA"

        return SimilarityQueryResponse(
            symbol=sym,
            setup_family=setup_family,
            sample_size=sample_size,
            win_rate=round(win_rate, 1),
            average_r=round(avg_r, 2),
            expectancy=ev,
            profit_factor=profit_factor,
            average_mfe_r=round(avg_mfe, 2),
            average_mae_r=round(avg_mae, 2),
            statistical_edge=edge,
            matching_records=matches[-10:]
        )

    def get_setup_family_stats(self) -> Dict[str, Dict[str, Any]]:
        """Aggregates performance statistics grouped by setup family."""
        families: Dict[str, List[ExperienceRecord]] = {}
        for r in self.records:
            families.setdefault(r.setup_family, []).append(r)

        stats: Dict[str, Dict[str, Any]] = {}
        for fam, recs in families.items():
            n = len(recs)
            wins = [r for r in recs if r.outcome == "WIN"]
            losses = [r for r in recs if r.outcome == "LOSS"]
            wr = (len(wins) / n * 100.0) if n > 0 else 0.0
            gross_pos = sum(r.r_multiple for r in wins)
            gross_neg = abs(sum(r.r_multiple for r in losses))
            pf = round(gross_pos / gross_neg, 2) if gross_neg > 0 else 3.0
            avg_r = round(sum(r.r_multiple for r in recs) / n, 2) if n > 0 else 0.0

            stats[fam] = {
                "trades": n,
                "wins": len(wins),
                "losses": len(losses),
                "win_rate": round(wr, 1),
                "profit_factor": pf,
                "average_r": avg_r,
                "expectancy": round((wr / 100.0 * 2.2) - ((100 - wr) / 100.0 * 1.0), 2)
            }
        return stats


experience_memory = ExperienceMemory()
