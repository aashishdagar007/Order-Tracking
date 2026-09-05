import fs from 'fs';
import path from 'path';

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

export function getLockFilePath(appDir = process.cwd()) {
  return path.join(appDir, 'updater.lock');
}

export function isLocked(appDir = process.cwd()) {
  const lockPath = getLockFilePath(appDir);
  if (!fs.existsSync(lockPath)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (data.pid && isProcessAlive(data.pid)) {
      return true;
    }
    // Stale lock
    return false;
  } catch (_) {
    return false;
  }
}

export function acquireLock(appDir = process.cwd(), operation = 'UPDATE') {
  const lockPath = getLockFilePath(appDir);

  if (fs.existsSync(lockPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (existing.pid && isProcessAlive(existing.pid)) {
        return {
          acquired: false,
          error: `Concurrent update already in progress (PID: ${existing.pid}, startedAt: ${existing.startedAt})`,
          lockData: existing
        };
      }
      console.warn(`[Updater Lock] Stale lock detected from inactive PID ${existing.pid}. Reclaiming lock.`);
      fs.unlinkSync(lockPath);
    } catch (_) {
      try { fs.unlinkSync(lockPath); } catch (e) {}
    }
  }

  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    operation
  };

  try {
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
    return { acquired: true, lockData };
  } catch (err) {
    return {
      acquired: false,
      error: `Failed to acquire updater lock: ${err.message}`
    };
  }
}

export function releaseLock(appDir = process.cwd(), force = false) {
  const lockPath = getLockFilePath(appDir);
  if (!fs.existsSync(lockPath)) return true;

  try {
    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (force || data.pid === process.pid) {
      fs.unlinkSync(lockPath);
      console.log('[Updater Lock] Released updater.lock');
      return true;
    }
    return false;
  } catch (e) {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (_) {
      return false;
    }
  }
}
