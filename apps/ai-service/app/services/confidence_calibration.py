"""
Trade-Z AI Confidence Calibration Engine:
Monitors predicted model confidence vs realized empirical success rate.
Prevents uncalibrated LLM overconfidence from compromising risk and trade selection.
Calculates Brier score, reliability curves, and applies shrinkage adjustments.
"""

from typing import List, Dict, Any, Optional
import numpy as np
from pydantic import BaseModel, Field


class CalibrationBin(BaseModel):
    bin_range: str
    sample_count: int
    mean_predicted_confidence: float
    actual_win_rate: float
    calibration_error: float


class CalibrationReport(BaseModel):
    total_evaluations: int
    brier_score: float                   # Lower is better (0 = perfect calibration)
    mean_predicted_confidence: float
    actual_win_rate: float
    overconfidence_gap: float            # Positive indicates overconfidence
    calibration_discount_factor: float   # Multiplier (0.0 - 1.0) applied to AI influence
    reliability_bins: List[CalibrationBin] = []
    is_statistically_reliable: bool = False


class ConfidenceCalibrationEngine:
    """
    Maintains empirical record of (predicted_confidence, trade_outcome)
    and calibrates future AI confidence scores.
    """

    def __init__(self):
        # List of dicts: {"confidence": float, "outcome_win": bool, "realized_r": float}
        self.history: List[Dict[str, Any]] = []

    def record_prediction(self, confidence: float, realized_r: float):
        """
        Stores predicted confidence along with empirical outcome.
        """
        self.history.append({
            "confidence": max(0.0, min(100.0, float(confidence))),
            "outcome_win": 1 if realized_r > 0.05 else 0,
            "realized_r": float(realized_r)
        })

    def get_calibration_report(self) -> CalibrationReport:
        n = len(self.history)
        if n < 10:
            return CalibrationReport(
                total_evaluations=n,
                brier_score=0.25,
                mean_predicted_confidence=75.0,
                actual_win_rate=50.0,
                overconfidence_gap=25.0,
                calibration_discount_factor=0.75,
                reliability_bins=[],
                is_statistically_reliable=False
            )

        confs = np.array([h["confidence"] / 100.0 for h in self.history])
        outcomes = np.array([h["outcome_win"] for h in self.history])

        # Brier Score: mean((p - y)^2)
        brier_score = float(np.mean((confs - outcomes) ** 2))
        mean_pred = float(np.mean(confs) * 100.0)
        actual_wr = float(np.mean(outcomes) * 100.0)
        gap = mean_pred - actual_wr

        # Bins: 50-60, 60-70, 70-80, 80-90, 90-100
        bins_data = [
            ("50-60%", 0.50, 0.60),
            ("60-70%", 0.60, 0.70),
            ("70-80%", 0.70, 0.80),
            ("80-90%", 0.80, 0.90),
            ("90-100%", 0.90, 1.01),
        ]

        calibration_bins = []
        for label, low, high in bins_data:
            idx = np.where((confs >= low) & (confs < high))[0]
            if len(idx) > 0:
                bin_pred = float(np.mean(confs[idx]) * 100.0)
                bin_wr = float(np.mean(outcomes[idx]) * 100.0)
                calibration_bins.append(CalibrationBin(
                    bin_range=label,
                    sample_count=len(idx),
                    mean_predicted_confidence=round(bin_pred, 1),
                    actual_win_rate=round(bin_wr, 1),
                    calibration_error=round(bin_pred - bin_wr, 1)
                ))

        # Discount factor: If overconfidence gap is positive and large, shrink influence
        # e.g., if AI predicts 85% but wins 45% (gap = 40%), discount factor = 1 - 0.40 = 0.60
        discount = max(0.40, min(1.0, 1.0 - (max(0.0, gap) / 100.0)))

        return CalibrationReport(
            total_evaluations=n,
            brier_score=round(brier_score, 4),
            mean_predicted_confidence=round(mean_pred, 1),
            actual_win_rate=round(actual_wr, 1),
            overconfidence_gap=round(gap, 1),
            calibration_discount_factor=round(discount, 2),
            reliability_bins=calibration_bins,
            is_statistically_reliable=n >= 50
        )

    def calibrate_confidence(self, raw_confidence: float, sample_size: int = 100) -> float:
        """
        Calibrates raw LLM confidence using empirical calibration discount and sample size shrinkage.
        """
        rep = self.get_calibration_report()
        calibrated = raw_confidence * rep.calibration_discount_factor
        if sample_size < 50:
            # Shrink towards 50% neutral base for low sample sizes
            shrinkage = max(0.2, sample_size / 50.0)
            calibrated = (calibrated * shrinkage) + (50.0 * (1.0 - shrinkage))
        return round(max(30.0, min(95.0, calibrated)), 1)


ConfidenceCalibrator = ConfidenceCalibrationEngine

# Global instance
confidence_calibrator = ConfidenceCalibrationEngine()
