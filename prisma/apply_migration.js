const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'dev.db');
const db = new Database(dbPath);
const migSql = fs.readFileSync(path.join(__dirname, 'migrations', '20260813073732_init', 'migration.sql'), 'utf8');
db.exec(migSql);
db.close();
console.log('Tables created successfully!');
