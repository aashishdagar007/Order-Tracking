"""
backend/routers/auth.py
JWT-based authentication and RBAC for 3 roles:
  ADMIN             — full system access
  WAREHOUSE_OPERATOR — order processing for assigned warehouses
  CLIENT            — read-only order tracking
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Config ─────────────────────────────────────────────────────────────────────
JWT_SECRET    = os.environ.get("JWT_SECRET", "dev-insecure-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


# ── Models ─────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str
    warehouse_slug: Optional[str] = None   # optional — use default if None


class TokenResponse(BaseModel):
    token: str
    user: dict


class UserResponse(BaseModel):
    id: str
    username: str
    name: str
    role: str
    warehouse_id: Optional[str]
    warehouse_slug: Optional[str]
    permissions: dict


# ── DB helpers ─────────────────────────────────────────────────────────────────
async def get_db(request: Request) -> asyncpg.Connection:
    """Pull the asyncpg connection pool from app state."""
    return request.app.state.db_pool


# ── JWT helpers ────────────────────────────────────────────────────────────────
def create_token(payload: dict) -> str:
    data = payload.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    data["exp"] = expire
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Current user dependency ────────────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    request: Request = None,
) -> dict:
    """
    Extract and validate JWT from Authorization header or x-wms-token header.
    Injects warehouse context for RLS.
    """
    token = None

    # 1. Bearer token
    if credentials and credentials.credentials:
        token = credentials.credentials

    # 2. Custom header fallback
    if not token and request:
        token = request.headers.get("x-wms-token")

    # 3. Query param for WebSocket connections
    if not token and request:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return decode_token(token)


def require_role(*roles: str):
    """Dependency factory: require the current user to have one of the given roles."""
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {list(roles)}",
            )
        return user
    return checker

# Shorthand dependencies
require_admin      = require_role("ADMIN")
require_operator   = require_role("ADMIN", "WAREHOUSE_OPERATOR")
require_any        = require_role("ADMIN", "WAREHOUSE_OPERATOR", "CLIENT")


# ── POST /auth — Login ─────────────────────────────────────────────────────────
@router.post("", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request):
    db = await get_db(request)

    # Fetch user
    user = await db.fetchrow(
        "SELECT id, username, name, password_hash, role, is_active FROM users WHERE username = $1",
        body.username.strip().lower()
    )

    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not pwd_ctx.verify(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Resolve warehouse
    warehouse_id   = None
    warehouse_slug = None
    permissions    = {}

    if user["role"] == "ADMIN":
        # ADMIN: default to first warehouse or the requested one
        if body.warehouse_slug:
            wh = await db.fetchrow(
                "SELECT id, slug FROM warehouses WHERE slug = $1 AND is_active = TRUE",
                body.warehouse_slug
            )
        else:
            wh = await db.fetchrow(
                "SELECT id, slug FROM warehouses WHERE is_active = TRUE ORDER BY created_at LIMIT 1"
            )
        if wh:
            warehouse_id   = str(wh["id"])
            warehouse_slug = wh["slug"]
        permissions = {
            "canViewOrders": True, "canPickPack": True, "canDispatch": True,
            "canUpload": True, "canExport": True, "canViewLogs": True,
        }
    else:
        # Non-admin: look up warehouse access
        if body.warehouse_slug:
            access = await db.fetchrow(
                """
                SELECT uwa.*, w.slug, w.id as wh_id
                FROM user_warehouse_access uwa
                JOIN warehouses w ON w.id = uwa.warehouse_id
                WHERE uwa.user_id = $1 AND w.slug = $2 AND w.is_active = TRUE
                """,
                user["id"], body.warehouse_slug
            )
        else:
            access = await db.fetchrow(
                """
                SELECT uwa.*, w.slug, w.id as wh_id
                FROM user_warehouse_access uwa
                JOIN warehouses w ON w.id = uwa.warehouse_id
                WHERE uwa.user_id = $1 AND w.is_active = TRUE
                ORDER BY uwa.granted_at LIMIT 1
                """,
                user["id"]
            )

        if not access:
            raise HTTPException(status_code=403, detail="No warehouse access assigned")

        warehouse_id   = str(access["wh_id"])
        warehouse_slug = access["slug"]
        permissions    = {
            "canViewOrders": access["can_view_orders"],
            "canPickPack":   access["can_pick_pack"],
            "canDispatch":   access["can_dispatch"],
            "canUpload":     access["can_upload"],
            "canExport":     access["can_export"],
            "canViewLogs":   access["can_view_logs"],
        }

    # Build JWT payload
    token_payload = {
        "userId":       str(user["id"]),
        "username":     user["username"],
        "name":         user["name"],
        "role":         user["role"],
        "warehouseId":  warehouse_id,
        "warehouseSlug": warehouse_slug,
        "permissions":  permissions,
    }

    # Update last_seen
    await db.execute(
        "UPDATE users SET last_seen = now() WHERE id = $1", user["id"]
    )

    token = create_token(token_payload)
    return TokenResponse(token=token, user=token_payload)


# ── GET /auth — Validate current token ────────────────────────────────────────
@router.get("")
async def validate_token(user: dict = Depends(get_current_user)):
    """Returns user info if token is valid, 401 otherwise."""
    return {"user": user}


# ── GET /auth/warehouses — List all warehouses (ADMIN only) ────────────────────
@router.get("/warehouses")
async def list_warehouses(
    request: Request,
    user: dict = Depends(require_admin)
):
    db = await get_db(request)
    rows = await db.fetch(
        "SELECT id, name, slug, address, is_active, created_at FROM warehouses ORDER BY name"
    )
    return [dict(r) for r in rows]


# ── POST /auth/warehouses — Create warehouse (ADMIN only) ──────────────────────
@router.post("/warehouses", status_code=201)
async def create_warehouse(
    body: dict,
    request: Request,
    user: dict = Depends(require_admin)
):
    db = await get_db(request)
    wh = await db.fetchrow(
        """
        INSERT INTO warehouses (name, slug, address)
        VALUES ($1, $2, $3)
        RETURNING id, name, slug
        """,
        body["name"], body["slug"], body.get("address")
    )
    return dict(wh)


# ── GET /auth/users — List users (ADMIN only) ─────────────────────────────────
@router.get("/users")
async def list_users(request: Request, user: dict = Depends(require_admin)):
    db = await get_db(request)
    rows = await db.fetch(
        """
        SELECT u.id, u.username, u.name, u.role, u.is_active, u.last_seen,
               array_agg(w.slug) FILTER (WHERE w.slug IS NOT NULL) as warehouse_slugs
        FROM users u
        LEFT JOIN user_warehouse_access uwa ON uwa.user_id = u.id
        LEFT JOIN warehouses w ON w.id = uwa.warehouse_id
        GROUP BY u.id
        ORDER BY u.name
        """
    )
    return [dict(r) for r in rows]


# ── POST /auth/users — Create user (ADMIN only) ───────────────────────────────
@router.post("/users", status_code=201)
async def create_user(body: dict, request: Request, user: dict = Depends(require_admin)):
    db = await get_db(request)
    hashed = pwd_ctx.hash(body["password"])
    row = await db.fetchrow(
        """
        INSERT INTO users (username, name, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, name, role
        """,
        body["username"].strip().lower(),
        body["name"],
        hashed,
        body.get("role", "WAREHOUSE_OPERATOR")
    )
    return dict(row)
