const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'dev.db');
const db = new Database(dbPath);

console.log('Running user management migration on:', dbPath);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

// 1. Create User table
db.exec(`
  CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY NOT NULL,
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
`);

// Add userId to Log if not exists
const logColumns = db.prepare(`PRAGMA table_info(Log)`).all();
const logColNames = logColumns.map(c => c.name);

if (!logColNames.includes('userId')) {
  db.exec(`ALTER TABLE "Log" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL;`);
  console.log('  Added "userId" column to "Log" table');
}

// Seed default Admin & Worker if User table is empty
const userCount = db.prepare(`SELECT COUNT(*) as count FROM "User"`).get().count;
if (userCount === 0) {
  const adminId = 'admin_default_01';
  const adminHash = hashPassword('admin123');
  db.prepare(`
    INSERT INTO "User" (id, username, name, passwordHash, role, canViewOrders, canPickPack, canDispatch, canUpload, canExport, canViewLogs, isActive)
    VALUES (?, ?, ?, ?, 'ADMIN', 1, 1, 1, 1, 1, 1, 1)
  `).run(adminId, 'admin', 'Master Admin', adminHash);

  const worker1Hash = hashPassword('worker123');
  db.prepare(`
    INSERT INTO "User" (id, username, name, passwordHash, role, adminId, canViewOrders, canPickPack, canDispatch, canUpload, canExport, canViewLogs, isActive, lastAction, lastActionAt)
    VALUES (?, ?, ?, ?, 'WORKER', ?, 1, 1, 1, 0, 0, 0, 1, 'Station initialized', CURRENT_TIMESTAMP)
  `).run('worker_01', 'worker1', 'John Picker (Aisle A)', worker1Hash, adminId);

  const worker2Hash = hashPassword('worker123');
  db.prepare(`
    INSERT INTO "User" (id, username, name, passwordHash, role, adminId, canViewOrders, canPickPack, canDispatch, canUpload, canExport, canViewLogs, isActive, lastAction, lastActionAt)
    VALUES (?, ?, ?, ?, 'WORKER', ?, 1, 1, 0, 0, 0, 0, 1, 'Inspecting Order ORD-1006', CURRENT_TIMESTAMP)
  `).run('worker_02', 'worker2', 'Sarah Packer (Station 2)', worker2Hash, adminId);

  console.log('✅ Seeded default Admin and 2 managed Worker accounts with permissions');
}

console.log('Migration complete!');
