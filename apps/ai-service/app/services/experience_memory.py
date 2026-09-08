"""
Trade-Z Structured Trading Experience Memory:
Maintains an empirical database of all simulated and live trade setups across all instruments,
enabling multi-dimensional statistical similarity retrieval, expectancy lookup, and regime edge mapping.
Does not rely on vague emotional LLM prompts; anchors decisions in mathematical data.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.services.empirical_expectancy import (
    EmpiricalExpectancyEngine,
    EmpiricalExpectancyResult,
    SampleEvidenceTier,
)


class ExperienceRecord(BaseModel):
    id: str
    ticket: int
    timestamp: str
    symbol: str
    timeframe: str = "15m"
    session: str = "LONDON"           # ASIA | LONDON | NY | OVERLAP
    direction: str                    # long | short
    setup_family: str
    htf_trend: str = "neutral"        # bullish | bearish | neutral
    market_regime: str = "trending"   # trending | ranging | volatile | compressed
    volatility_regime: str = "normal" # low | normal | high | extreme
    liquidity_state: str = "normal"   # resting_swept | internal_imbalance | balanced
    bos_present: bool = False
    choch_present: bool = False
    fvg_present: bool = False
    ob_present: bool = False
    ote_zone_present: bool = False
    premium_discount: str = "equilibrium" # premium | discount | equilibrium
    confluence_score: float = 75.0
    spread_pips: float = 1.0
    atr_points: float = 0.0015
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    risk_r: float = 1.0
    risk_money: float = 1.0
    lot_size: float = 0.01
    outcome: str                      # WIN | LOSS | BREAKEVEN
    r_multiple: float
    net_pnl: float
    mfe_r: float = 0.0
    mae_r: float = 0.0
    duration_bars: int = 0
    exit_reason: str = "STOP_LOSS"    # STOP_LOSS | TAKE_PROFIT | BREAKEVEN | TRAILING_STOP | SIMULATION_END
    root_cause: str = "UNKNOWN"
    news_proximity_minutes: int = 999
    margin_utilization_pct: float = 0.0
    account_balance: float = 100.0
    account_equity: float = 100.0
    strategy_version: str = "Trade-Z v2.2-EmpiricalSMC"
    model_version: str = "deterministic_v2"
    feature_version: str = "feat_v2"
    execution_version: str = "mt5_standard_v2"


class SimilarityQueryResponse(BaseModel):
    symbol: str
    setup_family: str
    sample_size: int
    evidence_tier: str
    win_rate: float
    average_r: float
    expectancy: float
    cost_adjusted_expectancy: float
    profit_factor: float
    average_mfe_r: float
    average_mae_r: float
    statistical_edge: str  # POSITIVE | NEUTRAL | NEGATIVE | INSUFFICIENT_DATA
    recommended_action: str # TRADE | WAIT | NO_TRADE
    matching_records: List[ExperienceRecord] = []


class ExperienceMemory:
    """
    In-memory and indexed experience storage for statistical setup evaluation across all instruments.
    """

    def __init__(self):
        self.records: List[ExperienceRecord] = []

    def add_record(self, rec: ExperienceRecord):
        """
        Stores completed trade record. Losses and wins become empirical evidence.
        Strategy is never modified from a single trade.
        """
        self.records.append(rec)

    def query_experiences(
        self,
        symbol: Optional[str] = None,
        setup_family: Optional[str] = None,
        session: Optional[str] = None,
        regime: Optional[str] = None,
        as_of_timestamp: Optional[str] = None
    ) -> List[ExperienceRecord]:
        """
        Retrieves matching experiences chronologically.
        Guarantees that trades occurring after as_of_timestamp cannot contaminate historical decisions.
        """
        records = self.records
        if as_of_timestamp:
            records = [r for r in records if r.timestamp <= as_of_timestamp]

        if symbol and symbol != "ALL":
            clean_sym = symbol.upper().replace("/", "").replace(" ", "")
            records = [r for r in records if r.symbol == clean_sym]

        if setup_family and setup_family != "ALL":
            records = [r for r in records if r.setup_family == setup_family]

        if session and session != "ALL":
            records = [r for r in records if r.session.upper() == session.upper()]

        if regime and regime != "ALL":
            records = [r for r in records if r.market_regime.upper() == regime.upper()]

        return records

    def query_similar(
        self,
        symbol: str,
        setup_family: str,
        session: Optional[str] = None,
        regime: Optional[str] = None,
        direction: Optional[str] = None,
        volatility_regime: Optional[str] = None,
        as_of_timestamp: Optional[str] = None
    ) -> SimilarityQueryResponse:
        """
        Hierarchical multi-dimensional empirical lookup with chronological filtering:
        1. Exact (symbol, setup_family, session, regime, direction)
        2. Broad (symbol, setup_family, session)
        3. Instrument family (symbol, setup_family)
        4. Global setup family
        """
        records = self.records
        if as_of_timestamp:
            records = [r for r in records if r.timestamp <= as_of_timestamp]

        sym = symbol.upper().replace("/", "").replace(" ", "")
        all_sym_fam = [
            r for r in records
            if r.symbol == sym and r.setup_family == setup_family
        ]

        # Hierarchical filtering
        matches = all_sym_fam
        if session and session != "ALL":
            s_matches = [r for r in matches if r.session.upper() == session.upper()]
            if len(s_matches) >= 20:
                matches = s_matches

        if regime and regime != "ALL":
            r_matches = [r for r in matches if r.market_regime.upper() == regime.upper()]
            if len(r_matches) >= 15:
                matches = r_matches

        if direction and direction != "ALL":
            d_matches = [r for r in matches if r.direction.lower() == direction.lower()]
            if len(d_matches) >= 10:
                matches = d_matches

        # Fallback to broader dataset if sample count is zero
        if not matches and all_sym_fam:
            matches = all_sym_fam

        sample_size = len(matches)
        trade_dicts = [
            {
                "r_multiple": r.r_multiple,
                "mfe_r": r.mfe_r,
                "mae_r": r.mae_r,
                "duration_bars": r.duration_bars,
            }
            for r in matches
        ]

        exp_res: EmpiricalExpectancyResult = EmpiricalExpectancyEngine.calculate_expectancy(trade_dicts)

        edge_str = "INSUFFICIENT_DATA"
        if exp_res.evidence_tier in [SampleEvidenceTier.WEAK, SampleEvidenceTier.MODERATE, SampleEvidenceTier.STRONG]:
            if exp_res.cost_adjusted_expectancy_r >= 0.20 and exp_res.profit_factor >= 1.25:
                edge_str = "POSITIVE"
            elif exp_res.cost_adjusted_expectancy_r >= -0.05:
                edge_str = "NEUTRAL"
            else:
                edge_str = "NEGATIVE"

        return SimilarityQueryResponse(
            symbol=sym,
            setup_family=setup_family,
            sample_size=sample_size,
            evidence_tier=exp_res.evidence_tier,
            win_rate=exp_res.win_rate,
            average_r=exp_res.average_win_r if exp_res.sample_count > 0 else 0.0,
            expectancy=exp_res.expectancy_r,
            cost_adjusted_expectancy=exp_res.cost_adjusted_expectancy_r,
            profit_factor=exp_res.profit_factor,
            average_mfe_r=exp_res.average_mfe_r,
            average_mae_r=exp_res.average_mae_r,
            statistical_edge=edge_str,
            recommended_action=exp_res.recommended_action,
            matching_records=matches[-10:]
        )

    def get_setup_family_stats(self, symbol: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """
        Aggregates authoritative empirical performance statistics grouped by setup family,
        optionally filtered by instrument.
        """
        target_records = self.records
        if symbol:
            sym_clean = symbol.upper().replace("/", "").replace(" ", "")
            target_records = [r for r in target_records if r.symbol == sym_clean]

        families: Dict[str, List[ExperienceRecord]] = {}
        for r in target_records:
            families.setdefault(r.setup_family, []).append(r)

        stats: Dict[str, Dict[str, Any]] = {}
        for fam, recs in families.items():
            trade_dicts = [
                {
                    "r_multiple": r.r_multiple,
                    "mfe_r": r.mfe_r,
                    "mae_r": r.mae_r,
                    "duration_bars": r.duration_bars,
                }
                for r in recs
            ]
            exp_res = EmpiricalExpectancyEngine.calculate_expectancy(trade_dicts)

            stats[fam] = {
                "trades": exp_res.sample_count,
                "wins": exp_res.win_count,
                "losses": exp_res.loss_count,
                "breakevens": exp_res.breakeven_count,
                "win_rate": exp_res.win_rate,
                "profit_factor": exp_res.profit_factor,
                "average_win_r": exp_res.average_win_r,
                "average_loss_r": exp_res.average_loss_r,
                "expectancy_r": exp_res.expectancy_r,
                "cost_adjusted_expectancy_r": exp_res.cost_adjusted_expectancy_r,
                "evidence_tier": exp_res.evidence_tier,
                "has_statistical_edge": exp_res.has_statistical_edge,
                "average_mfe_r": exp_res.average_mfe_r,
                "average_mae_r": exp_res.average_mae_r,
            }
        return stats

    def get_instrument_breakdown(self) -> Dict[str, Dict[str, Any]]:
        """Aggregates performance statistics grouped by instrument."""
        by_symbol: Dict[str, List[ExperienceRecord]] = {}
        for r in self.records:
            by_symbol.setdefault(r.symbol, []).append(r)

        breakdown = {}
        for sym, recs in by_symbol.items():
            trade_dicts = [{"r_multiple": r.r_multiple, "mfe_r": r.mfe_r, "mae_r": r.mae_r, "duration_bars": r.duration_bars} for r in recs]
            exp = EmpiricalExpectancyEngine.calculate_expectancy(trade_dicts)
            breakdown[sym] = {
                "trades": exp.sample_count,
                "win_rate": exp.win_rate,
                "profit_factor": exp.profit_factor,
                "expectancy_r": exp.expectancy_r,
                "cost_adjusted_expectancy_r": exp.cost_adjusted_expectancy_r,
                "net_pnl": round(sum(r.net_pnl for r in recs), 2),
                "evidence_tier": exp.evidence_tier
            }
        return breakdown


# Singleton instance
experience_memory = ExperienceMemory()
