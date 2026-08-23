@echo off
title Warehouse Management
cd /d "%~dp0"

echo ====================================================
echo Starting Warehouse Management...
echo ====================================================

if exist "runtime\node.exe" (
  "runtime\node.exe" windows\launcher.js
) else (
  node windows\launcher.js
)

pause
