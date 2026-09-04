@echo off
title Push BharatOS to GitHub
echo =========================================================================
echo   Pushing BharatOS Clean Repository to GitHub
echo =========================================================================
echo.
cd /d "%~dp0"
git add -A
git commit -m "fix(security): sanitize personal paths and IPs to dynamic environment variables"
git push origin main

echo.
echo =========================================================================
echo   Done!
echo =========================================================================
pause
