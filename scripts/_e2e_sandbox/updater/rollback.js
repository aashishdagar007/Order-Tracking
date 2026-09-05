import fs from 'fs';
import path from 'path';
import { stopApplication } from './process.js';
import { relaunchAndVerifyHealth } from './health.js';
import { releaseLock } from './lock.js';

function renameWithRetry(src, dest, maxRetries = 4, delayMs = 400) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.renameSync(src, dest);
      return true;
    } catch (err) {
      if (i === maxRetries - 1) {
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
      while (Date.now() < sleepUntil) {}
    }
  }
}

/**
 * Atomic rollback: restores previous application code AND matching database backup together.
 */
export async function performRollback(appDir = process.cwd(), backupDir = null) {
  console.log('====================================================');
  console.log('🔄 INITIATING ATOMIC ROLLBACK SEQUENCE');
  console.log('====================================================');

  // 1. Ensure any running app process is stopped
  try {
    await stopApplication(appDir, 4000);
  } catch (e) {
    console.warn('[Rollback] Stop application warning:', e.message);
  }

  // 2. Rollback code files from _previous_version/
  const prevVersionDir = path.join(appDir, '_previous_version');
  if (fs.existsSync(prevVersionDir)) {
    console.log('[Rollback] Reverting code directories from _previous_version/...');
    const items = fs.readdirSync(prevVersionDir);
    for (const item of items) {
      const backupPath = path.join(prevVersionDir, item);
      const appPath = path.join(appDir, item);
      try {
        if (item === 'prisma' && fs.existsSync(backupPath) && fs.statSync(backupPath).isDirectory()) {
          fs.mkdirSync(appPath, { recursive: true });
          const subItems = fs.readdirSync(backupPath);
          for (const subItem of subItems) {
            if (subItem === 'backups' || subItem === 'dev.db') continue;
            renameWithRetry(path.join(backupPath, subItem), path.join(appPath, subItem));
            console.log(`[Rollback] Restored prisma/${subItem}`);
          }
        } else {
          renameWithRetry(backupPath, appPath);
          console.log(`[Rollback] Restored ${item}`);
        }
      } catch (err) {
        console.error(`[Rollback] Failed restoring ${item}:`, err.message);
      }
    }
    try { fs.rmSync(prevVersionDir, { recursive: true, force: true }); } catch (_) {}
  } else {
    console.warn('[Rollback] No _previous_version/ found to revert files from.');
  }

  // 3. Rollback SQLite database files from backupDir
  if (backupDir && fs.existsSync(backupDir)) {
    console.log(`[Rollback] Restoring SQLite database from: ${backupDir}`);
    const backupDb = path.join(backupDir, 'dev.db');
    const destDb = path.join(appDir, 'dev.db');

    if (fs.existsSync(backupDb)) {
      // Remove any lingering wal/shm
      try { if (fs.existsSync(`${destDb}-wal`)) fs.unlinkSync(`${destDb}-wal`); } catch (_) {}
      try { if (fs.existsSync(`${destDb}-shm`)) fs.unlinkSync(`${destDb}-shm`); } catch (_) {}

      fs.copyFileSync(backupDb, destDb);
      console.log('[Rollback] Successfully restored dev.db');

      const backupWal = path.join(backupDir, 'dev.db-wal');
      if (fs.existsSync(backupWal)) {
        fs.copyFileSync(backupWal, `${destDb}-wal`);
      }

      const backupShm = path.join(backupDir, 'dev.db-shm');
      if (fs.existsSync(backupShm)) {
        fs.copyFileSync(backupShm, `${destDb}-shm`);
      }
    }
  }

  // 4. Clean up staging
  const stagingDir = path.join(appDir, '_update_staging');
  try {
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  } catch (_) {}

  // 5. Clean up update state journal
  const statePath = path.join(appDir, 'update_state.json');
  try { if (fs.existsSync(statePath)) fs.unlinkSync(statePath); } catch (_) {}

  // 6. Relaunch previous version and verify
  try {
    console.log('[Rollback] Relaunching restored version to verify operational readiness...');
    await relaunchAndVerifyHealth(appDir, 30);
    console.log('[Rollback] Restored version is healthy and operational.');
  } catch (err) {
    console.error('[Rollback] Warning: Application health check after rollback timed out:', err.message);
  }

  releaseLock(appDir, true);
  return { success: true };
}
