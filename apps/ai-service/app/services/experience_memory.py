"""
Trade-Z Structured Trading Experience Memory:
Maintains an empirical database of all simulated and live trade setups across all instruments,
enabling multi-dimensional statistical similarity retrieval, expectancy lookup, and regime edge mapping.
Enforces phase-aware isolation (TRAIN / VALIDATION / OOS), record immutability, and strict temporal causality.
"""

from typing import Dict, Any, List, Optional, Union
from datetime import datetime
import pandas as pd
from pydantic import BaseModel, Field
from app.services.edge_policy import (
    EdgeState,
    DatasetPhase,
    parse_to_utc_timestamp,
    assert_point_in_time_data
)
from app.services.empirical_expectancy import (
    EmpiricalExpectancyEngine,
    EmpiricalExpectancyResult,
    SampleEvidenceTier,
)


class ExperienceRecord(BaseModel):
    id: str
    ticket: int
    timestamp: str                    # Close timestamp for backward compatibility
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
    decision_timestamp: Optional[str] = None
    entry_timestamp: Optional[str] = None
    close_timestamp: Optional[str] = None
    dataset_phase: str = "TRAIN"
    discovery_trade: bool = False
    evidence_source: str = "PRODUCTION"


class SimilarityQueryResponse(BaseModel):
    symbol: str
    setup_family: str
    sample_size: int
    evidence_tier: str
    win_rate: float
    average_r: float
    expectancy: Optional[float] = None
    cost_adjusted_expectancy: Optional[float] = None
    profit_factor: Optional[float] = None
    average_mfe_r: float = 0.0
    average_mae_r: float = 0.0
    statistical_edge: str = "INSUFFICIENT_DATA"  # POSITIVE | NEUTRAL | NEGATIVE | INSUFFICIENT_DATA
    edge_state: EdgeState = EdgeState.UNKNOWN_EDGE
    recommended_action: str = "WAIT" # TRADE | WAIT | NO_TRADE
    matching_records: List[ExperienceRecord] = []


class ExperienceMemory:
    """
    Phase-aware and point-in-time indexed experience storage for statistical setup evaluation across all instruments.
    """

    def __init__(self):
        self.records: List[ExperienceRecord] = []
        self.phase: DatasetPhase = DatasetPhase.TRAIN

    def reset(self):
        """Clears all records for a clean simulation environment."""
        self.records.clear()
        self.phase = DatasetPhase.TRAIN

    def set_phase(self, phase: DatasetPhase):
        """Sets the current dataset phase (TRAIN, VALIDATION, OOS)."""
        self.phase = phase

    def add_record(self, rec: ExperienceRecord) -> bool:
        """
        Stores completed trade record.
        Strictly enforces phase isolation: In VALIDATION or OOS phases, new outcomes
        are NEVER added to memory, preventing evaluation contamination.
        """
        if self.phase in [DatasetPhase.VALIDATION, DatasetPhase.OOS]:
            # Frozen memory: OOS outcomes cannot contaminate future decisions
            return False

        # Ensure close timestamp is set
        if not rec.close_timestamp:
            rec.close_timestamp = rec.timestamp

        self.records.append(rec)
        return True

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
        Guarantees that trades closing after as_of_timestamp cannot contaminate historical decisions.
        """
        records = self.records
        if as_of_timestamp:
            cutoff_dt = parse_to_utc_timestamp(as_of_timestamp)
            filtered = []
            for r in records:
                rec_ts = r.close_timestamp or r.timestamp
                try:
                    rec_dt = parse_to_utc_timestamp(rec_ts)
                    if rec_dt <= cutoff_dt:
                        filtered.append(r)
                except Exception:
                    # Fallback string comparison
                    if rec_ts <= as_of_timestamp:
                        filtered.append(r)
            records = filtered

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
            cutoff_dt = parse_to_utc_timestamp(as_of_timestamp)
            filtered = []
            for r in records:
                rec_ts = r.close_timestamp or r.timestamp
                try:
                    if parse_to_utc_timestamp(rec_ts) <= cutoff_dt:
                        filtered.append(r)
                except Exception:
                    if rec_ts <= as_of_timestamp:
                        filtered.append(r)
            records = filtered

        sym = symbol.upper().replace("/", "").replace(" ", "")
        all_sym_fam = [
            r for r in records
            if r.symbol == sym and r.setup_family == setup_family
        ]

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

        if not matches and all_sym_fam:
            matches = all_sym_fam

        sample_size = len(matches)
        trade_dicts = [
            {
                "r_multiple": r.r_multiple,
                "mfe_r": r.mfe_r,
                "mae_r": r.mae_r,
                "duration_bars": r.duration_bars,
                "market_regime": r.market_regime,
                "session": r.session
            }
            for r in matches
        ]

        exp_res: EmpiricalExpectancyResult = EmpiricalExpectancyEngine.calculate_expectancy(trade_dicts)

        edge_str = "INSUFFICIENT_DATA"
        if exp_res.edge_state == EdgeState.NEGATIVE_EDGE:
            edge_str = "NEGATIVE"
        elif exp_res.has_statistical_edge:
            edge_str = "POSITIVE"
        elif exp_res.edge_state in [EdgeState.WEAK_EVIDENCE, EdgeState.MODERATE_EVIDENCE, EdgeState.STRONG_EVIDENCE]:
            edge_str = "NEUTRAL"

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
            edge_state=exp_res.edge_state,
            recommended_action=exp_res.recommended_action,
            matching_records=matches[-10:]
        )

    def get_setup_family_stats(self, symbol: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """Aggregates performance statistics grouped by setup family."""
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
                    "market_regime": r.market_regime,
                    "session": r.session
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
                "edge_state": exp_res.edge_state,
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
            trade_dicts = [
                {
                    "r_multiple": r.r_multiple,
                    "mfe_r": r.mfe_r,
                    "mae_r": r.mae_r,
                    "duration_bars": r.duration_bars,
                    "market_regime": r.market_regime,
                    "session": r.session
                }
                for r in recs
            ]
            exp = EmpiricalExpectancyEngine.calculate_expectancy(trade_dicts)
            breakdown[sym] = {
                "trades": exp.sample_count,
                "win_rate": exp.win_rate,
                "profit_factor": exp.profit_factor,
                "expectancy_r": exp.expectancy_r,
                "cost_adjusted_expectancy_r": exp.cost_adjusted_expectancy_r,
                "net_pnl": round(sum(r.net_pnl for r in recs), 2),
                "evidence_tier": exp.evidence_tier,
                "edge_state": exp.edge_state
            }
        return breakdown


# Singleton instance
experience_memory = ExperienceMemory()
