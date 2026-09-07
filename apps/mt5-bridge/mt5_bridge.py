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
from datetime import datetime, timedelta, timezone

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

    # Common broker symbol suffixes
    suffixes = ['', 'm', '_i', '+', '.pro', '.raw', '.m', '#']
    for s in suffixes:
        candidate = clean_target + s
        info = mt5.symbol_info(candidate)
        if info:
            return candidate

    # Common gold aliases
    aliases = []
    if 'XAU' in clean_target or 'GOLD' in clean_target:
        aliases.extend(['XAUUSD', 'GOLD', 'XAUUSDm', 'GOLDm', 'XAUUSD+', 'GOLD+', 'XAUUSD.m'])
    elif 'BTC' in clean_target:
        aliases.extend(['BTCUSD', 'BTCUSDm', 'BTCUSD+', 'BTCUSDT', 'BTCUSD.m', 'BTCUSD.pro', 'BTCUSD.raw', 'Bitcoin'])
    elif 'ETH' in clean_target:
        aliases.extend(['ETHUSD', 'ETHUSDm', 'ETHUSD+', 'ETHUSDT', 'ETHUSD.m', 'ETHUSD.pro', 'ETHUSD.raw', 'Ethereum'])
    elif 'SOL' in clean_target:
        aliases.extend(['SOLUSD', 'SOLUSDm', 'SOLUSD+', 'SOLUSDT', 'SOLUSD.m', 'SOLUSD.pro', 'SOLUSD.raw', 'Solana'])
    elif len(clean_target) == 6:
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


def clean_symbol(sym: str) -> str:
    """Normalizes broker-specific symbol back to standard pair (e.g. XAUUSDm -> XAUUSD)."""
    s = sym.upper().replace('/', '').replace(' ', '')
    for suf in ['_I', '+', '.PRO', '.RAW', '.M', '#', 'M']:
        if s.endswith(suf) and len(s) > len(suf) + 2:
            return s[:-len(suf)]
    return s


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
        elif path in ['/positions', '/orders', '/trades']:
            self._handle_positions()
        elif path in ['/history', '/deals']:
            self._handle_history(parsed.query)
        elif path in ['/quote', '/price', '/tick']:
            self._handle_quote(parsed.query)
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
        elif path in ['/modify', '/modify_position', '/modify-position', '/modify-sl-tp']:
            self._handle_modify(body_data)
        elif path in ['/close', '/close_position', '/close-position']:
            self._handle_close(body_data)
        elif path in ['/close-all', '/close_all', '/closeall']:
            self._handle_close_all(body_data)
        elif path in ['/cancel', '/cancel_order', '/cancel-order']:
            self._handle_cancel_order(body_data)
        else:
            self._send_json(404, {'success': False, 'error': f'Route {path} Not Found'})

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
        raw_orders = mt5.orders_get()

        pos_formatted = []
        total_floating_pnl = 0.0
        if raw_positions:
            for p in raw_positions:
                p_profit = round(p.profit, 2)
                total_floating_pnl += p_profit
                pos_formatted.append({
                    'ticket': p.ticket,
                    'symbol': p.symbol,
                    'pair': clean_symbol(p.symbol),
                    'type': 'BUY' if p.type == mt5.POSITION_TYPE_BUY else 'SELL',
                    'direction': 'long' if p.type == mt5.POSITION_TYPE_BUY else 'short',
                    'volume': p.volume,
                    'price_open': p.price_open,
                    'price_current': p.price_current,
                    'sl': p.sl,
                    'tp': p.tp,
                    'profit': p_profit,
                    'swap': p.swap,
                    'comment': p.comment,
                    'time': p.time,
                    'opened_at': datetime.fromtimestamp(p.time, timezone.utc).isoformat()
                })

        ord_type_names = {
            mt5.ORDER_TYPE_BUY: 'BUY',
            mt5.ORDER_TYPE_SELL: 'SELL',
            mt5.ORDER_TYPE_BUY_LIMIT: 'BUY LIMIT',
            mt5.ORDER_TYPE_SELL_LIMIT: 'SELL LIMIT',
            mt5.ORDER_TYPE_BUY_STOP: 'BUY STOP',
            mt5.ORDER_TYPE_SELL_STOP: 'SELL STOP',
        }

        orders_formatted = []
        if raw_orders:
            for o in raw_orders:
                orders_formatted.append({
                    'ticket': o.ticket,
                    'symbol': o.symbol,
                    'pair': clean_symbol(o.symbol),
                    'order_type': ord_type_names.get(o.type, 'PENDING'),
                    'direction': 'long' if o.type in [mt5.ORDER_TYPE_BUY, mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP] else 'short',
                    'volume': o.volume_current,
                    'price_open': o.price_open,
                    'price_current': o.price_current,
                    'sl': o.sl,
                    'tp': o.tp,
                    'time': o.time_setup,
                    'created_at': datetime.fromtimestamp(o.time_setup, timezone.utc).isoformat()
                })

        acc = mt5.account_info()
        self._send_json(200, {
            'success': True,
            'positions': pos_formatted,
            'orders': orders_formatted,
            'summary': {
                'open_positions_count': len(pos_formatted),
                'pending_orders_count': len(orders_formatted),
                'total_floating_pnl': round(total_floating_pnl, 2),
                'balance': round(acc.balance, 2) if acc else 0.0,
                'equity': round(acc.equity, 2) if acc else 0.0,
            }
        })

    def _handle_history(self, query_str: str):
        """
        Reconstructs all closed trades from MT5 history deals with realized PnL and exit prices.
        """
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal unavailable'})
            return

        params = parse_qs(query_str)
        days = int(params.get('days', ['60'])[0])
        now = datetime.now()
        past = now - timedelta(days=days)
        deals = mt5.history_deals_get(past, now)

        if not deals:
            self._send_json(200, {'success': True, 'trades': []})
            return

        pos_map = {}
        for d in deals:
            if not d.symbol:
                continue
            pid = d.position_id
            if pid not in pos_map:
                pos_map[pid] = {'entry': None, 'exit': None}
            if d.entry == 0:  # DEAL_ENTRY_IN
                pos_map[pid]['entry'] = d
            elif d.entry in [1, 2]:  # DEAL_ENTRY_OUT or DEAL_ENTRY_INOUT
                pos_map[pid]['exit'] = d

        closed_trades = []
        for pid, data in pos_map.items():
            if data['exit']:
                d_exit = data['exit']
                d_entry = data['entry']
                profit = round(d_exit.profit, 2)
                exit_price = d_exit.price
                entry_price = d_entry.price if d_entry else exit_price
                direction = 'long' if (d_entry.type == 0 if d_entry else d_exit.type == 1) else 'short'
                comment = str(d_exit.comment or '')
                status = 'take_profit' if '[tp' in comment else 'stopped_out' if '[sl' in comment else ('won' if profit > 0 else 'closed')

                closed_trades.append({
                    'ticket': pid,
                    'symbol': d_exit.symbol,
                    'pair': clean_symbol(d_exit.symbol),
                    'direction': direction,
                    'volume': d_exit.volume,
                    'entry_price': entry_price,
                    'exit_price': exit_price,
                    'profit': profit,
                    'status': status,
                    'commission': round(d_exit.commission, 2),
                    'swap': round(d_exit.swap, 2),
                    'comment': comment,
                    'opened_at': datetime.fromtimestamp(d_entry.time, timezone.utc).isoformat() if d_entry else None,
                    'closed_at': datetime.fromtimestamp(d_exit.time, timezone.utc).isoformat()
                })

        closed_trades.sort(key=lambda x: x.get('closed_at') or '', reverse=True)
        self._send_json(200, {'success': True, 'trades': closed_trades})

    def _handle_cancel_order(self, data: dict):
        """
        Cancels a pending limit or stop order by ticket.
        """
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal unavailable'})
            return

        ticket = int(data.get('ticket') or 0)
        if ticket <= 0:
            self._send_json(400, {'success': False, 'error': 'Valid ticket required'})
            return

        req = {
            "action": mt5.TRADE_ACTION_REMOVE,
            "order": ticket,
        }
        res = mt5.order_send(req)
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            self._send_json(200, {'success': True, 'message': f'Pending order #{ticket} cancelled successfully.'})
        else:
            err = res.comment if res else mt5.last_error()
            self._send_json(400, {'success': False, 'error': f'Failed to cancel order #{ticket}: {err}'})

    def _handle_quote(self, query_str: str):
        """
        Returns real-time bid, ask, and spread directly from MT5 terminal for accurate pricing.
        """
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal not running or not responding'})
            return

        params = parse_qs(query_str)
        raw_pair = params.get('pair', params.get('symbol', ['EURUSD']))[0]
        symbol = get_broker_symbol(raw_pair)
        if not mt5.symbol_select(symbol, True):
            self._send_json(400, {'success': False, 'error': f'Symbol "{symbol}" not found in MT5 Market Watch'})
            return

        tick = mt5.symbol_info_tick(symbol)
        sym_info = mt5.symbol_info(symbol)
        if not tick or not sym_info:
            self._send_json(400, {'success': False, 'error': f'No tick data received for {symbol}'})
            return

        self._send_json(200, {
            'success': True,
            'symbol': symbol,
            'pair': raw_pair,
            'bid': tick.bid,
            'ask': tick.ask,
            'last': tick.last or tick.bid,
            'spread': round(tick.ask - tick.bid, sym_info.digits),
            'digits': sym_info.digits,
            'point': sym_info.point,
        })

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
        req_type = str(data.get('orderType') or data.get('order_type') or '').lower().strip()
        if 'limit' in req_type:
            if is_buy:
                # MT5 buy limit: price must be < market ask
                order_type = mt5.ORDER_TYPE_BUY_LIMIT if entry_price < market_price else mt5.ORDER_TYPE_BUY_STOP
            else:
                # MT5 sell limit: price must be > market bid
                order_type = mt5.ORDER_TYPE_SELL_LIMIT if entry_price > market_price else mt5.ORDER_TYPE_SELL_STOP
        elif 'stop' in req_type:
            if is_buy:
                # MT5 buy stop: price must be > market ask
                order_type = mt5.ORDER_TYPE_BUY_STOP if entry_price > market_price else mt5.ORDER_TYPE_BUY_LIMIT
            else:
                # MT5 sell stop: price must be < market bid
                order_type = mt5.ORDER_TYPE_SELL_STOP if entry_price < market_price else mt5.ORDER_TYPE_SELL_LIMIT
        elif is_market_order:
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

        type_names = {
            mt5.ORDER_TYPE_BUY: 'BUY',
            mt5.ORDER_TYPE_SELL: 'SELL',
            mt5.ORDER_TYPE_BUY_LIMIT: 'BUY LIMIT',
            mt5.ORDER_TYPE_SELL_LIMIT: 'SELL LIMIT',
            mt5.ORDER_TYPE_BUY_STOP: 'BUY STOP',
            mt5.ORDER_TYPE_SELL_STOP: 'SELL STOP',
        }
        order_type_str = type_names.get(order_type, 'BUY' if is_buy else 'SELL')

        # Success!
        self._send_json(200, {
            'success': True,
            'ticket': result.order,
            'symbol': symbol,
            'direction': 'BUY' if is_buy else 'SELL',
            'order_type': order_type_str,
            'volume': result.volume,
            'price': result.price,
            'sl': stop_loss,
            'tp': take_profit,
            'comment': result.comment,
            'balance': round(acc.balance, 2),
            'equity': round(acc.equity, 2),
            'message': f'Order #{result.order} ({order_type_str}) placed successfully on MetaTrader 5!'
        })

    def _handle_close(self, data: dict):
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal unavailable or not running'})
            return

        ticket = int(data.get('ticket') or data.get('position') or 0)
        if ticket <= 0:
            self._send_json(400, {'success': False, 'error': 'Valid position ticket required'})
            return

        # 1. Locate position
        positions = mt5.positions_get(ticket=ticket)
        if not positions:
            # Fallback scan all active positions
            all_pos = mt5.positions_get() or []
            positions = [pos for pos in all_pos if pos.ticket == ticket]

        if not positions:
            self._send_json(404, {'success': False, 'error': f'Position #{ticket} not found on MT5 terminal. It may have already closed.'})
            return

        p = positions[0]
        close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY

        sym_info = mt5.symbol_info(p.symbol)
        if not sym_info:
            self._send_json(400, {'success': False, 'error': f'Symbol info for {p.symbol} not found'})
            return

        tick = mt5.symbol_info_tick(p.symbol)
        if not tick:
            self._send_json(400, {'success': False, 'error': f'Live tick quote unavailable for {p.symbol}'})
            return

        close_price = tick.bid if p.type == mt5.POSITION_TYPE_BUY else tick.ask

        # 2. Try filling modes supported by broker
        candidate_fillings = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
        if sym_info.filling_mode & 2:
            candidate_fillings = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
        elif sym_info.filling_mode & 1:
            candidate_fillings = [mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_RETURN]

        last_res = None
        close_success = False

        for filling_mode in candidate_fillings:
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
                "type_filling": filling_mode,
            }

            last_res = mt5.order_send(req)
            if last_res and last_res.retcode == mt5.TRADE_RETCODE_DONE:
                close_success = True
                break

        if close_success and last_res:
            self._send_json(200, {
                'success': True,
                'ticket': ticket,
                'symbol': p.symbol,
                'volume': p.volume,
                'price': last_res.price or close_price,
                'profit': round(p.profit, 2),
                'message': f'Position #{ticket} ({p.symbol}) closed successfully at {close_price}!'
            })
        else:
            err = last_res.comment if last_res else mt5.last_error()
            retcode = last_res.retcode if last_res else -1
            self._send_json(400, {
                'success': False,
                'retcode': retcode,
                'error': f'Broker rejected close order for #{ticket}: {err} (Code: {retcode})'
            })

    def _handle_modify(self, data: dict):
        """
        Modifies Stop Loss and Take Profit of an existing open position on MetaTrader 5.
        Used by AI Trade Sentinel to lock breakeven or trail stop loss.
        """
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal unavailable or not running'})
            return

        ticket = int(data.get('ticket') or data.get('position') or 0)
        if ticket <= 0:
            self._send_json(400, {'success': False, 'error': 'Valid position ticket required'})
            return

        # 1. Locate position
        positions = mt5.positions_get(ticket=ticket)
        if not positions:
            all_pos = mt5.positions_get() or []
            positions = [pos for pos in all_pos if pos.ticket == ticket]

        if not positions:
            self._send_json(404, {'success': False, 'error': f'Position #{ticket} not found on MT5 terminal'})
            return

        p = positions[0]
        sym_info = mt5.symbol_info(p.symbol)
        if not sym_info:
            self._send_json(400, {'success': False, 'error': f'Symbol info for {p.symbol} not found'})
            return

        digits = sym_info.digits
        new_sl = round(float(data.get('sl') or data.get('stop_loss') or p.sl), digits)
        new_tp = round(float(data.get('tp') or data.get('take_profit') or p.tp), digits)

        req = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": ticket,
            "symbol": p.symbol,
            "sl": new_sl,
            "tp": new_tp,
        }

        res = mt5.order_send(req)
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            self._send_json(200, {
                'success': True,
                'ticket': ticket,
                'symbol': p.symbol,
                'sl': new_sl,
                'tp': new_tp,
                'message': f'Position #{ticket} modified: SL -> {new_sl}, TP -> {new_tp}'
            })
        else:
            err = res.comment if res else mt5.last_error()
            retcode = res.retcode if res else -1
            self._send_json(400, {
                'success': False,
                'retcode': retcode,
                'error': f'Failed to modify position #{ticket}: {err} (Code: {retcode})'
            })

    def _handle_close_all(self, data: dict):
        """Emergency panic close: Closes all open positions simultaneously."""
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal unavailable'})
            return

        positions = mt5.positions_get() or []
        if not positions:
            self._send_json(200, {'success': True, 'closed_count': 0, 'message': 'No open positions to close'})
            return

        closed = []
        failed = []

        for p in positions:
            close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
            tick = mt5.symbol_info_tick(p.symbol)
            if not tick:
                failed.append({'ticket': p.ticket, 'error': 'No tick'})
                continue

            close_price = tick.bid if p.type == mt5.POSITION_TYPE_BUY else tick.ask
            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "position": p.ticket,
                "symbol": p.symbol,
                "volume": p.volume,
                "type": close_type,
                "price": close_price,
                "deviation": 25,
                "magic": 992200,
                "comment": "Trade-Z Panic Close",
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            res = mt5.order_send(req)
            if res and res.retcode == mt5.TRADE_RETCODE_DONE:
                closed.append({'ticket': p.ticket, 'symbol': p.symbol, 'volume': p.volume, 'price': res.price})
            else:
                # Try FOK
                req["type_filling"] = mt5.ORDER_FILLING_FOK
                res2 = mt5.order_send(req)
                if res2 and res2.retcode == mt5.TRADE_RETCODE_DONE:
                    closed.append({'ticket': p.ticket, 'symbol': p.symbol, 'volume': p.volume, 'price': res2.price})
                else:
                    failed.append({'ticket': p.ticket, 'error': res.comment if res else 'Unknown'})

        self._send_json(200, {
            'success': True,
            'closed_count': len(closed),
            'failed_count': len(failed),
            'closed': closed,
            'failed': failed,
            'message': f'Closed {len(closed)} of {len(positions)} positions.'
        })


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
