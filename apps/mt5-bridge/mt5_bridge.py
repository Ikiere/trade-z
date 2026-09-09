"""
Trade-Z MetaTrader 5 (MT5) Desktop Bridge
Runs locally on the trader's Windows laptop alongside the MT5 terminal.
Provides a local REST API on port 5001 for real-time account sync and auto-execution.
"""

import os
import sys
import json
import traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
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


def calculate_safe_lot_size(symbol_info, equity: float, sl_dist_points: float, risk_percent: float = 1.0) -> dict:
    """
    Calculates precise, institutional lot size based on real account equity and broker tick value.
    Protects smaller accounts ($20-$500) from catastrophic drawdown.
    Hard enforces risk_percent <= 2.0% (target 0.5% - 1.0%).
    If the minimum broker volume (e.g. 0.01) creates risk exceeding allowed risk, returns valid: False, lot: 0.0.
    """
    min_volume = float(symbol_info.volume_min or 0.01)
    max_volume = float(symbol_info.volume_max or 100.0)
    vol_step = float(symbol_info.volume_step or 0.01)

    # Hard cap risk percentage to 2.0% maximum
    effective_risk_pct = min(max(risk_percent, 0.1), 2.0)
    max_risk_dollars = equity * (effective_risk_pct / 100.0)

    tick_value = float(symbol_info.trade_tick_value or 1.0)
    tick_size = float(symbol_info.trade_tick_size or 0.00001)

    if sl_dist_points <= 0 or equity <= 0 or tick_size <= 0:
        return {
            "valid": False,
            "lot": 0.0,
            "error": "Invalid equity or stop loss distance",
            "max_risk_dollars": max_risk_dollars,
            "est_loss": 0.0
        }

    points = sl_dist_points / tick_size
    loss_per_1_lot = points * tick_value

    if loss_per_1_lot <= 0:
        return {
            "valid": False,
            "lot": 0.0,
            "error": "Loss per 1 lot calculated as zero or negative",
            "max_risk_dollars": max_risk_dollars,
            "est_loss": 0.0
        }

    # Calculate dollar loss if trading minimum allowed broker volume
    loss_at_min_volume = loss_per_1_lot * min_volume

    if loss_at_min_volume > max_risk_dollars:
        return {
            "valid": False,
            "lot": 0.0,
            "error": (
                f"UNEXECUTABLE_AT_BROKER_MIN_VOLUME: Capital Shield Veto: Broker minimum volume ({min_volume}) "
                f"with stop distance ({sl_dist_points:.5f}) would risk ${loss_at_min_volume:.2f} "
                f"({ (loss_at_min_volume / equity * 100.0):.1f}% of equity), "
                f"exceeding approved risk budget (${max_risk_dollars:.2f})."
            ),
            "max_risk_dollars": max_risk_dollars,
            "est_loss": loss_at_min_volume
        }

    raw_lot = max_risk_dollars / loss_per_1_lot
    # Round down to nearest step
    steps = int(raw_lot / vol_step)
    calculated_lot = round(steps * vol_step, 2)

    if calculated_lot < min_volume:
        # If steps rounded below min_volume even though loss_at_min_volume <= max_risk_dollars
        calculated_lot = min_volume

    if calculated_lot > max_volume:
        calculated_lot = max_volume

    est_loss = loss_per_1_lot * calculated_lot

    return {
        "valid": True,
        "lot": calculated_lot,
        "error": None,
        "max_risk_dollars": max_risk_dollars,
        "est_loss": est_loss
    }


class MT5BridgeHandler(BaseHTTPRequestHandler):

    def _is_authorized(self) -> bool:
        secret = os.environ.get('MT5_BRIDGE_SECRET')
        if not secret:
            # If no secret configured, strictly restrict execution calls to loopback / localhost
            client_host = self.client_address[0]
            return client_host in ['127.0.0.1', 'localhost', '::1']
        
        token = self.headers.get('X-Bridge-Token') or self.headers.get('Authorization', '').replace('Bearer ', '')
        return token == secret

    def _send_json(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        allowed_origin = os.environ.get('MT5_BRIDGE_ALLOWED_ORIGIN', 'http://localhost:3000')
        req_origin = self.headers.get('Origin', '')
        if req_origin in ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', allowed_origin]:
            self.send_header('Access-Control-Allow-Origin', req_origin)
        else:
            self.send_header('Access-Control-Allow-Origin', allowed_origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bridge-Token')
        self.end_headers()
        try:
            self.wfile.write(json.dumps(data, default=str).encode('utf-8'))
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def do_OPTIONS(self):
        self.send_response(200)
        allowed_origin = os.environ.get('MT5_BRIDGE_ALLOWED_ORIGIN', 'http://localhost:3000')
        req_origin = self.headers.get('Origin', '')
        if req_origin in ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', allowed_origin]:
            self.send_header('Access-Control-Allow-Origin', req_origin)
        else:
            self.send_header('Access-Control-Allow-Origin', allowed_origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bridge-Token')
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
        elif path in ['/candles', '/rates', '/bars', '/ohlc']:
            self._handle_candles(parsed.query)
        else:
            self._send_json(404, {'success': False, 'error': 'Not Found'})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Protect sensitive trading endpoints
        protected_routes = [
            '/order', '/trade', '/modify', '/modify_position', '/modify-position',
            '/modify-sl-tp', '/close', '/close_position', '/close-position',
            '/close-all', '/close_all', '/closeall', '/cancel', '/cancel_order', '/cancel-order'
        ]
        if path in protected_routes and not self._is_authorized():
            self._send_json(401, {'success': False, 'error': 'Unauthorized: MT5 bridge authentication required'})
            return

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
                pos_map[pid] = {'entries': [], 'exits': []}
            if d.entry == 0:  # DEAL_ENTRY_IN
                pos_map[pid]['entries'].append(d)
            elif d.entry in [1, 2]:  # DEAL_ENTRY_OUT or DEAL_ENTRY_INOUT
                pos_map[pid]['exits'].append(d)

        closed_trades = []
        for pid, data in pos_map.items():
            if data['exits']:
                exits = data['exits']
                entries = data['entries']
                total_entry_vol = sum(d.volume for d in entries)
                total_exit_vol = sum(d.volume for d in exits)

                entry_price = sum(d.price * d.volume for d in entries) / total_entry_vol if total_entry_vol > 0 else exits[0].price
                exit_price = sum(d.price * d.volume for d in exits) / total_exit_vol if total_exit_vol > 0 else exits[-1].price

                gross_profit = round(sum(d.profit for d in exits), 2)
                total_commission = round(sum(d.commission for d in entries + exits), 2)
                total_swap = round(sum(d.swap for d in entries + exits), 2)
                total_fee = round(sum(getattr(d, 'fee', 0.0) for d in entries + exits), 2)
                net_profit = round(gross_profit + total_commission + total_swap + total_fee, 2)

                first_entry = entries[0] if entries else None
                last_exit = exits[-1]
                direction = 'long' if (first_entry.type == 0 if first_entry else last_exit.type == 1) else 'short'

                deal_reason_code = getattr(last_exit, 'reason', -1)
                comment = str(last_exit.comment or '')

                # Authoritative deal reason mapping
                # MT5: 4=SL, 5=TP, 6=SO (Stop Out), 0=CLIENT, 3=EXPERT
                if deal_reason_code == 4 or '[sl' in comment.lower():
                    status = 'stopped_out'
                    exit_reason = 'STOP_LOSS'
                elif deal_reason_code == 5 or '[tp' in comment.lower():
                    status = 'take_profit'
                    exit_reason = 'TAKE_PROFIT'
                elif deal_reason_code == 6 or '[so' in comment.lower():
                    status = 'stopped_out'
                    exit_reason = 'STOP_OUT'
                elif net_profit > 0:
                    status = 'won'
                    exit_reason = 'MANUAL_OR_EXPERT'
                elif abs(net_profit) <= 0.01:
                    status = 'breakeven'
                    exit_reason = 'BREAKEVEN'
                else:
                    status = 'lost'
                    exit_reason = 'MANUAL_OR_EXPERT'

                closed_trades.append({
                    'ticket': pid,
                    'position_id': pid,
                    'symbol': last_exit.symbol,
                    'pair': clean_symbol(last_exit.symbol),
                    'direction': direction,
                    'volume': round(total_exit_vol, 4),
                    'entry_price': round(entry_price, 5),
                    'exit_price': round(exit_price, 5),
                    'gross_profit': gross_profit,
                    'net_profit': net_profit,
                    'profit': net_profit,
                    'status': status,
                    'exit_reason': exit_reason,
                    'deal_reason_code': deal_reason_code,
                    'deals_count': len(entries) + len(exits),
                    'partial_exits_count': max(0, len(exits) - 1),
                    'commission': total_commission,
                    'swap': total_swap,
                    'fee': total_fee,
                    'comment': comment,
                    'opened_at': datetime.fromtimestamp(first_entry.time, timezone.utc).isoformat() if first_entry else None,
                    'closed_at': datetime.fromtimestamp(last_exit.time, timezone.utc).isoformat()
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

    def _handle_candles(self, query_str: str):
        """
        Returns real-time authentic broker OHLC candles directly from MT5 terminal.
        Provides zero-delay, zero-rate-limit market data without external API dependencies.
        """
        if not MT5_AVAILABLE or not mt5.initialize():
            self._send_json(503, {'success': False, 'error': 'MT5 terminal not running or not responding'})
            return

        params = parse_qs(query_str)
        raw_pair = params.get('pair', params.get('symbol', ['EURUSD']))[0]
        tf_str = params.get('timeframe', params.get('interval', params.get('tf', ['15m'])))[0].lower()
        count = int(params.get('count', params.get('outputsize', [60]))[0])
        count = max(10, min(count, 300))

        symbol = get_broker_symbol(raw_pair)
        if not mt5.symbol_select(symbol, True):
            self._send_json(400, {'success': False, 'error': f'Symbol "{symbol}" not found in MT5 Market Watch'})
            return

        tf_map = {
            '1m': mt5.TIMEFRAME_M1,
            '5m': mt5.TIMEFRAME_M5,
            '15m': mt5.TIMEFRAME_M15,
            '15min': mt5.TIMEFRAME_M15,
            '30m': mt5.TIMEFRAME_M30,
            '30min': mt5.TIMEFRAME_M30,
            '1h': mt5.TIMEFRAME_H1,
            '4h': mt5.TIMEFRAME_H4,
            '1d': mt5.TIMEFRAME_D1,
            '1day': mt5.TIMEFRAME_D1,
        }
        include_forming = params.get('include_forming', ['false'])[0].lower() in ['true', '1', 'yes']
        start_pos = 0 if include_forming else 1
        rates = mt5.copy_rates_from_pos(symbol, tf, start_pos, count)
        if rates is None or len(rates) == 0:
            self._send_json(400, {'success': False, 'error': f'No candle data available from MT5 for {symbol}'})
            return

        candles = []
        for r in rates:
            candles.append({
                'time': int(r['time']),
                'open': float(r['open']),
                'high': float(r['high']),
                'low': float(r['low']),
                'close': float(r['close']),
                'volume': float(r['tick_volume']),
            })

        self._send_json(200, {
            'success': True,
            'symbol': symbol,
            'pair': raw_pair,
            'timeframe': tf_str,
            'count': len(candles),
            'candles': candles
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

        # 3. Account Capital Protection & Sizing (Institutional Hard Risk Limits)
        sl_dist = abs(price_to_send - stop_loss)
        if sl_dist <= 0:
            self._send_json(400, {
                'success': False,
                'error': 'Stop loss must be provided and cannot equal entry price.'
            })
            return

        effective_risk_pct = min(max(risk_percent, 0.1), 2.0)
        max_allowed_loss = acc.equity * (effective_risk_pct / 100.0)

        sizing = calculate_safe_lot_size(sym_info, acc.equity, sl_dist, effective_risk_pct)
        if not sizing["valid"]:
            self._send_json(400, {
                'success': False,
                'error': sizing['error'],
                'risk_veto': True
            })
            return

        lot = sizing["lot"]

        # If explicit lot was provided, verify it strictly stays under approved risk
        if user_lot:
            requested_lot = round(float(user_lot), 2)
            if requested_lot > sizing["lot"]:
                self._send_json(400, {
                    'success': False,
                    'error': (
                        f"Risk Engine Veto: Requested lot {requested_lot} exceeds approved risk volume {sizing['lot']}. "
                        f"User-provided lot size cannot override risk engine."
                    ),
                    'risk_veto': True
                })
                return
            lot = min(sizing["lot"], requested_lot)

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
    # 0.0.0.0 = bind to all interfaces (required when the bridge runs on a VPS/EC2 so
    # Render can reach it). Set MT5_BRIDGE_HOST=127.0.0.1 to restrict to localhost only.
    host = os.environ.get('MT5_BRIDGE_HOST', '0.0.0.0')
    server_address = (host, PORT)
    httpd = ThreadingHTTPServer(server_address, MT5BridgeHandler)
    is_local = host in ('127.0.0.1', 'localhost')
    security_label = 'Loopback Localhost Protection Active' if is_local else 'Listening on all interfaces (VPS/EC2 mode)'
    public_url = f'http://127.0.0.1:{PORT}' if is_local else f'http://<YOUR-EC2-IP>:{PORT}'
    print(f"=========================================================")
    print(f"  Trade-Z MetaTrader 5 (MT5) Desktop Bridge")
    print(f"  Listening on: http://{host}:{PORT}")
    print(f"  Public URL:   {public_url}")
    print(f"  MetaTrader5 Python Library: {'LOADED [OK]' if MT5_AVAILABLE else 'MISSING [ERROR]'}")
    print(f"  Security: {security_label}")
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
