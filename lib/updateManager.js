import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { isLocked } from '../updater/lock.js';

export function getAppDir() {
  return process.cwd();
}

export function getUpdateStatus(appDir = process.cwd()) {
  const progressFile = path.join(appDir, 'update_progress.json');
  const locked = isLocked(appDir);

  let progress = { step: 'IDLE', progress: 0, message: 'System up to date' };
  if (fs.existsSync(progressFile)) {
    try {
      progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    } catch (_) {}
  }

  return {
    locked,
    progress
  };
}

export function getBackupHistory(appDir = process.cwd()) {
  const backupsDir = path.join(appDir, 'prisma', 'backups');
  if (!fs.existsSync(backupsDir)) return [];

  const entries = fs.readdirSync(backupsDir);
  const backups = [];

  for (const entry of entries) {
    const metaPath = path.join(backupsDir, entry, 'backup_meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        backups.push({
          dirName: entry,
          ...meta
        });
      } catch (_) {}
    }
  }

  // Sort descending by timestamp
  return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Spawns the decoupled external updater as a detached child process
 * that survives parent Next.js server shutdown.
 */
export function triggerUpdate(packagePath, appDir = process.cwd()) {
  if (isLocked(appDir)) {
    throw new Error('An update or maintenance task is already active (locked).');
  }

  const cliPath = path.join(appDir, 'updater', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    throw new Error(`Updater CLI not found at: ${cliPath}`);
  }

  const runtimeNode = path.join(appDir, 'runtime', 'node.exe');
  const nodeBin = fs.existsSync(runtimeNode) ? runtimeNode : process.execPath;

  console.log(`[UpdateManager] Spawning detached updater process: ${nodeBin} ${cliPath}`);

  const child = spawn(nodeBin, [cliPath, `--package=${packagePath}`, `--app-dir=${appDir}`], {
    cwd: appDir,
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  // Start a local watcher on update_progress.json to stream events over event bus
  const progressFile = path.join(appDir, 'update_progress.json');
  let lastStep = '';

  const watcherInterval = setInterval(() => {
    if (fs.existsSync(progressFile)) {
      try {
        const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        if (progress.step !== lastStep) {
          lastStep = progress.step;
          globalThis.__wmsBus?.emit('order_update', {
            type: 'SYSTEM_UPDATE_PROGRESS',
            ...progress
          });

          if (progress.step === 'COMPLETE' || progress.step === 'ROLLED_BACK' || progress.step === 'ERROR') {
            clearInterval(watcherInterval);
          }
        }
      } catch (_) {}
    }
  }, 500);

  setTimeout(() => clearInterval(watcherInterval), 180000).unref();

  return { success: true, pid: child.pid };
}
