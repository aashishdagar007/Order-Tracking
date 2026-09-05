import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';

import Database from 'better-sqlite3';
import fs from 'fs';

const globalForPrisma = globalThis;

function ensureSchema(dbPath) {
  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const db = new Database(dbPath);
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
  const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'dev.db');
  ensureSchema(dbPath);
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prismaClient ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaClient = prisma;
}

export default prisma;