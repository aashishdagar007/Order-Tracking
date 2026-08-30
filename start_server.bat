@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM Warehouse WMS — Local Host Server Launcher (Windows)
REM Automated prerequisite check, container build, and initialization.
REM ─────────────────────────────────────────────────────────────────────────────

title Warehouse WMS - Local Server

echo =================================================================
echo    Warehouse WMS -- Production Local Server Initializer
echo =================================================================
echo.

REM 1. Check Prerequisites
echo [*] Checking Docker status...
docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [-] Error: Docker is not detected or not installed.
    echo     Please install Docker Desktop for Windows and make sure it is running.
    echo     Download: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM 2. Configure Environment File (.env)
if not exist ".env" (
    echo [*] .env file not found. Initializing from .env.example...
    copy .env.example .env >nul

    powershell -NoProfile -Command ^
        "$jwt = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) });" ^
        "$aes = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) });" ^
        "$pg  = -join ((1..16) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) });" ^
        "$rd  = -join ((1..16) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) });" ^
        "$c = Get-Content '.env' -Raw;" ^
        "$c = $c -replace 'CHANGE_THIS_64char_random_jwt_secret_key_0000000000000000000000', $jwt;" ^
        "$c = $c -replace 'CHANGE_THIS_64hexchars_aes256_key_0000000000000000000000000000000', $aes;" ^
        "$c = $c -replace 'CHANGE_THIS_strong_db_password_2026', $pg;" ^
        "$c = $c -replace 'CHANGE_THIS_redis_password', $rd;" ^
        "Set-Content '.env' $c;"
    echo [+] Successfully generated cryptographically secure AES-256 and JWT keys.
) else (
    echo [+] Found existing .env configuration.
)

REM 3. Build and Start Containerized Cluster
echo.
echo [*] Launching local container cluster (Nginx, Next.js, FastAPI, PostgreSQL, Redis)...
docker compose up -d --build

if %ERRORLEVEL% NEQ 0 (
    echo [-] Build or startup encountered an error. Check Docker Desktop status.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo =================================================================
echo    WAREHOUSE WMS SERVER IS ACTIVE AND RUNNING 100%% LOCALLY!
echo =================================================================
echo   Local Dashboard:       http://localhost
echo   FastAPI API Docs:      http://localhost/api/v2/docs
echo   Default Admin User:    admin
echo   Default Admin Pass:    admin123 (Change in Admin -^> Settings)
echo -----------------------------------------------------------------
echo   To view live logs:     docker compose logs -f
echo   To stop the server:    docker compose down
echo   Remote access guide:   docs\remote-access-guide.md
echo =================================================================
echo.
pause
