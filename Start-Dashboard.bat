@echo off
title BharatOS Live Wealth & Profit Terminal
echo =========================================================================
echo   Starting BharatOS Live Dashboard & Real-Time Sync Bridge
echo =========================================================================
echo.
cd /d "%~dp0"
start http://localhost:8766
node dashboard_server.js
pause
