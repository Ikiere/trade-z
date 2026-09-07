@echo off
title Trade-Z MetaTrader 5 (MT5) Desktop Bridge
color 0A

echo =========================================================
echo   Starting Trade-Z MetaTrader 5 (MT5) Bridge
echo   Connecting your local MT5 Terminal to Trade-Z AI
echo =========================================================
echo.

cd /d "%~dp0"

REM Verify Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in your PATH.
    echo Please install Python 3.10+ from python.org and add to PATH.
    pause
    exit /b 1
)

REM Start the Bridge Server
echo [INFO] Starting MT5 Bridge Server on http://127.0.0.1:5001 ...
echo [INFO] Make sure your MetaTrader 5 desktop terminal is open and logged in.
echo [INFO] Ensure "Algo Trading" button is toggled ON in MT5 toolbar.
echo.
python mt5_bridge.py

pause
