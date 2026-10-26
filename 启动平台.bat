@echo off
chcp 65001 >nul
title AShare Rank Platform Launcher
cd /d D:\Project\StockAnalysis_DouBao\ashare-rank-platform

echo [1/3] Starting web server (Next.js dev)...
start "AShareRank-Web" /min cmd /c "npm run dev > web.log 2>&1"

echo [2/3] Starting realtime updater (background loop, auto trading-hours)...
start "AShareRank-Realtime" /min cmd /c "python scripts\update_realtime.py --loop 180 > realtime.log 2>&1"

echo [3/3] Opening browser...
timeout /t 6 >nul
start http://localhost:3000

echo.
echo Platform started: http://localhost:3000
echo Logs: web.log / realtime.log (in project folder)
echo To stop: close the minimized windows named AShareRank-Web / AShareRank-Realtime
pause
