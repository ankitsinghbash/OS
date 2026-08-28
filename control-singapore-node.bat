@echo off
title BharatOS — Singapore Cloud Quantum Dashboard
color 0A
cls
echo =========================================================================
echo   🇸🇬 BHARAT OS — SINGAPORE GCP QUANTUM CLOUD TERMINAL
echo   Target Host: 34.21.252.75 (Singapore High-Speed HFT Node)
echo   Engine: 100%% Pure Rust (24ns Bare-Metal Match Execution)
echo =========================================================================
echo.
echo  Opening Visual Quantum Dashboard on your Laptop...
start "" "%~dp0BharatOS-Singapore-Terminal.html"
echo.
echo  -------------------------------------------------------------------------
echo  [1] Stream Live Real-Time Rust Kernel Trade Logs (pm2 logs)
echo  [2] Check Singapore Cloud Health & PM2 Process Status (pm2 status)
echo  [3] Restart Cloud Rust Trading Daemon (pm2 restart)
echo  [4] Stop Cloud Trading Daemon (pm2 stop)
echo  [5] Open Full Interactive SSH Shell to Singapore Cloud Node
echo  [6] Re-open Visual Web Dashboard in Browser
echo  [7] Exit
echo  -------------------------------------------------------------------------
echo.
:loop
set /p choice="Select an action (1-7): "

if "%choice%"=="1" (
    ssh -o StrictHostKeyChecking=no -i "C:\Users\ankit\.ssh\id_gcp_deploy" bharatos_user@34.21.252.75 "pm2 logs bharatos-rust-kernel"
    goto loop
)
if "%choice%"=="2" (
    ssh -o StrictHostKeyChecking=no -i "C:\Users\ankit\.ssh\id_gcp_deploy" bharatos_user@34.21.252.75 "pm2 status"
    echo.
    goto loop
)
if "%choice%"=="3" (
    ssh -o StrictHostKeyChecking=no -i "C:\Users\ankit\.ssh\id_gcp_deploy" bharatos_user@34.21.252.75 "pm2 restart bharatos-rust-kernel"
    echo.
    goto loop
)
if "%choice%"=="4" (
    ssh -o StrictHostKeyChecking=no -i "C:\Users\ankit\.ssh\id_gcp_deploy" bharatos_user@34.21.252.75 "pm2 stop bharatos-rust-kernel"
    echo.
    goto loop
)
if "%choice%"=="5" (
    ssh -o StrictHostKeyChecking=no -i "C:\Users\ankit\.ssh\id_gcp_deploy" bharatos_user@34.21.252.75
    goto loop
)
if "%choice%"=="6" (
    start "" "%~dp0BharatOS-Singapore-Terminal.html"
    goto loop
)
if "%choice%"=="7" (
    exit
)
goto loop
