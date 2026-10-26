@echo off
cd /d D:\Project\StockAnalysis_DouBao\ashare-rank-platform
start "AShareRank-Web" /min cmd /c "npm run dev > web.log 2>&1"
start "AShareRank-Realtime" /min cmd /c "python scripts\update_realtime.py --loop 180 > realtime.log 2>&1"
