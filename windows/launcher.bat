@echo off
setlocal enabledelayedexpansion
title Warehouse Management System
cd /d "%~dp0"

echo ====================================================
echo 📦 WAREHOUSE MANAGEMENT SYSTEM - STARTING
echo ====================================================

set "NODE_EXE="

:: 1. Check bundled runtime in app root
if exist "%~dp0runtime\node.exe" (
  set "NODE_EXE=%~dp0runtime\node.exe"
  goto :FOUND_NODE
)

:: 2. Check bundled runtime in windows subdirectory
if exist "%~dp0windows\runtime\node.exe" (
  set "NODE_EXE=%~dp0windows\runtime\node.exe"
  goto :FOUND_NODE
)

:: 3. Check system PATH node.exe
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "NODE_EXE=node"
  goto :FOUND_NODE
)

:NOT_FOUND
echo.
echo [ERROR] Standalone Node.js runtime was not found!
echo Neither bundled 'runtime\node.exe' nor system Node.js was detected.
echo.
echo Please reinstall the application using the full Warehouse Management installer,
echo or install Node.js from https://nodejs.org
echo.
pause
exit /b 1

:FOUND_NODE
echo [OK] Using Node runtime: %NODE_EXE%

if exist "%~dp0windows\launcher.js" (
  "%NODE_EXE%" "%~dp0windows\launcher.js"
) else if exist "%~dp0launcher.js" (
  "%NODE_EXE%" "%~dp0launcher.js"
) else (
  echo [ERROR] Could not find launcher.js!
  pause
  exit /b 1
)

if %ERRORLEVEL% neq 0 (
  echo.
  echo Server stopped or exited with status %ERRORLEVEL%.
  pause
)
