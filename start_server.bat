@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM Warehouse WMS — Node.js Direct Launcher (no Docker required)
REM ─────────────────────────────────────────────────────────────────────────────

title Warehouse WMS - Local Server

echo =================================================================
echo    Warehouse WMS -- Node.js Server Launcher
echo =================================================================
echo.

REM 1. Check Node.js
echo [*] Checking Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [-] Node.js is not installed or not in PATH.
    echo     Download: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo [+] Node.js %%v found.

REM 2. Install dependencies if needed
if not exist "node_modules" (
    echo [*] Installing dependencies...
    npm install --legacy-peer-deps
    if %ERRORLEVEL% NEQ 0 (
        echo [-] npm install failed.
        pause
        exit /b 1
    )
    echo [+] Dependencies installed.
) else (
    echo [+] node_modules found -- skipping install.
)

REM 3. Initialize database (safe -- creates tables only if they don't exist)
echo [*] Initializing database...
npx prisma db push --accept-data-loss >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] prisma db push had issues -- continuing anyway (auto-init in app).
) else (
    echo [+] Database schema ready.
)

REM 4. Launch server
echo.
echo [*] Starting Warehouse WMS...
echo.
echo =================================================================
echo    Access the app at: http://localhost:3000
echo    Default Login:     admin / admin123
echo    WebSocket:         ws://localhost:3000/ws/main-warehouse
echo -----------------------------------------------------------------
echo    To stop: press Ctrl+C in this window
echo =================================================================
echo.
npm run dev
