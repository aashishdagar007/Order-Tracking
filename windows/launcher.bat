@echo off
title Warehouse Management System Launcher
cd /d "%~dp0"

echo ====================================================
echo Starting Warehouse Management System...
echo ====================================================

if exist "runtime\node.exe" (
  "runtime\node.exe" windows\launcher.js
) else (
  node windows\launcher.js
)

pause
