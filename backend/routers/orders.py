"""
backend/routers/orders.py
Order CRUD with:
  - RLS-based warehouse isolation (app.warehouse_id session variable)
  - AES-256-GCM encryption for customer_name and extra fields
  - Redis cache (30s TTL, invalidated on write)
  - WebSocket broadcast on status change
  - Full ACID compliance (PostgreSQL transactions)
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from backend.routers.auth import (
    get_current_user, require_operator, require_any, require_admin
)
from backend.security.encryption import encrypt_field, decrypt_field, encrypt_json, decrypt_json
from backend.cache.redis_client import (
    cache_orders, get_cached_orders, invalidate_warehouse_cache,
    make_filter_hash, cache_stats, get_cached_stats
)
from backend.routers.ws import broadcast_order_update

router = APIRouter(prefix="/orders", tags=["orders"])


# ── Helpers ────────────────────────────────────────────────────────────────────

async def get_db(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool


async def set_warehouse_context(conn: asyncpg.Connection, warehouse_id: str):
    """Set the PostgreSQL session variable for RLS enforcement."""
    await conn.execute(f"SET LOCAL app.warehouse_id = '{warehouse_id}'")


def _row_to_order(row: asyncpg.Record) -> dict:
    """Convert a DB row to a serializable dict, decrypting encrypted fields."""
    d = dict(row)
    # Decrypt AES fields
    try:
        d["customerName"] = decrypt_field(d.pop("customer_name_enc", None))
    except ValueError:
        d["customerName"] = "[DECRYPTION ERROR]"

    try:
        extra_raw = decrypt_json(d.pop("extra_enc", None))
        d["extra"] = json.dumps(extra_raw) if extra_raw else None
    except ValueError:
        d["extra"] = None

    # Rename snake_case → camelCase for frontend compatibility
    renames = {
        "order_no": "orderNo", "invoice_no": "invoiceNo", "lr_no": "lrNo",
        "dock_bay": "dockBay", "vehicle_no": "vehicleNo", "box_count": "boxCount",
        "weight_kg": "weightKg", "sku_list": "skuList", "manifest_id": "manifestId",
        "target_sla": "targetSla", "entered_by": "enteredBy", "entered_at": "enteredAt",
        "picked_by": "pickedBy", "picked_at": "pickedAt", "packed_by": "packedBy",
        "packed_at": "packedAt", "dispatched_at": "dispatchedAt",
        "updated_by": "updatedBy", "updated_at": "updatedAt",
        "warehouse_id": "warehouseId",
    }
    for old, new in renames.items():
        if old in d:
            d[new] = d.pop(old)

    # Serialize datetimes
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    d["id"] = str(d["id"]) if d.get("id") else None
    if d.get("warehouseId"):
        d["warehouseId"] = str(d["warehouseId"])

    return d


# ── GET /orders — List with filters + caching ─────────────────────────────────
@router.get("")
async def list_orders(
    request: Request,
    user: dict = Depends(require_any),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = Query(None),
    transporter: Optional[str] = Query(None),
    extra_key: Optional[str] = Query(None, alias="extraKey"),
    extra_val: Optional[str] = Query(None, alias="extraVal"),
    limit: int = Query(300, ge=1, le=1000),
    page: int = Query(1, ge=1),
):
    warehouse_id = user.get("warehouseId")
    if not warehouse_id:
        raise HTTPException(400, "No warehouse context in token")

    # CLIENT role: they can only see their own orders
    # (in a future version, link CLIENT users to specific order ranges or tags)

    filter_params = {
        "s": search, "st": status_filter, "p": priority,
        "tr": transporter, "ek": extra_key, "ev": extra_val,
        "l": limit, "pg": page
    }
    fhash = make_filter_hash(filter_params)

    # Try cache first
    cached = await get_cached_orders(warehouse_id, fhash)
    if cached is not None:
        return {"orders": cached, "cached": True}

    # Build query
    conditions = ["o.warehouse_id = $1"]
    params: list = [uuid.UUID(warehouse_id)]
    idx = 2

    if status_filter and status_filter != "ALL":
        conditions.append(f"o.status = ${idx}"); params.append(status_filter); idx += 1
    if priority:
        conditions.append(f"o.priority = ${idx}"); params.append(priority); idx += 1
    if transporter:
        conditions.append(f"o.transporter ILIKE ${idx}"); params.append(f"%{transporter}%"); idx += 1
    if search and search.strip():
        q = search.strip()
        conditions.append(
            f"(o.order_no ILIKE ${idx} OR o.invoice_no ILIKE ${idx} OR "
            f"o.lr_no ILIKE ${idx} OR o.transporter ILIKE ${idx} OR "
            f"o.vehicle_no ILIKE ${idx} OR o.zone ILIKE ${idx})"
        )
        params.append(f"%{q}%"); idx += 1

    where_clause = " AND ".join(conditions)
    offset = (page - 1) * limit

    sql = f"""
        SELECT o.id, o.warehouse_id, o.order_no, o.invoice_no, o.lr_no,
               o.customer_name_enc, o.extra_enc,
               o.sent, o.status, o.priority, o.zone, o.dock_bay,
               o.transporter, o.vehicle_no, o.box_count, o.weight_kg,
               o.sku_list, o.notes, o.manifest_id,
               o.entered_by, o.entered_at, o.picked_by, o.picked_at,
               o.packed_by, o.packed_at, o.dispatched_at,
               o.updated_by, o.updated_at
        FROM orders o
        WHERE {where_clause}
        ORDER BY o.entered_at DESC
        LIMIT ${idx} OFFSET ${idx+1}
    """
    params.extend([limit, offset])

    pool = await get_db(request)
    async with pool.acquire() as conn:
        await set_warehouse_context(conn, warehouse_id)
        rows = await conn.fetch(sql, *params)

    orders = [_row_to_order(r) for r in rows]

    # Post-filter by extra_key/extra_val (JSON field search)
    if extra_key and extra_val:
        ev_lower = extra_val.lower()
        filtered = []
        for o in orders:
            try:
                extra = json.loads(o.get("extra") or "{}")
                v = extra.get(extra_key, "")
                if ev_lower in str(v).lower():
                    filtered.append(o)
            except Exception:
                pass
        orders = filtered

    await cache_orders(warehouse_id, fhash, orders)
    return {"orders": orders, "cached": False}


# ── GET /orders/{order_no} — Single order ─────────────────────────────────────
@router.get("/{order_no}")
async def get_order(
    order_no: str,
    request: Request,
    user: dict = Depends(require_any),
):
    warehouse_id = user.get("warehouseId")
    pool = await get_db(request)
    async with pool.acquire() as conn:
        await set_warehouse_context(conn, warehouse_id)
        row = await conn.fetchrow(
            "SELECT * FROM orders WHERE warehouse_id = $1 AND order_no = $2",
            uuid.UUID(warehouse_id), order_no.upper()
        )
    if not row:
        raise HTTPException(404, f"Order '{order_no}' not found")

    order = _row_to_order(row)

    # Fetch events
    async with pool.acquire() as conn:
        await set_warehouse_context(conn, warehouse_id)
        events = await conn.fetch(
            "SELECT * FROM order_events WHERE order_id = $1 ORDER BY timestamp",
            row["id"]
        )
    order["events"] = [
        {
            "id": str(e["id"]), "status": e["status"],
            "actorName": e["actor_name"], "actorRole": e["actor_role"],
            "note": e["note"], "timestamp": e["timestamp"].isoformat()
        }
        for e in events
    ]
    return order


# ── PATCH /orders/{order_no}/status — Update order status ─────────────────────
@router.patch("/{order_no}/status")
async def update_status(
    order_no: str,
    body: dict,
    request: Request,
    user: dict = Depends(require_operator),
):
    new_status = body.get("status", "").upper()
    valid = {"RECEIVED","PICKING","PACKING","QUALITY_CHECK","STAGED","DISPATCHED","ON_HOLD"}
    if new_status not in valid:
        raise HTTPException(400, f"Invalid status. Valid: {valid}")

    warehouse_id = user.get("warehouseId")
    actor_name   = user.get("name", "Unknown")
    actor_role   = user.get("role", "OPERATOR")
    note         = body.get("note")

    pool = await get_db(request)
    async with pool.acquire() as conn:
        await set_warehouse_context(conn, warehouse_id)

        # Transaction: update + event in one round-trip
        async with conn.transaction():
            old = await conn.fetchrow(
                "SELECT id, status FROM orders WHERE warehouse_id = $1 AND order_no = $2",
                uuid.UUID(warehouse_id), order_no.upper()
            )
            if not old:
                raise HTTPException(404, f"Order '{order_no}' not found")

            update_data: dict = {
                "status": new_status,
                "updated_by": actor_name,
            }
            if new_status == "DISPATCHED":
                update_data["dispatched_at"] = datetime.now(timezone.utc)
                update_data["sent"] = True
            elif new_status == "PICKING":
                update_data["picked_by"] = actor_name
                update_data["picked_at"] = datetime.now(timezone.utc)
            elif new_status == "PACKING":
                update_data["packed_by"] = actor_name
                update_data["packed_at"] = datetime.now(timezone.utc)

            set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(update_data))
            vals = list(update_data.values())
            await conn.execute(
                f"UPDATE orders SET {set_clauses} WHERE id = $1",
                old["id"], *vals
            )

            # Insert event
            await conn.execute(
                """
                INSERT INTO order_events (order_id, warehouse_id, status, actor_name, actor_role, note)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                old["id"], uuid.UUID(warehouse_id), new_status,
                actor_name, actor_role, note
            )

    # Invalidate cache + broadcast WS event
    await invalidate_warehouse_cache(warehouse_id)
    await broadcast_order_update(warehouse_id, {
        "type": "STATUS_CHANGE",
        "orderNo": order_no.upper(),
        "oldStatus": old["status"],
        "newStatus": new_status,
        "actorName": actor_name,
        "note": note,
    })

    return {"success": True, "orderNo": order_no.upper(), "status": new_status}


# ── PUT /orders/{order_no} — Update order fields ──────────────────────────────
@router.put("/{order_no}")
async def update_order(
    order_no: str,
    body: dict,
    request: Request,
    user: dict = Depends(require_operator),
):
    warehouse_id = user.get("warehouseId")
    actor_name   = user.get("name", "Unknown")

    allowed_fields = {
        "invoiceNo": "invoice_no", "lrNo": "lr_no", "zone": "zone",
        "dockBay": "dock_bay", "transporter": "transporter",
        "vehicleNo": "vehicle_no", "boxCount": "box_count",
        "weightKg": "weight_kg", "notes": "notes", "skuList": "sku_list",
        "priority": "priority",
    }

    updates = {}
    for frontend_key, db_key in allowed_fields.items():
        if frontend_key in body:
            updates[db_key] = body[frontend_key]

    # Encrypted field updates
    if "customerName" in body:
        updates["customer_name_enc"] = encrypt_field(body["customerName"])

    if not updates:
        raise HTTPException(400, "No valid fields to update")

    updates["updated_by"] = actor_name

    pool = await get_db(request)
    async with pool.acquire() as conn:
        await set_warehouse_context(conn, warehouse_id)
        set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
        vals = list(updates.values())
        result = await conn.execute(
            f"UPDATE orders SET {set_clauses} WHERE warehouse_id = $1 AND order_no = $2",
            uuid.UUID(warehouse_id), order_no.upper(), *vals
        )

    if result == "UPDATE 0":
        raise HTTPException(404, f"Order '{order_no}' not found")

    await invalidate_warehouse_cache(warehouse_id)
    await broadcast_order_update(warehouse_id, {
        "type": "ORDER_UPDATE",
        "orderNo": order_no.upper(),
        "updatedFields": list(body.keys()),
        "actorName": actor_name,
    })
    return {"success": True}


# ── DELETE /orders/{order_no} (ADMIN only) ────────────────────────────────────
@router.delete("/{order_no}", status_code=204)
async def delete_order(
    order_no: str,
    request: Request,
    user: dict = Depends(require_admin),
):
    warehouse_id = user.get("warehouseId")
    pool = await get_db(request)
    async with pool.acquire() as conn:
        await set_warehouse_context(conn, warehouse_id)
        result = await conn.execute(
            "DELETE FROM orders WHERE warehouse_id = $1 AND order_no = $2",
            uuid.UUID(warehouse_id), order_no.upper()
        )
    if result == "DELETE 0":
        raise HTTPException(404, f"Order '{order_no}' not found")

    await invalidate_warehouse_cache(warehouse_id)
    await broadcast_order_update(warehouse_id, {
        "type": "ORDER_DELETED", "orderNo": order_no.upper()
    })


# ── GET /orders/analytics — Statistics ────────────────────────────────────────
@router.get("/analytics/summary")
async def analytics(request: Request, user: dict = Depends(require_any)):
    warehouse_id = user.get("warehouseId")

    cached = await get_cached_stats(warehouse_id)
    if cached:
        return cached

    pool = await get_db(request)
    async with pool.acquire() as conn:
        await set_warehouse_context(conn, warehouse_id)
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM orders WHERE warehouse_id = $1", uuid.UUID(warehouse_id)
        )
        status_rows = await conn.fetch(
            "SELECT status, COUNT(*) as cnt FROM orders WHERE warehouse_id = $1 GROUP BY status",
            uuid.UUID(warehouse_id)
        )
        priority_rows = await conn.fetch(
            "SELECT priority, COUNT(*) as cnt FROM orders WHERE warehouse_id = $1 GROUP BY priority",
            uuid.UUID(warehouse_id)
        )
        from datetime import date
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        entered_today = await conn.fetchval(
            "SELECT COUNT(*) FROM orders WHERE warehouse_id = $1 AND entered_at >= $2",
            uuid.UUID(warehouse_id), today_start
        )
        dispatched_today = await conn.fetchval(
            "SELECT COUNT(*) FROM orders WHERE warehouse_id = $1 AND status = 'DISPATCHED' AND dispatched_at >= $2",
            uuid.UUID(warehouse_id), today_start
        )
        top_transporters = await conn.fetch(
            """SELECT transporter, COUNT(*) as cnt FROM orders
               WHERE warehouse_id = $1 AND transporter IS NOT NULL
               GROUP BY transporter ORDER BY cnt DESC LIMIT 5""",
            uuid.UUID(warehouse_id)
        )

    stats = {
        "totalOrders": total,
        "statusCounts": {r["status"]: r["cnt"] for r in status_rows},
        "priorityCounts": {r["priority"]: r["cnt"] for r in priority_rows},
        "enteredToday": entered_today,
        "dispatchedToday": dispatched_today,
        "topTransporters": [{"name": r["transporter"], "count": r["cnt"]} for r in top_transporters],
    }
    await cache_stats(warehouse_id, stats)
    return stats
