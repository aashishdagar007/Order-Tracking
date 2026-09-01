/**
 * server.js — Custom Next.js + WebSocket Server
 *
 * Starts Next.js and attaches a WebSocket server on the SAME HTTP server.
 * WebSocket connections arrive at: ws://host/ws/{warehouseId}?token={jwt}
 *
 * Run:
 *   Development:  node server.js          (or: npm run dev)
 *   Production:   NODE_ENV=production node server.js  (or: npm start)
 *
 * WebSocket events broadcast to connected clients:
 *   STATUS_CHANGE  — order status updated
 *   ORDER_CREATED  — new order created / uploaded
 *   BULK_UPLOAD    — bulk Excel upload completed
 *   HEARTBEAT      — sent every 30s to keep connections alive
 */

import { createServer } from 'http';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import next from 'next';
import { EventEmitter } from 'events';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// ── Bootstrap Next.js ──────────────────────────────────────────────────────────
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ── In-process event bus (shared with API routes via globalThis) ───────────────
if (!globalThis.__wmsBus) {
  const bus = new EventEmitter();
  bus.setMaxListeners(500);
  globalThis.__wmsBus = bus;
}
const bus = globalThis.__wmsBus;

// ── WebSocket connection registry: warehouseId → Set<WebSocket> ────────────────
const rooms = new Map();

function getRoomClients(warehouseId) {
  if (!rooms.has(warehouseId)) rooms.set(warehouseId, new Set());
  return rooms.get(warehouseId);
}

function broadcast(warehouseId, payload) {
  const msg = JSON.stringify(payload);
  const clients = getRoomClients(warehouseId);
  const dead = [];
  for (const ws of clients) {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      } else {
        dead.push(ws);
      }
    } catch (_) {
      dead.push(ws);
    }
  }
  dead.forEach((ws) => clients.delete(ws));
}

// ── Listen on event bus and relay to WebSocket rooms ──────────────────────────
// Events emitted from API routes (lib/eventBus.js) end up here.
bus.on('order_update', (event) => {
  // Broadcast to the specific warehouse room, and to the universal 'main-warehouse' room
  const warehouseId = event.warehouseId || 'main-warehouse';
  broadcast(warehouseId, event);
  if (warehouseId !== 'main-warehouse') {
    broadcast('main-warehouse', event);
  }
});

// ── JWT validation (lightweight, no external dependency) ──────────────────────
function parseJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ── Start server ───────────────────────────────────────────────────────────────
app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // ── WebSocket server (attached to same HTTP server) ────────────────────────
  const wss = new WebSocketServer({ noServer: true });

  // Intercept HTTP upgrade requests for /ws/* paths
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true);

    if (pathname && pathname.startsWith('/ws/')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      // Not a WS path — reject upgrade
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    const { pathname, query } = parse(req.url, true);

    // Extract warehouseId from path: /ws/{warehouseId}
    const warehouseId = pathname.replace('/ws/', '').split('?')[0] || 'main-warehouse';
    const token = query.token || '';

    // Validate JWT (basic check — exp + structure)
    const payload = parseJwtPayload(token);
    const now = Math.floor(Date.now() / 1000);
    if (!payload || (payload.exp && payload.exp < now)) {
      ws.close(1008, 'Invalid or expired token');
      return;
    }

    // Join room
    const clients = getRoomClients(warehouseId);
    clients.add(ws);

    console.log(`[WS] Connected: warehouse=${warehouseId} user=${payload.username || '?'} total=${clients.size}`);

    // Send connection acknowledgement
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      warehouseId,
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      connections: clients.size,
    }));

    // ── Heartbeat every 30s ────────────────────────────────────────────────
    const heartbeat = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'HEARTBEAT', ts: Math.floor(Date.now() / 1000) }));
      } else {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // ── Handle messages from client ────────────────────────────────────────
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        }
      } catch (_) {}
    });

    // ── Cleanup on disconnect ──────────────────────────────────────────────
    ws.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(ws);
      console.log(`[WS] Disconnected: warehouse=${warehouseId} remaining=${clients.size}`);
    });

    ws.on('error', () => {
      clearInterval(heartbeat);
      clients.delete(ws);
    });
  });

  // ── Start listening ────────────────────────────────────────────────────────
  server.listen(port, hostname, () => {
    console.log('');
    console.log('=================================================================');
    console.log(`  Warehouse WMS running at http://localhost:${port}`);
    console.log(`  WebSocket endpoint: ws://localhost:${port}/ws/{warehouseId}`);
    console.log(`  Mode: ${dev ? 'development' : 'production'}`);
    console.log('=================================================================');
    console.log('');
  });

  server.on('error', (err) => {
    console.error('[Server Error]', err);
    process.exit(1);
  });
});
