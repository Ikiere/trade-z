#!/usr/bin/env bash
echo "========================================================="
echo "  Starting Trade-Z MetaTrader 5 (MT5) Bridge"
echo "  Connecting your local MT5 Terminal to Trade-Z AI"
echo "========================================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/apps/mt5-bridge"

echo "[INFO] Starting MT5 Bridge Server on http://127.0.0.1:5001 ..."
echo "[INFO] Make sure your MetaTrader 5 desktop terminal is open and logged in."
echo "[INFO] Ensure 'Algo Trading' button is toggled ON in MT5 toolbar."
echo ""

python mt5_bridge.py
