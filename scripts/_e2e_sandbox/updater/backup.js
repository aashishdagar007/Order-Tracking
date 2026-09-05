import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';

function computeFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function backupDatabase(appDir = process.cwd()) {
  const dbPath = process.env.SQLITE_DB_PATH || path.join(appDir, 'dev.db');

  if (!fs.existsSync(dbPath)) {
    console.warn('[Backup] No dev.db found at:', dbPath);
    return { success: true, skipped: true, reason: 'No database file existed yet' };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupsBaseDir = path.join(appDir, 'prisma', 'backups');
  const backupDir = path.join(backupsBaseDir, `dev.db.backup_${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  let rowCounts = {};
  let integrityOk = false;

  console.log('[Backup] Connecting to SQLite to execute WAL checkpoint...');
  try {
    const db = new Database(dbPath, { readonly: false, timeout: 5000 });
    
    // Commit all WAL frames to main database and truncate WAL
    const checkpointResult = db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('[Backup] WAL checkpoint result:', checkpointResult);

    // Verify integrity before backup
    const integrity = db.pragma('integrity_check');
    integrityOk = integrity && integrity[0] && integrity[0].integrity_check === 'ok';
    if (!integrityOk) {
      console.warn('[Backup] Database integrity warning:', integrity);
    }

    // Query row counts for verification
    try {
      rowCounts.Order = db.prepare('SELECT COUNT(*) as c FROM "Order"').get()?.c ?? 0;
    } catch (_) {}
    try {
      rowCounts.User = db.prepare('SELECT COUNT(*) as c FROM "User"').get()?.c ?? 0;
    } catch (_) {}
    try {
      rowCounts.Log = db.prepare('SELECT COUNT(*) as c FROM "Log"').get()?.c ?? 0;
    } catch (_) {}
    try {
      rowCounts.OrderEvent = db.prepare('SELECT COUNT(*) as c FROM "OrderEvent"').get()?.c ?? 0;
    } catch (_) {}

    db.close();
  } catch (err) {
    console.error('[Backup] SQLite checkpoint error:', err.message);
    throw new Error(`Failed to checkpoint SQLite WAL: ${err.message}`);
  }

  // Copy dev.db, dev.db-wal, dev.db-shm
  const destDb = path.join(backupDir, 'dev.db');
  fs.copyFileSync(dbPath, destDb);

  const walPath = `${dbPath}-wal`;
  const destWal = path.join(backupDir, 'dev.db-wal');
  if (fs.existsSync(walPath)) {
    fs.copyFileSync(walPath, destWal);
  }

  const shmPath = `${dbPath}-shm`;
  const destShm = path.join(backupDir, 'dev.db-shm');
  if (fs.existsSync(shmPath)) {
    fs.copyFileSync(shmPath, destShm);
  }

  const dbSize = fs.statSync(destDb).size;
  const checksum = computeFileSha256(destDb);

  const meta = {
    timestamp: new Date().toISOString(),
    originalDbPath: dbPath,
    rowCounts,
    fileSizes: {
      devDb: dbSize,
      wal: fs.existsSync(destWal) ? fs.statSync(destWal).size : 0,
      shm: fs.existsSync(destShm) ? fs.statSync(destShm).size : 0
    },
    sha256: checksum,
    integrityOk
  };

  const metaPath = path.join(backupDir, 'backup_meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  console.log(`[Backup] SQLite backup created successfully at: ${backupDir}`);
  console.log(`[Backup] Verified ${rowCounts.Order ?? 0} Orders, ${rowCounts.User ?? 0} Users, ${rowCounts.Log ?? 0} Logs`);

  return {
    success: true,
    backupDir,
    meta
  };
}
