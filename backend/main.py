"""
backend/main.py
FastAPI application entry point for Warehouse WMS v2.
Handles DB connection pooling, default warehouse & admin seeding,
middleware, CORS, health checks, and router mounting.
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

import asyncpg
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from passlib.context import CryptContext

from backend.routers import auth, orders, upload, ws
from backend.cache.redis_client import get_pool, ping as redis_ping

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("wms.main")

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def init_db_pool() -> asyncpg.Pool:
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = int(os.environ.get("POSTGRES_PORT", "5432"))
    db = os.environ.get("POSTGRES_DB", "warehouse_wms")
    user = os.environ.get("POSTGRES_USER", "wms_user")
    password = os.environ.get("POSTGRES_PASSWORD", "")

    logger.info(f"Connecting to PostgreSQL at {host}:{port}/{db} as {user}...")
    pool = await asyncpg.create_pool(
        host=host,
        port=port,
        database=db,
        user=user,
        password=password,
        min_size=5,
        max_size=25,
        command_timeout=60,
    )
    return pool


async def seed_initial_data(pool: asyncpg.Pool):
    """Seed initial warehouse and admin user if database is freshly deployed."""
    default_slug = os.environ.get("DEFAULT_WAREHOUSE_SLUG", "main-warehouse")
    default_name = os.environ.get("DEFAULT_WAREHOUSE_NAME", "Main Warehouse")
    admin_user = os.environ.get("DEFAULT_ADMIN_USERNAME", "admin").strip().lower()
    admin_pass = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin123")

    async with pool.acquire() as conn:
        # Check if default warehouse exists
        wh = await conn.fetchrow("SELECT id FROM warehouses WHERE slug = $1", default_slug)
        if not wh:
            logger.info(f"Seeding default warehouse: {default_name} ({default_slug})")
            wh = await conn.fetchrow(
                """
                INSERT INTO warehouses (name, slug, address)
                VALUES ($1, $2, 'Primary Local Host Hub')
                RETURNING id
                """,
                default_name, default_slug
            )
        wh_id = wh["id"]

        # Check if admin user exists
        user = await conn.fetchrow("SELECT id FROM users WHERE username = $1", admin_user)
        if not user:
            logger.info(f"Seeding default admin user: {admin_user}")
            hashed = pwd_ctx.hash(admin_pass)
            user = await conn.fetchrow(
                """
                INSERT INTO users (username, name, password_hash, role)
                VALUES ($1, 'Master Administrator', $2, 'ADMIN')
                RETURNING id
                """,
                admin_user, hashed
            )

        # Ensure user_warehouse_access exists
        access = await conn.fetchrow(
            "SELECT 1 FROM user_warehouse_access WHERE user_id = $1 AND warehouse_id = $2",
            user["id"], wh_id
        )
        if not access:
            await conn.execute(
                """
                INSERT INTO user_warehouse_access (
                    user_id, warehouse_id, can_view_orders, can_pick_pack,
                    can_dispatch, can_upload, can_export, can_view_logs
                )
                VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
                """,
                user["id"], wh_id
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Warehouse WMS v2 backend...")
    db_pool = None
    try:
        db_pool = await init_db_pool()
        app.state.db_pool = db_pool
        await seed_initial_data(db_pool)
        logger.info("PostgreSQL database connection pool established & seeded.")
    except Exception as e:
        logger.warning(f"Could not connect to PostgreSQL immediately ({e}). Will retry on requests.")
        app.state.db_pool = db_pool

    # Check Redis
    is_redis_ok = await redis_ping()
    if is_redis_ok:
        logger.info("Redis cache & pub/sub connected successfully.")
    else:
        logger.warning("Redis is currently unreachable. Some caching features will fall back.")

    yield

    # Shutdown
    logger.info("Shutting down Warehouse WMS v2 backend...")
    if app.state.db_pool:
        await app.state.db_pool.close()
        logger.info("PostgreSQL connection pool closed.")
    try:
        r_pool = get_pool()
        await r_pool.disconnect()
        logger.info("Redis connection pool disconnected.")
    except Exception:
        pass


app = FastAPI(
    title="Warehouse WMS v2 Local Server API",
    version="2.0.0",
    description="Enterprise-grade local warehouse management with multi-tenancy, AES-256 encryption, and WebSockets.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS Middleware ────────────────────────────────────────────────────────────
raw_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost,http://localhost:3000,http://127.0.0.1:3000"
)
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check(request: Request):
    db_ok = False
    if getattr(request.app.state, "db_pool", None):
        try:
            async with request.app.state.db_pool.acquire() as conn:
                res = await conn.fetchval("SELECT 1")
                db_ok = (res == 1)
        except Exception:
            db_ok = False

    r_ok = await redis_ping()

    status_code = status.HTTP_200_OK if (db_ok and r_ok) else status.HTTP_200_OK
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if (db_ok and r_ok) else "degraded",
            "database": "connected" if db_ok else "disconnected",
            "redis": "connected" if r_ok else "disconnected",
            "version": "2.0.0",
        }
    )


# ── Router Registration ────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(orders.router)
app.include_router(upload.router)
app.include_router(ws.router)
