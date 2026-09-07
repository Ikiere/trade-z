"""
Trade-Z MetaTrader 5 (MT5) Desktop Bridge
Runs locally on the trader's Windows laptop alongside the MT5 terminal.
Provides a local REST API on port 5001 for real-time account sync and auto-execution.
"""

import sys
import json
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False


PORT = 5001


def get_broker_symbol(target_pair: str):
    """
    Auto-detects broker-specific symbol naming (e.g. EURUSD.m, EURUSD+, EURUSD_i, GOLD vs XAUUSD).
    """
    if not MT5_AVAILABLE:
        return target_pair

    clean_target = target_pair.upper().replace('/', '').replace(' ', '')
    
    # Direct check
    info = mt5.symbol_info(clean_target)
    if info:
        return clean_target

    # Alias mapping for Gold / Oil / Crypto
    aliases = []
    if 'XAU' in clean_target or 'GOLD' in clean_target:
        aliases.extend(['XAUUSD', 'GOLD', 'XAUUSDm', 'XAUUSD.m', 'GOLDm', 'XAUUSD+'])
    elif 'BTC' in clean_target:
        aliases.extend(['BTCUSD', 'BTCUSDT', 'BITCOIN', 'BTCUSD.m'])
    elif 'ETH' in clean_target:
        aliases.extend(['ETHUSD', 'ETHUSDT', 'ETHEREUM'])
    elif len(clean_target) == 6:
        # Standard Forex aliases
        aliases.extend([
            f"{clean_target}.m",
            f"{clean_target}+",
            f"{clean_target}_i",
            f"{clean_target}m",
            f"{clean_target}.pro",
            f"{clean_target}.raw",
            f"m{clean_target}",
        ])

    for alias in aliases:
        if mt5.symbol_info(alias):
            return alias

    # Fallback: scan all visible symbols for substring match
    all_symbols = mt5.symbols_get()
    if all_symbols:
        for s in all_symbols:
            if clean_target in s.name:
                return s.name

    return clean_target


def calculate_safe_lot_size(symbol_info, equity: float, sl_dist_points: float, risk_percent: float = 1.0) -> float:
    """
    Calculates precise, institutional lot size based on real account equity and broker tick value.
    Protects smaller accounts from over-leveraging.
    """
    min_volume = symbol_info.volume_min or 0.01
    max_volume = symbol_info.volume_max or 100.0
    vol_step = symbol_info.volume_step or 0.01

    if sl_dist_points <= 0 or equity <= 0:
        return min_volume

    risk_money = equity * (risk_percent / 100.0)
    tick_value = symbol_info.trade_tick_value or 1.0
    tick_size = symbol_info.trade_tick_size or 0.00001

    points = sl_dist_points / tick_size
    loss_per_1_lot = points * tick_value

    if loss_per_1_lot <= 0:
        return min_volume

    raw_lot = risk_money / loss_per_1_lot

    # Round down to nearest step
    steps = int(raw_lot / vol_step)
    calculated_lot = round(steps * vol_step, 2)

    # Clamping
    if calculated_lot < min_volume:
        calculated_lot = min_volume
    elif calculated_lot > max_volume:
        calculated_lot = max_volume

    return calculated_lot


class MT5BridgeHandler(BaseHTTPRequestHandler):

    def _send_json(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        # Allow cross-origin requests from the Trade-Z Web Dashboard
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ['/', '/health']:
            self._handle_health()
        elif path == '/account':
            self._handle_account()
        elif path == '/positions':
            self._handle_positions()
        else:
            self._send_json(404, {'success': False, 'error': 'Not Found'})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body_data = {}
        if content_length > 0:
            try:
                raw_body = self.rfile.read(content_length).decode('utf-8')
                body_data = json.loads(raw_body)
            except Exception as e:
                self._send_json(400, {'success': False, 'error': f'Invalid JSON payload: {str(e)}'})
                return

        if path in ['/order', '/trade']:
            self._handle_order(body_data)
        elif path == '/close':
            self._handle_close(body_data)
        else:
            self._send_json(404, {'success': False, 'error': 'Not Found'})

    # ── HANDLERS ──

    def _handle_health(self):
        if not MT5_AVAILABLE:
            self._send_json(200, {
                'success': False,
                'status': 'error',
                'error': 'MetaTrader5 Python module not installed. Run: pip install MetaTrader5'
            })
            return

        initialized = mt5.initialize()
        terminal_info = mt5.terminal_info() if initialized else None

        self._send_json(200, {
            'success': True,
            'status': 'online',
            'terminal_connected': bool(terminal_info and terminal_info.connected),
            'terminal_name': terminal_info.name if terminal_info else None,
            'build': terminal_info.build if terminal_info else None,
            'trade_allowed': terminal_info.trade_allowed if terminal_info else False
        })

    def _handle_account(self):
        if not MT5_AVAILABLE:
            self._send_json(500, {'success': False, 'error': 'MetaTrader5 module missing'})
            return

        if not mt5.initialize():
            err = mt5.last_error()
            self._send_json(503, {
                'success': False,
                'connected': False,
                'error': f'MT5 terminal not running or not responding: {err}. Please launch your MT5 terminal on this laptop.'
            })
            return

        acc = mt5.account_info()
        term = mt5.terminal_info()

        if not acc:
            self._send_json(401, {
                'success': False,
                'connected': False,
                'error': 'No trading account logged in. Please log in to your account inside the MT5 terminal.'
            })
            return

        positions = mt5.positions_get() or []

        self._send_json(200, {
            'success': True,
            'connected': True,
            'account': {
                'login': acc.login,
                'name': acc.name,
                'server': acc.server,
                'currency': acc.currency,
                'balance': round(acc.balance, 2),
                'equity': round(acc.equity, 2),
                'profit': round(acc.profit, 2),
                'margin': round(acc.margin, 2),
                'free_margin': round(acc.margin_free, 2),
                'margin_level': round(acc.margin_level, 2) if acc.margin_level else 0.0,
                'leverage': acc.leverage,
                'trade_allowed': acc.trade_allowed and term.trade_allowed if term else acc.trade_allowed,
                'open_positions_count': len(positions)
            }
        })

    def _handle_positions(self):
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal unavailable'})
            return

        raw_positions = mt5.positions_get()
        if raw_positions is None:
            self._send_json(200, {'success': True, 'positions': []})
            return

        formatted = []
        for p in raw_positions:
            formatted.append({
                'ticket': p.ticket,
                'symbol': p.symbol,
                'type': 'BUY' if p.type == mt5.POSITION_TYPE_BUY else 'SELL',
                'volume': p.volume,
                'price_open': p.price_open,
                'price_current': p.price_current,
                'sl': p.sl,
                'tp': p.tp,
                'profit': round(p.profit, 2),
                'swap': p.swap,
                'comment': p.comment,
                'time': p.time
            })

        self._send_json(200, {'success': True, 'positions': formatted})

    def _handle_order(self, data: dict):
        """
        Executes real trade on MetaTrader 5 terminal with account protection guards.
        """
        if not MT5_AVAILABLE or not mt5.initialize():
            err = mt5.last_error()
            self._send_json(503, {
                'success': False,
                'error': f'MT5 terminal not running or not responding: {err}'
            })
            return

        acc = mt5.account_info()
        term = mt5.terminal_info()

        if not acc:
            self._send_json(401, {'success': False, 'error': 'No account logged into MT5 terminal'})
            return

        if not term.trade_allowed or not acc.trade_allowed:
            self._send_json(403, {
                'success': False,
                'error': 'Algo trading is disabled. Click the "Algo Trading" button in the MT5 top toolbar to enable automated trades.'
            })
            return

        # Extract parameters
        raw_pair = data.get('pair', 'EURUSD')
        direction = str(data.get('direction', 'long')).lower()
        entry_price = float(data.get('entryPrice') or data.get('entry_price') or 0.0)
        stop_loss = float(data.get('stopLoss') or data.get('stop_loss') or 0.0)
        take_profit = float(data.get('takeProfit') or data.get('take_profit') or 0.0)
        risk_percent = float(data.get('riskPercent') or data.get('risk_percent') or 1.0)
        user_lot = data.get('lotSize') or data.get('lot_size')

        # 1. Resolve Broker Symbol
        symbol = get_broker_symbol(raw_pair)
        if not mt5.symbol_select(symbol, True):
            self._send_json(400, {
                'success': False,
                'error': f'Symbol "{symbol}" could not be selected in MT5 Market Watch. Check if broker supports this asset.'
            })
            return

        sym_info = mt5.symbol_info(symbol)
        if not sym_info:
            self._send_json(400, {'success': False, 'error': f'Symbol info unavailable for {symbol}'})
            return

        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            self._send_json(400, {'success': False, 'error': f'No tick data received for {symbol}'})
            return

        # 2. Price levels & Execution Mode
        is_buy = direction in ['long', 'buy']
        market_price = tick.ask if is_buy else tick.bid

        # If entry price was omitted or close to market, execute at MARKET
        is_market_order = entry_price <= 0 or abs(entry_price - market_price) <= (sym_info.point * 15)
        price_to_send = market_price if is_market_order else entry_price

        # 3. Account Capital Protection & Sizing
        sl_dist = abs(price_to_send - stop_loss)
        if user_lot:
            lot = round(float(user_lot), 2)
        else:
            lot = calculate_safe_lot_size(sym_info, acc.equity, sl_dist, risk_percent)

        # Smart Capital Safety Guard:
        # Check monetary risk of 0.01 lot vs account equity
        tick_val = sym_info.trade_tick_value or 1.0
        tick_sz = sym_info.trade_tick_size or 0.00001
        est_loss_at_sl = (sl_dist / tick_sz) * tick_val * lot

        override_safety = bool(data.get('overrideSafety') or data.get('override_safety') or False)

        if acc.equity < 150.0:
            # Small account calibration: broker minimum lot is 0.01.
            # Allow 0.01 lot orders with risk up to 40% of equity (or $20 max loss) so standard 15-40 pip stops work!
            max_allowed_loss = max(20.0, acc.equity * 0.40)
        else:
            max_allowed_loss = acc.equity * (max(2.0, risk_percent * 2.0) / 100.0)

        if not override_safety and est_loss_at_sl > max_allowed_loss:
            self._send_json(400, {
                'success': False,
                'error': (
                    f'Capital Protection Veto: Estimated stop loss risk (${est_loss_at_sl:.2f}) '
                    f'exceeds safe limit (${max_allowed_loss:.2f}) for current equity (${acc.equity:.2f}). '
                    f'Trade blocked to prevent burning account capital on high-volatility wide stops.'
                )
            })
            return

        # 4. Determine MT5 Order Action Type
        if is_market_order:
            order_type = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
        else:
            if is_buy:
                order_type = mt5.ORDER_TYPE_BUY_LIMIT if entry_price < market_price else mt5.ORDER_TYPE_BUY_STOP
            else:
                order_type = mt5.ORDER_TYPE_SELL_LIMIT if entry_price > market_price else mt5.ORDER_TYPE_SELL_STOP

        # Determine filling mode supported by broker
        filling_mode = mt5.ORDER_FILLING_IOC
        if sym_info.filling_mode & 2:
            filling_mode = mt5.ORDER_FILLING_IOC
        elif sym_info.filling_mode & 1:
            filling_mode = mt5.ORDER_FILLING_FOK
        elif is_market_order:
            filling_mode = mt5.ORDER_FILLING_IOC
        else:
            filling_mode = mt5.ORDER_FILLING_RETURN

        # 5. Build MT5 Request
        request = {
            "action": mt5.TRADE_ACTION_DEAL if is_market_order else mt5.TRADE_ACTION_PENDING,
            "symbol": symbol,
            "volume": lot,
            "type": order_type,
            "price": price_to_send,
            "sl": stop_loss if stop_loss > 0 else 0.0,
            "tp": take_profit if take_profit > 0 else 0.0,
            "deviation": 20,
            "magic": 992200,  # Trade-Z AI Magic Identifier
            "comment": "Trade-Z AI Auto",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling_mode,
        }

        # Check order validity before sending
        check_result = mt5.order_check(request)
        if check_result is None or check_result.retcode not in [0, mt5.TRADE_RETCODE_DONE]:
            # Try alternate filling mode (FOK / RETURN) if broker requires it
            request["type_filling"] = mt5.ORDER_FILLING_FOK
            check_fok = mt5.order_check(request)
            if check_fok and check_fok.retcode in [0, mt5.TRADE_RETCODE_DONE]:
                pass
            else:
                request["type_filling"] = mt5.ORDER_FILLING_RETURN

        # 6. Send Order to MT5 Terminal
        result = mt5.order_send(request)
        if result is None:
            err = mt5.last_error()
            self._send_json(500, {'success': False, 'error': f'Order send failed with MT5 error: {err}'})
            return

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            self._send_json(400, {
                'success': False,
                'retcode': result.retcode,
                'error': f'Broker rejected order: {result.comment} (Code: {result.retcode})'
            })
            return

        # Success!
        self._send_json(200, {
            'success': True,
            'ticket': result.order,
            'symbol': symbol,
            'direction': 'BUY' if is_buy else 'SELL',
            'volume': result.volume,
            'price': result.price,
            'sl': stop_loss,
            'tp': take_profit,
            'comment': result.comment,
            'balance': round(acc.balance, 2),
            'equity': round(acc.equity, 2),
            'message': f'Order #{result.order} placed successfully on MetaTrader 5!'
        })

    def _handle_close(self, data: dict):
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal unavailable'})
            return

        ticket = int(data.get('ticket') or 0)
        if ticket <= 0:
            self._send_json(400, {'success': False, 'error': 'Valid ticket required'})
            return

        positions = mt5.positions_get(ticket=ticket)
        if not positions:
            self._send_json(404, {'success': False, 'error': f'Position #{ticket} not found on MT5'})
            return

        p = positions[0]
        close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(p.symbol)
        close_price = tick.bid if p.type == mt5.POSITION_TYPE_BUY else tick.ask

        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "position": ticket,
            "symbol": p.symbol,
            "volume": p.volume,
            "type": close_type,
            "price": close_price,
            "deviation": 20,
            "magic": 992200,
            "comment": "Trade-Z Close",
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        res = mt5.order_send(req)
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            self._send_json(200, {'success': True, 'message': f'Position #{ticket} closed successfully'})
        else:
            err = res.comment if res else mt5.last_error()
            self._send_json(400, {'success': False, 'error': f'Failed to close position: {err}'})


def run_bridge():
    server_address = ('127.0.0.1', PORT)
    httpd = HTTPServer(server_address, MT5BridgeHandler)
    print(f"=========================================================")
    print(f"  Trade-Z MetaTrader 5 (MT5) Desktop Bridge")
    print(f"  Listening on: http://127.0.0.1:{PORT}")
    print(f"  MetaTrader5 Python Library: {'LOADED [OK]' if MT5_AVAILABLE else 'MISSING [ERROR]'}")
    print(f"  Keep this window open while auto-trading is active.")
    print(f"=========================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Trade-Z MT5 Bridge...")
        if MT5_AVAILABLE:
            mt5.shutdown()
        httpd.server_close()


if __name__ == '__main__':
    run_bridge()
