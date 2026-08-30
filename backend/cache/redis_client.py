"""
backend/cache/redis_client.py
Redis client — caching, inventory counters, WebSocket pub/sub.
"""

import os
import json
import hashlib
from typing import Optional, Any
import redis.asyncio as aioredis

# ── Connection ─────────────────────────────────────────────────────────────────
_REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

_pool: Optional[aioredis.ConnectionPool] = None


def get_pool() -> aioredis.ConnectionPool:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            _REDIS_URL,
            decode_responses=True,
            max_connections=20,
        )
    return _pool


def get_redis() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=get_pool())


# ── Key Helpers ────────────────────────────────────────────────────────────────

def _orders_key(warehouse_id: str, filter_hash: str) -> str:
    return f"wh:{warehouse_id}:orders:{filter_hash}"

def _inventory_key(warehouse_id: str, sku: str) -> str:
    return f"wh:{warehouse_id}:inv:{sku}"

def _ws_channel(warehouse_id: str) -> str:
    return f"wh:{warehouse_id}:events"

def _stats_key(warehouse_id: str) -> str:
    return f"wh:{warehouse_id}:stats"


def make_filter_hash(params: dict) -> str:
    """Create a short hash from filter params dict for cache key."""
    raw = json.dumps(params, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()[:12]


# ── Order List Cache ───────────────────────────────────────────────────────────
ORDER_CACHE_TTL = 30   # seconds

async def cache_orders(warehouse_id: str, filter_hash: str,
                        data: list, ttl: int = ORDER_CACHE_TTL) -> None:
    """Cache a serialized list of orders for a warehouse+filter combination."""
    r = get_redis()
    key = _orders_key(warehouse_id, filter_hash)
    await r.setex(key, ttl, json.dumps(data))


async def get_cached_orders(warehouse_id: str,
                             filter_hash: str) -> Optional[list]:
    """Return cached orders list, or None if cache miss."""
    r = get_redis()
    raw = await r.get(_orders_key(warehouse_id, filter_hash))
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def invalidate_warehouse_cache(warehouse_id: str) -> None:
    """Delete all cached order results for a warehouse. Called on every write."""
    r = get_redis()
    pattern = f"wh:{warehouse_id}:orders:*"
    cursor = 0
    while True:
        cursor, keys = await r.scan(cursor, match=pattern, count=100)
        if keys:
            await r.delete(*keys)
        if cursor == 0:
            break


# ── Inventory Counters (atomic, in-memory live counters) ──────────────────────

async def set_inventory_counter(warehouse_id: str, sku: str,
                                 count: int) -> None:
    """Initialize/reset an inventory counter."""
    r = get_redis()
    await r.set(_inventory_key(warehouse_id, sku), count)


async def increment_inventory(warehouse_id: str, sku: str,
                               delta: int = 1) -> int:
    """Atomically increment inventory counter. Returns new value."""
    r = get_redis()
    return int(await r.incrby(_inventory_key(warehouse_id, sku), delta))


async def decrement_inventory(warehouse_id: str, sku: str,
                               delta: int = 1) -> int:
    """Atomically decrement inventory counter. Returns new value."""
    r = get_redis()
    return int(await r.decrby(_inventory_key(warehouse_id, sku), delta))


async def get_inventory_counters(warehouse_id: str) -> dict:
    """Get all inventory counters for a warehouse."""
    r = get_redis()
    pattern = f"wh:{warehouse_id}:inv:*"
    prefix_len = len(f"wh:{warehouse_id}:inv:")
    result = {}
    cursor = 0
    while True:
        cursor, keys = await r.scan(cursor, match=pattern, count=100)
        if keys:
            values = await r.mget(*keys)
            for key, val in zip(keys, values):
                sku = key[prefix_len:]
                result[sku] = int(val) if val is not None else 0
        if cursor == 0:
            break
    return result


# ── Analytics / Stats Cache ───────────────────────────────────────────────────
STATS_TTL = 60  # seconds

async def cache_stats(warehouse_id: str, stats: dict) -> None:
    r = get_redis()
    await r.setex(_stats_key(warehouse_id), STATS_TTL, json.dumps(stats))


async def get_cached_stats(warehouse_id: str) -> Optional[dict]:
    r = get_redis()
    raw = await r.get(_stats_key(warehouse_id))
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


# ── WebSocket Pub/Sub ─────────────────────────────────────────────────────────

async def publish_event(warehouse_id: str, event: dict) -> None:
    """
    Publish a real-time event to all WebSocket clients in a warehouse.
    The WS router subscribes to this channel and broadcasts to connected clients.
    """
    r = get_redis()
    await r.publish(_ws_channel(warehouse_id), json.dumps(event))


async def subscribe_events(warehouse_id: str) -> aioredis.client.PubSub:
    """Create a pubsub subscriber for a warehouse's event channel."""
    r = get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(_ws_channel(warehouse_id))
    return pubsub


# ── Health check ──────────────────────────────────────────────────────────────
async def ping() -> bool:
    """Return True if Redis is reachable."""
    try:
        r = get_redis()
        return await r.ping()
    except Exception:
        return False
