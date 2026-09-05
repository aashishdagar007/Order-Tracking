module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
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
"[project]/app/api/analytics/route.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/prisma.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/auth.js [app-route] (ecmascript)");
;
;
;
async function GET(request) {
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSessionUser"])(request);
    if (!user) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: 'Unauthorized'
    }, {
        status: 401
    });
    try {
        const totalOrders = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].order.count();
        // Status counts
        const statusGroups = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].order.groupBy({
            by: [
                'status'
            ],
            _count: {
                id: true
            }
        });
        const statusCounts = {
            RECEIVED: 0,
            PICKING: 0,
            PACKING: 0,
            QUALITY_CHECK: 0,
            STAGED: 0,
            DISPATCHED: 0,
            ON_HOLD: 0
        };
        for (const g of statusGroups){
            if (g.status in statusCounts) {
                statusCounts[g.status] = g._count.id;
            }
        }
        // Priority counts
        const priorityGroups = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].order.groupBy({
            by: [
                'priority'
            ],
            _count: {
                id: true
            }
        });
        const priorityCounts = {
            STANDARD: 0,
            EXPRESS: 0,
            URGENT: 0
        };
        for (const p of priorityGroups){
            if (p.priority in priorityCounts) {
                priorityCounts[p.priority] = p._count.id;
            }
        }
        // Today's stats
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const enteredToday = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].order.count({
            where: {
                enteredAt: {
                    gte: startOfToday
                }
            }
        });
        const dispatchedToday = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].order.count({
            where: {
                status: 'DISPATCHED',
                dispatchedAt: {
                    gte: startOfToday
                }
            }
        });
        // Top Transporters
        const transporterGroups = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].order.groupBy({
            by: [
                'transporter'
            ],
            where: {
                transporter: {
                    not: null
                }
            },
            _count: {
                id: true
            },
            orderBy: {
                _count: {
                    id: 'desc'
                }
            },
            take: 5
        });
        const topTransporters = transporterGroups.map((t)=>({
                name: t.transporter || 'Unassigned',
                count: t._count.id
            }));
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            totalOrders,
            statusCounts,
            priorityCounts,
            enteredToday,
            dispatchedToday,
            topTransporters
        });
    } catch (error) {
        console.error('Analytics API Error:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Internal Server Error'
        }, {
            status: 500
        });
    }
}
}),
"[project]/lib/auth.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createSessionToken",
    ()=>createSessionToken,
    "getSessionUser",
    ()=>getSessionUser,
    "hashPassword",
    ()=>hashPassword,
    "updateWorkerHeartbeat",
    ()=>updateWorkerHeartbeat,
    "verifyPassword",
    ()=>verifyPassword
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$sign$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jose/dist/webapi/jwt/sign.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$verify$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jose/dist/webapi/jwt/verify.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/prisma.js [app-route] (ecmascript)");
;
;
;
;
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'warehouse-wms-super-secret-jwt-key-2026');
function hashPassword(password) {
    const salt = __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(16).toString('hex');
    const derivedKey = __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
}
function verifyPassword(password, storedHash) {
    if (!storedHash) return false;
    if (!storedHash.includes(':')) {
        return password === storedHash; // backward compatibility
    }
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].scryptSync(password, salt, 64);
    return __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].timingSafeEqual(keyBuffer, derivedKey);
}
async function createSessionToken(user) {
    return await new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$sign$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["SignJWT"]({
        userId: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        adminId: user.adminId || null,
        permissions: {
            canViewOrders: user.canViewOrders ?? true,
            canPickPack: user.canPickPack ?? true,
            canDispatch: user.canDispatch ?? false,
            canUpload: user.canUpload ?? false,
            canExport: user.canExport ?? false,
            canViewLogs: user.canViewLogs ?? false
        }
    }).setProtectedHeader({
        alg: 'HS256'
    }).setExpirationTime('7d').sign(secret);
}
async function getSessionUser(req = null) {
    try {
        let token = null;
        // 1. Check direct request headers if passed
        if (req && req.headers) {
            const auth = req.headers.get('authorization') || req.headers.get('x-wms-token');
            if (auth) {
                token = auth.replace(/^Bearer\s+/i, '').trim();
            }
        }
        // 2. Check next/headers if not found
        if (!token) {
            try {
                const headerStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["headers"])();
                const auth = headerStore.get('authorization') || headerStore.get('x-wms-token');
                if (auth) {
                    token = auth.replace(/^Bearer\s+/i, '').trim();
                }
            } catch (e) {}
        }
        // 3. Fallback to cookies
        if (!token) {
            try {
                const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
                token = cookieStore.get('token')?.value;
            } catch (e) {}
        }
        if (!token) return null;
        const { payload } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$verify$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["jwtVerify"])(token, secret);
        return payload;
    } catch  {
        return null;
    }
}
async function updateWorkerHeartbeat(userId, actionText = null) {
    try {
        if (!userId) return;
        const data = {
            lastSeen: new Date()
        };
        if (actionText) {
            data.lastAction = actionText;
            data.lastActionAt = new Date();
        }
        await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].user.update({
            where: {
                id: userId
            },
            data
        });
    } catch  {}
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

//# sourceMappingURL=%5Broot-of-the-server%5D__0dfc2r5._.js.map