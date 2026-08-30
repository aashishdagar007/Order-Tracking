"""
backend/routers/ws.py
WebSocket real-time event streaming for warehouse operations.

Connection URL: ws://host/ws/{warehouse_id}?token={jwt}

Message types sent to clients:
  ORDER_UPDATE    — full order object changed
  STATUS_CHANGE   — { orderId, oldStatus, newStatus, actorName }
  INVENTORY_COUNT — { sku, count }
  HEARTBEAT       — { ts } (every 30s)
  ERROR           — { detail }
"""

import asyncio
import json
import logging
from collections import defaultdict
from typing import Dict, Set

import asyncpg
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status

from backend.routers.auth import decode_token
from backend.cache.redis_client import subscribe_events, _ws_channel

router = APIRouter(tags=["websocket"])
log = logging.getLogger("wms.ws")

# ── Connection Manager ─────────────────────────────────────────────────────────
class ConnectionManager:
    """
    Tracks active WebSocket connections per warehouse.
    Thread-safe for asyncio single-event-loop environments.
    """

    def __init__(self):
        # warehouse_id → set of active WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, warehouse_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[warehouse_id].add(ws)
        log.info(f"WS connected: warehouse={warehouse_id} total={len(self._connections[warehouse_id])}")

    def disconnect(self, warehouse_id: str, ws: WebSocket):
        self._connections[warehouse_id].discard(ws)
        log.info(f"WS disconnected: warehouse={warehouse_id} total={len(self._connections[warehouse_id])}")

    async def broadcast(self, warehouse_id: str, message: dict):
        """Send a JSON message to all connected clients of a warehouse."""
        dead = set()
        payload = json.dumps(message)
        for ws in self._connections.get(warehouse_id, set()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[warehouse_id].discard(ws)

    async def send_personal(self, ws: WebSocket, message: dict):
        try:
            await ws.send_json(message)
        except Exception:
            pass

    def count(self, warehouse_id: str) -> int:
        return len(self._connections.get(warehouse_id, set()))


manager = ConnectionManager()


# ── Exported broadcast function (called by order router on status change) ──────
async def broadcast_order_update(warehouse_id: str, event: dict):
    """
    Broadcast an event to all WS clients in the warehouse.
    Also publishes to Redis so other Uvicorn workers can relay it.
    """
    from backend.cache.redis_client import publish_event
    await publish_event(warehouse_id, event)
    # Also direct-broadcast to this process's connections (Redis handles cross-process)
    await manager.broadcast(warehouse_id, event)


# ── Redis subscriber loop (one per warehouse, started on first WS connect) ─────
_subscriber_tasks: Dict[str, asyncio.Task] = {}


async def _redis_listener(warehouse_id: str, redis_url: str):
    """
    Subscribe to Redis pub/sub channel for a warehouse.
    Relay messages to all WebSocket clients in this process.
    """
    r = aioredis.from_url(redis_url, decode_responses=True)
    pubsub = r.pubsub()
    channel = _ws_channel(warehouse_id)
    await pubsub.subscribe(channel)
    log.info(f"Redis listener started for warehouse={warehouse_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    event = json.loads(message["data"])
                    await manager.broadcast(warehouse_id, event)
                except Exception as e:
                    log.warning(f"WS relay error: {e}")
    except asyncio.CancelledError:
        await pubsub.unsubscribe(channel)
        await r.aclose()
        log.info(f"Redis listener stopped for warehouse={warehouse_id}")


def _ensure_redis_listener(warehouse_id: str, redis_url: str):
    if warehouse_id not in _subscriber_tasks or _subscriber_tasks[warehouse_id].done():
        task = asyncio.create_task(_redis_listener(warehouse_id, redis_url))
        _subscriber_tasks[warehouse_id] = task


# ── WebSocket Endpoint ─────────────────────────────────────────────────────────
@router.websocket("/ws/{warehouse_id}")
async def websocket_endpoint(
    ws: WebSocket,
    warehouse_id: str,
    token: str = Query(..., description="JWT token for authentication"),
):
    """
    Authenticated WebSocket connection for real-time warehouse events.
    Connect: ws://host/ws/{warehouseId}?token={jwt}
    """
    import os
    # Validate JWT
    try:
        payload = decode_token(token)
    except Exception as e:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    # Verify warehouse access
    user_wh = payload.get("warehouseId")
    role = payload.get("role")
    # ADMIN can connect to any warehouse; others must match their assigned warehouse
    if role != "ADMIN" and user_wh != warehouse_id:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Warehouse access denied")
        return

    # Accept connection
    await manager.connect(warehouse_id, ws)

    # Start Redis listener if not already running
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    _ensure_redis_listener(warehouse_id, redis_url)

    # Send initial connection ack
    await manager.send_personal(ws, {
        "type": "CONNECTED",
        "warehouseId": warehouse_id,
        "userId": payload.get("userId"),
        "role": role,
        "connections": manager.count(warehouse_id),
    })

    # Heartbeat + message loop
    heartbeat_task = None
    try:
        async def heartbeat():
            import time
            while True:
                await asyncio.sleep(30)
                try:
                    await ws.send_json({"type": "HEARTBEAT", "ts": int(time.time())})
                except Exception:
                    break

        heartbeat_task = asyncio.create_task(heartbeat())

        # Listen for client messages (client can send status updates here)
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type")
                if msg_type == "PING":
                    await manager.send_personal(ws, {"type": "PONG"})
                # Could handle client→server messages here (e.g., scan events)
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        log.info(f"WS client disconnected: warehouse={warehouse_id}")
    except Exception as e:
        log.warning(f"WS error: {e}")
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
        manager.disconnect(warehouse_id, ws)
