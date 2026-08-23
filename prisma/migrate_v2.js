const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'dev.db');
const db = new Database(dbPath);

console.log('Ensuring all schema columns exist in SQLite database...');

const tableInfo = db.prepare('PRAGMA table_info("Order")').all();
const existingCols = new Set(tableInfo.map(c => c.name));

const colsToAdd = [
  { name: 'itemCount', type: 'INTEGER NOT NULL DEFAULT 1' },
  { name: 'skuList', type: 'TEXT' },
  { name: 'manifestId', type: 'TEXT' },
  { name: 'targetSla', type: 'DATETIME' },
];

for (const col of colsToAdd) {
  if (!existingCols.has(col.name)) {
    console.log(`Adding column "${col.name}" to Order table...`);
    db.exec(`ALTER TABLE "Order" ADD COLUMN "${col.name}" ${col.type};`);
  } else {
    console.log(`Column "${col.name}" already exists.`);
  }
}

db.close();
console.log('✅ Database migration complete!');
