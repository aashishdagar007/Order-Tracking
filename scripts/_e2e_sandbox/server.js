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
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import net from 'net';

if (process.argv.includes('--production')) {
  process.env.NODE_ENV = 'production';
}
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// ── Application Process Identity & Lock File Management ──────────────────────
const APP_LOCK_PATH = path.join(process.cwd(), 'app.lock');
const shutdownToken = crypto.randomBytes(32).toString('hex');

function writeAppLock(listenPort) {
  try {
    const lockData = {
      pid: process.pid,
      port: listenPort,
      startedAt: new Date().toISOString(),
      execPath: process.execPath,
      shutdownToken
    };
    fs.writeFileSync(APP_LOCK_PATH, JSON.stringify(lockData, null, 2), 'utf8');
    console.log(`[Process] Lock written: PID=${process.pid} Port=${listenPort}`);
  } catch (err) {
    console.error('[Process] Failed to write app.lock:', err);
  }
}

function removeAppLock() {
  try {
    if (fs.existsSync(APP_LOCK_PATH)) {
      const existing = JSON.parse(fs.readFileSync(APP_LOCK_PATH, 'utf8'));
      if (existing.pid === process.pid) {
        fs.unlinkSync(APP_LOCK_PATH);
        console.log('[Process] Cleaned up app.lock');
      }
    }
  } catch (_) {}
}

// ── Bootstrap Next.js (use stable Webpack in dev mode to prevent chunk path errors) ──
const app = next({ dev, hostname, port, turbopack: false });
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

globalThis.__wmsStats = {
  rooms,
  getClientCount: () => {
    let total = 0;
    for (const clients of rooms.values()) {
      total += clients.size;
    }
    return total;
  }
};

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

function findAvailablePort(startPort, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err) => {
      resolve(findAvailablePort(startPort + 1, host));
    });
    tester.once('listening', () => {
      tester.close(() => resolve(startPort));
    });
    tester.listen(startPort, host);
  });
}

// ── Start server ───────────────────────────────────────────────────────────────
app.prepare().then(async () => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);

    // ── Graceful Shutdown Loopback Hook (Authenticated for Updater) ──
    if (req.method === 'POST' && parsedUrl.pathname === '/internal/shutdown') {
      const remote = req.socket.remoteAddress || '';
      const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1' || remote === 'localhost';
      const reqToken = req.headers['x-shutdown-token'];

      if (!isLoopback || !reqToken || reqToken !== shutdownToken) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Unauthorized shutdown request' }));
        return;
      }

      console.log('[Server] Authorized internal shutdown request received.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Shutting down gracefully' }));
      setTimeout(() => gracefulShutdown('INTERNAL_HOOK'), 200).unref();
      return;
    }

    handle(req, res, parsedUrl);
  });

  // ── WebSocket server (attached to same HTTP server) ────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  const upgradeHandler = app.getUpgradeHandler ? app.getUpgradeHandler() : null;

  // Intercept HTTP upgrade requests: /ws/* for WMS events, rest for Next.js HMR
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true);

    if (pathname && pathname.startsWith('/ws/')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (upgradeHandler) {
      upgradeHandler(req, socket, head);
    } else {
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

  // ── Start listening on first available verified port ──────────────────────
  const finalPort = await findAvailablePort(port, hostname);
  server.listen(finalPort, hostname, () => {
    writeAppLock(finalPort);
    console.log('');
    console.log('=================================================================');
    console.log(`  Warehouse WMS running at http://localhost:${finalPort}`);
    console.log(`  WebSocket endpoint: ws://localhost:${finalPort}/ws/{warehouseId}`);
    console.log(`  Mode: ${dev ? 'development' : 'production'}`);
    console.log('=================================================================');
    console.log('');
  });

  server.on('error', (err) => {
    console.error('[Server Error]', err);
    removeAppLock();
    process.exit(1);
  });

  // ── Graceful Shutdown (Industrial Process Management) ──────────────────────
  const gracefulShutdown = (signal) => {
    console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
    removeAppLock();

    // Close WebSocket connections
    for (const [warehouseId, clients] of rooms.entries()) {
      for (const ws of clients) {
        try {
          ws.close(1001, 'Server shutting down gracefully');
        } catch (_) {}
      }
      clients.clear();
    }
    // Drain HTTP server
    server.close(() => {
      console.log('[Server] HTTP and WebSocket connections successfully closed.');
      process.exit(0);
    });
    // Force terminate after 5 seconds if lingering connections exist
    setTimeout(() => {
      console.error('[Server] Forcing shutdown after timeout.');
      removeAppLock();
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('exit', () => removeAppLock());
});
