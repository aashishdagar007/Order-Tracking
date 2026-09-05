module.exports = [
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[project]/app/api/health/route.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/prisma.js [app-route] (ecmascript)");
;
;
const dynamic = 'force-dynamic';
async function GET() {
    const start = performance.now();
    try {
        // 1. Measure database latency & query health
        const orderCount = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].order.count();
        const dbLatencyMs = Math.round((performance.now() - start) * 100) / 100;
        // 2. Process & Memory Telemetry
        const mem = process.memoryUsage();
        const memory = {
            heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
            heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
            rssMb: Math.round(mem.rss / 1024 / 1024 * 10) / 10
        };
        // 3. WebSocket stats (from globalThis registered in server.js)
        const wsStats = globalThis.__wmsStats ? {
            connectedClients: globalThis.__wmsStats.getClientCount ? globalThis.__wmsStats.getClientCount() : 0,
            activeRooms: globalThis.__wmsStats.rooms ? globalThis.__wmsStats.rooms.size : 0
        } : null;
        const responsePayload = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            database: {
                status: 'connected',
                engine: 'SQLite (WAL Mode)',
                latencyMs: dbLatencyMs,
                totalOrders: orderCount
            },
            system: {
                nodeVersion: process.version,
                environment: ("TURBOPACK compile-time value", "development") || 'development',
                memory
            },
            websocket: wsStats
        };
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(responsePayload, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
        });
    } catch (error) {
        console.error('[Health Check Failed]', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            uptimeSeconds: Math.floor(process.uptime())
        }, {
            status: 503,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
        });
    }
}
}),
"[project]/lib/prisma.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "prisma",
    ()=>prisma
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$prisma$2f$adapter$2d$better$2d$sqlite3$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@prisma/adapter-better-sqlite3/dist/index.mjs [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$better$2d$sqlite3__$5b$external$5d$__$28$better$2d$sqlite3$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f$better$2d$sqlite3$29$__ = __turbopack_context__.i("[externals]/better-sqlite3 [external] (better-sqlite3, cjs, [project]/node_modules/better-sqlite3)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
;
;
;
;
;
const globalForPrisma = globalThis;
function ensureSchema(dbPath) {
    try {
        const dir = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].dirname(dbPath);
        if (!__TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].existsSync(dir)) {
            __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["default"].mkdirSync(dir, {
                recursive: true
            });
        }
        const db = new __TURBOPACK__imported__module__$5b$externals$5d2f$better$2d$sqlite3__$5b$external$5d$__$28$better$2d$sqlite3$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f$better$2d$sqlite3$29$__["default"](dbPath);
        // Industrial SQLite Pragmas for High-Concurrency Performance
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('busy_timeout = 5000');
        db.pragma('cache_size = -64000'); // 64MB memory page cache
        db.pragma('temp_store = MEMORY');
        db.pragma('foreign_keys = ON');
        db.exec(`
      CREATE TABLE IF NOT EXISTS "Config" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "key" TEXT NOT NULL UNIQUE,
          "value" TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "username" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "passwordHash" TEXT NOT NULL,
          "role" TEXT NOT NULL DEFAULT 'WORKER',
          "adminId" TEXT,
          "canViewOrders" BOOLEAN NOT NULL DEFAULT 1,
          "canPickPack" BOOLEAN NOT NULL DEFAULT 1,
          "canDispatch" BOOLEAN NOT NULL DEFAULT 0,
          "canUpload" BOOLEAN NOT NULL DEFAULT 0,
          "canExport" BOOLEAN NOT NULL DEFAULT 0,
          "canViewLogs" BOOLEAN NOT NULL DEFAULT 0,
          "isActive" BOOLEAN NOT NULL DEFAULT 1,
          "lastSeen" DATETIME,
          "lastAction" TEXT,
          "lastActionAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "Order" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderNo" TEXT NOT NULL UNIQUE,
          "invoiceNo" TEXT,
          "lrNo" TEXT,
          "sent" BOOLEAN NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'RECEIVED',
          "priority" TEXT NOT NULL DEFAULT 'STANDARD',
          "zone" TEXT,
          "dockBay" TEXT,
          "transporter" TEXT,
          "vehicleNo" TEXT,
          "boxCount" INTEGER NOT NULL DEFAULT 1,
          "itemCount" INTEGER NOT NULL DEFAULT 1,
          "skuList" TEXT,
          "manifestId" TEXT,
          "targetSla" DATETIME,
          "weightKg" REAL,
          "notes" TEXT,
          "extra" TEXT,
          "enteredBy" TEXT,
          "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "pickedBy" TEXT,
          "pickedAt" DATETIME,
          "packedBy" TEXT,
          "packedAt" DATETIME,
          "dispatchedAt" DATETIME,
          "updatedBy" TEXT,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "OrderEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderId" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "actorName" TEXT NOT NULL,
          "actorRole" TEXT NOT NULL,
          "note" TEXT,
          "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "Log" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "userId" TEXT,
          "name" TEXT NOT NULL,
          "role" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "detail" TEXT,
          FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );

      -- High-Performance Industrial Database Indexes
      CREATE INDEX IF NOT EXISTS "idx_order_status" ON "Order"("status");
      CREATE INDEX IF NOT EXISTS "idx_order_updatedAt" ON "Order"("updatedAt");
      CREATE INDEX IF NOT EXISTS "idx_order_priority" ON "Order"("priority");
      CREATE INDEX IF NOT EXISTS "idx_order_invoiceNo" ON "Order"("invoiceNo");
      CREATE INDEX IF NOT EXISTS "idx_order_lrNo" ON "Order"("lrNo");
      CREATE INDEX IF NOT EXISTS "idx_order_transporter" ON "Order"("transporter");
      CREATE INDEX IF NOT EXISTS "idx_order_zone" ON "Order"("zone");
      CREATE INDEX IF NOT EXISTS "idx_orderevent_orderId" ON "OrderEvent"("orderId");
      CREATE INDEX IF NOT EXISTS "idx_orderevent_timestamp" ON "OrderEvent"("timestamp");
      CREATE INDEX IF NOT EXISTS "idx_log_timestamp" ON "Log"("timestamp");
      CREATE INDEX IF NOT EXISTS "idx_log_userId" ON "Log"("userId");
    `);
        db.close();
    } catch (err) {
        console.error('Error auto-initializing SQLite tables and pragmas:', err);
    }
}
function createClient() {
    const dbPath = process.env.SQLITE_DB_PATH || __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["default"].join(process.cwd(), 'dev.db');
    ensureSchema(dbPath);
    const adapter = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$prisma$2f$adapter$2d$better$2d$sqlite3$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PrismaBetterSqlite3"]({
        url: `file:${dbPath}`
    });
    return new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]({
        adapter
    });
}
const prisma = globalForPrisma.prismaClient ?? createClient();
if ("TURBOPACK compile-time truthy", 1) {
    globalForPrisma.prismaClient = prisma;
}
const __TURBOPACK__default__export__ = prisma;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__14eu799._.js.map