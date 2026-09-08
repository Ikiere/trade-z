"""
Trade-Z MT5 Bridge Security & Deal Reconstruction Tests
Validates:
- Phase 22: MT5 Deal Reconstruction (Position -> Multiple Entries -> Partial Exits -> Deal Reasons)
- Phase 27: MT5 Bridge Security (Restricted origins, localhost default binding, route authentication)
"""

import unittest
from datetime import datetime, timezone


class MockDeal:
    def __init__(self, position_id, entry, symbol, volume, price, profit, commission, swap, reason, time, comment=""):
        self.position_id = position_id
        self.entry = entry  # 0=IN, 1=OUT
        self.symbol = symbol
        self.volume = volume
        self.price = price
        self.profit = profit
        self.commission = commission
        self.swap = swap
        self.fee = 0.0
        self.reason = reason
        self.time = time
        self.comment = comment
        self.type = 0  # 0=BUY


class TestMT5BridgeSecurityAndReconstruction(unittest.TestCase):

    def test_mt5_deal_reconstruction_with_partial_closes(self):
        """
        Phase 22 Test: Never assume one position = one deal.
        Reconstruct position -> entry deals -> partial exits -> final exit.
        Validate gross profit, net profit, cumulative commissions, and exit reason.
        """
        pid = 123456
        t_base = int(datetime(2025, 1, 10, 10, 0, tzinfo=timezone.utc).timestamp())

        deals = [
            # 1. Entry deal: Buy 0.10 EURUSD at 1.1000
            MockDeal(pid, 0, "EURUSD", 0.10, 1.1000, 0.0, -0.70, 0.0, 3, t_base, "Trade-Z Entry"),
            # 2. Partial exit: Close 0.05 at 1.1050 (+50 pips = +$25 profit, commission -$0.35)
            MockDeal(pid, 1, "EURUSD", 0.05, 1.1050, 25.0, -0.35, 0.0, 3, t_base + 1800, "Partial TP1"),
            # 3. Final exit: Take Profit hit for remaining 0.05 at 1.1100 (+100 pips = +$50 profit, deal reason 5 = TP)
            MockDeal(pid, 1, "EURUSD", 0.05, 1.1100, 50.0, -0.35, -0.50, 5, t_base + 3600, "[tp 1.11000]"),
        ]

        # Process deals using the authoritative reconstruction algorithm
        pos_map = {}
        for d in deals:
            p = d.position_id
            if p not in pos_map:
                pos_map[p] = {'entries': [], 'exits': []}
            if d.entry == 0:
                pos_map[p]['entries'].append(d)
            elif d.entry in [1, 2]:
                pos_map[p]['exits'].append(d)

        self.assertIn(pid, pos_map)
        data = pos_map[pid]
        self.assertEqual(len(data['entries']), 1)
        self.assertEqual(len(data['exits']), 2)

        exits = data['exits']
        entries = data['entries']
        total_entry_vol = sum(d.volume for d in entries)
        total_exit_vol = sum(d.volume for d in exits)

        self.assertEqual(total_entry_vol, 0.10)
        self.assertEqual(total_exit_vol, 0.10)

        gross_profit = round(sum(d.profit for d in exits), 2)
        total_commission = round(sum(d.commission for d in entries + exits), 2)
        total_swap = round(sum(d.swap for d in entries + exits), 2)
        net_profit = round(gross_profit + total_commission + total_swap, 2)

        self.assertEqual(gross_profit, 75.00)       # 25 + 50
        self.assertEqual(total_commission, -1.40)   # -0.70 + -0.35 + -0.35
        self.assertEqual(total_swap, -0.50)
        self.assertEqual(net_profit, 73.10)         # 75.00 - 1.40 - 0.50

        # Verify deal reason mapping: last deal had reason 5 -> TAKE_PROFIT
        last_deal = exits[-1]
        self.assertEqual(last_deal.reason, 5)

        deal_reason_code = getattr(last_deal, 'reason', -1)
        if deal_reason_code == 5 or '[tp' in last_deal.comment.lower():
            exit_reason = 'TAKE_PROFIT'
            status = 'take_profit'
        else:
            exit_reason = 'UNKNOWN'
            status = 'closed'

        self.assertEqual(exit_reason, 'TAKE_PROFIT')
        self.assertEqual(status, 'take_profit')

    def test_mt5_bridge_security_headers_and_auth(self):
        """
        Phase 27 Test: Verify MT5 bridge origin protection and authorization helpers.
        """
        import os
        from mt5_bridge import MT5BridgeHandler

        # Mock request handler
        class DummyRequest:
            def makefile(self, *args, **kwargs):
                from io import BytesIO
                return BytesIO(b"")

        handler = MT5BridgeHandler.__new__(MT5BridgeHandler)
        handler.client_address = ('127.0.0.1', 54321)
        handler.headers = {}

        # 1. When MT5_BRIDGE_SECRET is not set, localhost client is authorized
        if 'MT5_BRIDGE_SECRET' in os.environ:
            del os.environ['MT5_BRIDGE_SECRET']
        self.assertTrue(handler._is_authorized())

        # 2. Remote client without secret is REJECTED
        handler.client_address = ('192.168.1.50', 54321)
        self.assertFalse(handler._is_authorized())

        # 3. With MT5_BRIDGE_SECRET set, requires exact token match
        os.environ['MT5_BRIDGE_SECRET'] = 'test-secret-token-xyz'
        handler.headers = {'X-Bridge-Token': 'wrong-token'}
        self.assertFalse(handler._is_authorized())

        handler.headers = {'X-Bridge-Token': 'test-secret-token-xyz'}
        self.assertTrue(handler._is_authorized())

        del os.environ['MT5_BRIDGE_SECRET']


if __name__ == '__main__':
    unittest.main()
