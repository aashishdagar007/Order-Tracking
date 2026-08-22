const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'dev.db');
const db = new Database(dbPath);

console.log('Applying schema migrations to:', dbPath);

// Ensure Order table columns
const columnsToAdd = [
  { name: 'status', type: "TEXT NOT NULL DEFAULT 'RECEIVED'" },
  { name: 'priority', type: "TEXT NOT NULL DEFAULT 'STANDARD'" },
  { name: 'zone', type: 'TEXT' },
  { name: 'dockBay', type: 'TEXT' },
  { name: 'transporter', type: 'TEXT' },
  { name: 'vehicleNo', type: 'TEXT' },
  { name: 'boxCount', type: 'INTEGER NOT NULL DEFAULT 1' },
  { name: 'weightKg', type: 'REAL' },
  { name: 'pickedBy', type: 'TEXT' },
  { name: 'pickedAt', type: 'DATETIME' },
  { name: 'packedBy', type: 'TEXT' },
  { name: 'packedAt', type: 'DATETIME' },
  { name: 'dispatchedAt', type: 'DATETIME' },
];

const existingCols = db.prepare("PRAGMA table_info('Order')").all().map(c => c.name);

for (const col of columnsToAdd) {
  if (!existingCols.includes(col.name)) {
    console.log(`Adding column ${col.name} to Order...`);
    db.exec(`ALTER TABLE "Order" ADD COLUMN "${col.name}" ${col.type}`);
  }
}

// Ensure OrderEvent table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS "OrderEvent" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "note" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE INDEX IF NOT EXISTS "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");
`);

// Backfill existing sent=true orders to DISPATCHED status
db.exec(`
  UPDATE "Order" SET "status" = 'DISPATCHED' WHERE "sent" = 1 AND ("status" = 'RECEIVED' OR "status" IS NULL);
`);

console.log('✅ Migration applied successfully!');
db.close();
