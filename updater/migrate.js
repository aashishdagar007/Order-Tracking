import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROTECTED_ITEMS = new Set([
  'dev.db',
  'dev.db-wal',
  'dev.db-shm',
  '.env',
  '.env.local',
  '.env.production',
  'prisma/backups',
  'prisma/dev.db',
  'updater',
  'runtime',
  'windows',
  'keys',
  'updater.lock',
  'app.lock',
  'update_progress.json',
  'update_state.json'
]);

function renameWithRetry(src, dest, maxRetries = 5, delayMs = 400) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.renameSync(src, dest);
      return true;
    } catch (err) {
      if (i === maxRetries - 1) {
        // Fallback for files on Windows when rename is blocked by anti-virus / file-watchers
        try {
          const stat = fs.statSync(src);
          if (!stat.isDirectory()) {
            fs.copyFileSync(src, dest);
            try { fs.unlinkSync(src); } catch (_) {}
            return true;
          }
        } catch (_) {}
        throw err;
      }
      const sleepUntil = Date.now() + delayMs;
      while (Date.now() < sleepUntil) {} // synchronous sleep
    }
  }
}

/**
 * Performs atomic swap of application code directories:
 * - Preserves live SQLite databases and credentials
 * - Moves active code to _previous_version/
 * - Moves _update_staging/ code to application root
 */
export function atomicCodeSwap(appDir = process.cwd()) {
  const stagingDir = path.join(appDir, '_update_staging');
  const prevVersionDir = path.join(appDir, '_previous_version');

  if (!fs.existsSync(stagingDir)) {
    throw new Error(`Staging directory not found at: ${stagingDir}`);
  }

  // Clean previous version cache
  if (fs.existsSync(prevVersionDir)) {
    fs.rmSync(prevVersionDir, { recursive: true, force: true });
  }
  fs.mkdirSync(prevVersionDir, { recursive: true });

  const stagedItems = fs.readdirSync(stagingDir);
  const movedItems = [];

  console.log('[Swap] Staging active code to _previous_version/ ...');
  try {
    for (const item of stagedItems) {
      // Never swap protected items like dev.db
      if (PROTECTED_ITEMS.has(item)) {
        continue;
      }

      const currentPath = path.join(appDir, item);
      const backupPath = path.join(prevVersionDir, item);
      const newStagedPath = path.join(stagingDir, item);

      // Special handling for prisma directory: preserve prisma/backups/ and any SQLite databases
      if (item === 'prisma') {
        fs.mkdirSync(currentPath, { recursive: true });
        fs.mkdirSync(backupPath, { recursive: true });

        const prismaStagedItems = fs.readdirSync(newStagedPath);
        for (const pItem of prismaStagedItems) {
          if (pItem === 'backups' || pItem === 'dev.db' || pItem === 'dev.db-wal' || pItem === 'dev.db-shm') {
            continue;
          }
          const pCurrent = path.join(currentPath, pItem);
          const pBackup = path.join(backupPath, pItem);
          const pStaged = path.join(newStagedPath, pItem);

          if (fs.existsSync(pCurrent)) {
            renameWithRetry(pCurrent, pBackup);
          }
          renameWithRetry(pStaged, pCurrent);
          console.log(`[Swap] Swapped prisma/${pItem}`);
        }
        movedItems.push({ type: 'prisma', items: prismaStagedItems });
        continue;
      }

      // If current item exists, move it to _previous_version
      if (fs.existsSync(currentPath)) {
        renameWithRetry(currentPath, backupPath);
        movedItems.push(item);
      }

      // Move new item from staging to currentPath
      renameWithRetry(newStagedPath, currentPath);
      console.log(`[Swap] Swapped ${item}`);
    }

    console.log('[Swap] Atomic code swap completed successfully.');
    return { success: true, prevVersionDir, movedItems };
  } catch (err) {
    console.error('[Swap] Error during swap. Rolling back swapped items...', err.message);
    // Roll back moved items
    for (const item of movedItems) {
      try {
        if (typeof item === 'object' && item.type === 'prisma') {
          const pCurrentDir = path.join(appDir, 'prisma');
          const pBackupDir = path.join(prevVersionDir, 'prisma');
          for (const pItem of item.items) {
            const pCurrent = path.join(pCurrentDir, pItem);
            const pBackup = path.join(pBackupDir, pItem);
            if (fs.existsSync(pBackup)) {
              renameWithRetry(pBackup, pCurrent);
            }
          }
        } else {
          const currentPath = path.join(appDir, item);
          const backupPath = path.join(prevVersionDir, item);
          if (fs.existsSync(backupPath)) {
            renameWithRetry(backupPath, currentPath);
          }
        }
      } catch (rollbackErr) {
        console.error(`[Swap] Failed to revert item:`, rollbackErr.message);
      }
    }
    throw new Error(`Atomic swap failed: ${err.message}`);
  }
}

/**
 * Executes prisma migrate deploy if requiresMigration is true
 */
export function applyMigrations(appDir = process.cwd()) {
  console.log('[Migrate] Applying Prisma database migrations via "npx prisma migrate deploy"...');
  try {
    // Check if node/npx is in runtime or path
    const runtimeNode = path.join(appDir, 'runtime', 'node.exe');
    const hasRuntime = fs.existsSync(runtimeNode);

    const cmd = 'npx prisma migrate deploy';
    console.log(`[Migrate] Running: ${cmd}`);

    const output = execSync(cmd, {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SQLITE_DB_URL: `file:${path.join(appDir, 'dev.db')}`,
        DATABASE_URL: `file:${path.join(appDir, 'dev.db')}`,
        PATH: hasRuntime ? `${path.join(appDir, 'runtime')};${process.env.PATH}` : process.env.PATH
      }
    }).toString();

    console.log('[Migrate] Migration output:\n', output);
    return { success: true, output };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error('[Migrate] Migration failed:\n', stderr);
    throw new Error(`Prisma migration failed: ${stderr}`);
  }
}
