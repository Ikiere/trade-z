"""
Unit test for MT5 Bridge mathematical risk sizing:
Validates small-account safety ($20 account on Gold),
1% risk cap (max 2%), and no forced clamping up to 0.01 lot.
"""

from mt5_bridge import calculate_safe_lot_size


class MockSymbol:
    def __init__(self, min_vol=0.01, max_vol=100.0, step=0.01, tick_val=1.0, tick_sz=0.01):
        self.volume_min = min_vol
        self.volume_max = max_vol
        self.volume_step = step
        self.trade_tick_value = tick_val
        self.trade_tick_size = tick_sz


def test_twenty_dollar_account_gold():
    # Gold: $20 equity, $5 stop distance (50 pips), 1% risk target ($0.20), max 2% ($0.40)
    # Loss on 0.01 lot is (5.0 / 0.01) * 1.0 * 0.01 = $5.00 (25% of equity!)
    gold = MockSymbol(min_vol=0.01, tick_val=1.0, tick_sz=0.01)
    res = calculate_safe_lot_size(gold, equity=20.0, sl_dist_points=5.0, risk_percent=1.0)
    print("Gold $20 account test result:")
    print("  -> valid:", res["valid"])
    print("  -> lot:", res["lot"])
    print("  -> error:", res.get("error"))

    assert not res["valid"], "Must veto trade because risk exceeds allowed maximum!"
    assert res["lot"] == 0.0, "Must NEVER force lot size to 0.01 if risk is breached!"
    print(">>> PASS: $20 account safely vetoed on Gold without forced lot clamping.\n")


def test_standard_account_eurusd():
    # EURUSD: $10,000 equity, 20-pip stop distance (0.0020), 1% risk target ($100.00)
    eur = MockSymbol(min_vol=0.01, tick_val=1.0, tick_sz=0.00001)
    res = calculate_safe_lot_size(eur, equity=10000.0, sl_dist_points=0.0020, risk_percent=1.0)
    print("EURUSD $10,000 account test result:")
    print("  -> valid:", res["valid"])
    print("  -> lot:", res["lot"])
    print("  -> est_loss: $", res.get("est_loss"))

    assert res["valid"], "Must approve trade within risk limits"
    assert res["lot"] == 0.50, f"Expected 0.50 lot, got {res['lot']}"
    assert res["est_loss"] <= 100.0
    print(">>> PASS: EURUSD 1% sizing exact (0.50 lots = $100.00 risk).\n")


if __name__ == "__main__":
    test_twenty_dollar_account_gold()
    test_standard_account_eurusd()
    print("ALL MT5 BRIDGE RISK TESTS PASSED SUCCESSFULLY!")
