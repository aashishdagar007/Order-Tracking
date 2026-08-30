#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Warehouse WMS — Local Host Server Launcher (Linux / macOS)
# One-command automated prerequisite check, container build, and initialization.
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "================================================================="
echo "   Warehouse WMS — Production Local Server Initializer           "
echo "================================================================="

# 1. Check Prerequisites
echo "[*] Checking system prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "[-] Error: docker is not installed. Please install Docker Engine / Docker Desktop."; exit 1; }

if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "[-] Error: docker compose is not available."
    exit 1
fi

# 2. Configure Environment File (.env)
if [ ! -f .env ]; then
    echo "[*] .env file not found. Initializing from .env.example..."
    cp .env.example .env

    # Generate cryptographically secure random keys
    if command -v openssl >/dev/null 2>&1; then
        RAND_JWT=$(openssl rand -hex 32)
        RAND_AES=$(openssl rand -hex 32)
        RAND_PG_PASS=$(openssl rand -hex 16)
        RAND_REDIS_PASS=$(openssl rand -hex 16)

        # Update generated keys
        sed -i.bak "s/CHANGE_THIS_64char_random_jwt_secret_key_0000000000000000000000/$RAND_JWT/g" .env
        sed -i.bak "s/CHANGE_THIS_64hexchars_aes256_key_0000000000000000000000000000000/$RAND_AES/g" .env
        sed -i.bak "s/CHANGE_THIS_strong_db_password_2026/$RAND_PG_PASS/g" .env
        sed -i.bak "s/CHANGE_THIS_redis_password/$RAND_REDIS_PASS/g" .env
        rm -f .env.bak
        echo "[+] Successfully generated fresh AES-256 and JWT encryption keys."
    fi
else
    echo "[+] Found existing .env configuration."
fi

# 3. Build and Start Containerized Services
echo "[*] Building and launching local container cluster..."
$DOCKER_COMPOSE up -d --build

# 4. Wait for Database Readiness
echo "[*] Waiting for PostgreSQL service healthcheck..."
RETRIES=30
until docker exec wms_postgres pg_isready -U wms_user -d warehouse_wms >/dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo -n "."
    sleep 2
    RETRIES=$((RETRIES-1))
done
echo ""

if [ $RETRIES -eq 0 ]; then
    echo "[-] Timed out waiting for database."
    exit 1
fi
echo "[+] PostgreSQL database is ready and accepting connections."

# 5. Summary & Access URLs
echo ""
echo "================================================================="
echo "   🎉 WAREHOUSE WMS SERVER IS RUNNING LOCALLY!                  "
echo "================================================================="
echo "  Local Dashboard URL:    http://localhost"
echo "  FastAPI Swagger Docs:   http://localhost/api/v2/docs"
echo "  Default Admin User:     admin"
echo "  Default Admin Pass:     admin123 (Change in Admin -> Security Settings)"
echo "-----------------------------------------------------------------"
echo "  To view live container logs:   $DOCKER_COMPOSE logs -f"
echo "  To stop the server:            $DOCKER_COMPOSE down"
echo "  For free remote access setup:  see docs/remote-access-guide.md"
echo "================================================================="
