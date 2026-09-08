"""
Trade-Z Strategy Discovery & Adaptive Regime Matrix
Tracks and calculates performance edge across multidimensional tuples:
(symbol, session, setup_family, volatility_regime)

Permits the system to dynamically weight candidate opportunities based on empirical expectancy
rather than static assumptions. Flags setups with N >= 20 and EV < 0 as DISCOURAGED/NEGATIVE EDGE.
"""

from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
import math


@dataclass
class RegimePerformanceBucket:
    symbol: str
    session: str
    setup_family: str
    volatility_regime: str
    sample_size: int = 0
    wins: int = 0
    losses: int = 0
    break_evens: int = 0
    total_r: float = 0.0
    gross_profit_r: float = 0.0
    gross_loss_r: float = 0.0
    r_multiples: List[float] = field(default_factory=list)

    @property
    def win_rate(self) -> float:
        total_decisive = self.wins + self.losses
        return (self.wins / total_decisive) if total_decisive > 0 else 0.0

    @property
    def avg_r(self) -> float:
        return (self.total_r / self.sample_size) if self.sample_size > 0 else 0.0

    @property
    def profit_factor(self) -> float:
        if self.gross_loss_r == 0:
            return 999.0 if self.gross_profit_r > 0 else 1.0
        return self.gross_profit_r / abs(self.gross_loss_r)

    @property
    def expected_value_r(self) -> float:
        """
        EV = (Win Rate * Avg Win R) - (Loss Rate * Avg Loss R)
        """
        if self.sample_size == 0:
            return 0.0
        avg_win = (self.gross_profit_r / self.wins) if self.wins > 0 else 0.0
        avg_loss = (abs(self.gross_loss_r) / self.losses) if self.losses > 0 else 0.0
        loss_rate = (self.losses / self.sample_size)
        win_rate = (self.wins / self.sample_size)
        return (win_rate * avg_win) - (loss_rate * avg_loss)

    @property
    def status(self) -> str:
        """
        Returns regime health status:
        - UNPROVEN: N < 10
        - ACTIVE_FAVORABLE: N >= 10 and EV >= 0.2R
        - ACTIVE_NEUTRAL: N >= 10 and 0 <= EV < 0.2R
        - DISCOURAGED: N >= 20 and EV < 0 (empirical negative edge)
        - MARGINAL: 10 <= N < 20 and EV < 0
        """
        if self.sample_size < 10:
            return "UNPROVEN"
        if self.sample_size >= 20 and self.expected_value_r < 0:
            return "DISCOURAGED"
        if self.expected_value_r < 0:
            return "MARGINAL"
        if self.expected_value_r >= 0.2:
            return "ACTIVE_FAVORABLE"
        return "ACTIVE_NEUTRAL"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "session": self.session,
            "setup_family": self.setup_family,
            "volatility_regime": self.volatility_regime,
            "sample_size": self.sample_size,
            "wins": self.wins,
            "losses": self.losses,
            "break_evens": self.break_evens,
            "win_rate": round(self.win_rate * 100, 1),
            "avg_r": round(self.avg_r, 2),
            "profit_factor": round(self.profit_factor, 2),
            "expected_value_r": round(self.expected_value_r, 2),
            "status": self.status,
        }


class AdaptiveRegimeMatrix:
    """
    In-memory or persistent store of regime expectancy buckets.
    """

    def __init__(self):
        # Key: (symbol, session, setup_family, volatility_regime)
        self._matrix: Dict[Tuple[str, str, str, str], RegimePerformanceBucket] = {}

    def record_outcome(
        self,
        symbol: str,
        session: str,
        setup_family: str,
        volatility_regime: str,
        realized_r: float,
    ) -> RegimePerformanceBucket:
        """
        Record a realized trade outcome in R-multiples into the matrix.
        """
        key = (
            symbol.upper(),
            session.upper(),
            setup_family,
            volatility_regime.upper(),
        )

        if key not in self._matrix:
            self._matrix[key] = RegimePerformanceBucket(
                symbol=symbol.upper(),
                session=session.upper(),
                setup_family=setup_family,
                volatility_regime=volatility_regime.upper(),
            )

        bucket = self._matrix[key]
        bucket.sample_size += 1
        bucket.total_r += realized_r
        bucket.r_multiples.append(realized_r)

        if realized_r > 0.05:
            bucket.wins += 1
            bucket.gross_profit_r += realized_r
        elif realized_r < -0.05:
            bucket.losses += 1
            bucket.gross_loss_r += abs(realized_r)
        else:
            bucket.break_evens += 1

        return bucket

    def get_bucket(
        self,
        symbol: str,
        session: str,
        setup_family: str,
        volatility_regime: str,
    ) -> Optional[RegimePerformanceBucket]:
        key = (
            symbol.upper(),
            session.upper(),
            setup_family,
            volatility_regime.upper(),
        )
        return self._matrix.get(key)

    def get_setup_expectancy(
        self,
        symbol: str,
        session: str,
        setup_family: str,
        volatility_regime: str,
    ) -> Dict[str, Any]:
        """
        Provides empirical setup expectancy for opportunity engine ranking.
        If unproven or no data, returns baseline prior.
        """
        bucket = self.get_bucket(symbol, session, setup_family, volatility_regime)
        if not bucket or bucket.sample_size < 5:
            # Neutral baseline prior
            return {
                "sample_size": bucket.sample_size if bucket else 0,
                "empirical_ev_r": 0.0,
                "status": "UNPROVEN",
                "score_multiplier": 1.0,
                "reason": "Insufficient empirical data (< 5 trades) for this regime tuple; applying standard baseline.",
            }

        ev = bucket.expected_value_r
        status = bucket.status

        # Multipliers for ranking:
        # ACTIVE_FAVORABLE: 1.25x boost
        # ACTIVE_NEUTRAL: 1.0x
        # MARGINAL: 0.75x penalty
        # DISCOURAGED: 0.1x penalty (de-prioritized or vetoed)
        if status == "DISCOURAGED":
            multiplier = 0.1
        elif status == "MARGINAL":
            multiplier = 0.75
        elif status == "ACTIVE_FAVORABLE":
            multiplier = 1.25
        else:
            multiplier = 1.0

        return {
            "sample_size": bucket.sample_size,
            "empirical_ev_r": round(ev, 2),
            "win_rate": round(bucket.win_rate * 100, 1),
            "profit_factor": round(bucket.profit_factor, 2),
            "status": status,
            "score_multiplier": multiplier,
            "reason": f"Regime {status}: N={bucket.sample_size}, EV={round(ev, 2)}R, PF={round(bucket.profit_factor, 2)}",
        }

    def list_all_buckets(self) -> List[Dict[str, Any]]:
        return [b.to_dict() for b in self._matrix.values()]

    def list_discouraged_regimes(self) -> List[Dict[str, Any]]:
        return [b.to_dict() for b in self._matrix.values() if b.status == "DISCOURAGED"]

    def populate_from_trade_history(self, trades: List[Dict[str, Any]]) -> int:
        """
        Populate matrix from historical trade list.
        Each trade dict must contain:
        symbol, session, setup_family, volatility_regime, realized_r
        """
        count = 0
        for t in trades:
            if all(k in t for k in ["symbol", "session", "setup_family", "volatility_regime", "realized_r"]):
                self.record_outcome(
                    symbol=t["symbol"],
                    session=t["session"],
                    setup_family=t["setup_family"],
                    volatility_regime=t["volatility_regime"],
                    realized_r=float(t["realized_r"]),
                )
                count += 1
        return count


# Singleton instance
adaptive_regime_matrix = AdaptiveRegimeMatrix()
