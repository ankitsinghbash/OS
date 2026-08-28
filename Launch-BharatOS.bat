@echo off
title "BharatOS Live Trading & Kernel Dashboard"
echo =========================================================================
echo   Starting BharatOS Live Real-Time Algo Trading GUI Window
echo =========================================================================
cd /d "%~dp0BharatOS"
"%USERPROFILE%\.cargo\bin\cargo.exe" run --release --target x86_64-pc-windows-gnu -p bharatos-core
pause
