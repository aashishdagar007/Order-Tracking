@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM Warehouse WMS — Node.js Local Server Launcher
REM ─────────────────────────────────────────────────────────────────────────────

title Warehouse WMS - Local Server
cls

echo =================================================================
echo    Warehouse WMS -- Node.js Local Server Launcher
echo =================================================================
echo.

REM 1. Check Node.js installation
echo [*] Checking Node.js installation...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [-] ERROR: Node.js is not installed or not in your PATH.
    echo     Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do echo [+] Node.js %%v detected.

REM 2. Install dependencies if node_modules is missing
if not exist node_modules (
    echo.
    echo [*] First-time setup: Installing required dependencies...
    echo     (This may take 1-2 minutes depending on your internet connection)
    call npm install --legacy-peer-deps --no-fund --no-audit
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [-] ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
    echo [+] Dependencies installed successfully.
) else (
    echo [+] Dependencies already installed.
)

REM 3. Ensure database schema is ready
echo.
echo [*] Checking database schema...
call npx prisma db push --accept-data-loss >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] Note: Schema push skipped; auto-initialization will run on server start.
) else (
    echo [+] Database schema verified.
)

REM 4. Server information & launch
echo.
echo =================================================================
echo    Server is starting up!
echo.
echo    URL:            http://localhost:3000
echo    Default Login:  admin / admin123
echo    WebSocket:      ws://localhost:3000/ws/main-warehouse
echo.
echo    Press Ctrl+C in this window to stop the server.
echo =================================================================
echo.

REM Open browser after a 3-second delay in the background
start /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

REM 5. Run development server
call npm run dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [-] Server exited with code %ERRORLEVEL%.
    pause
)
