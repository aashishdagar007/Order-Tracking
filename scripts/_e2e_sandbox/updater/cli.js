#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { acquireLock, releaseLock } from './lock.js';
import { verifyPackage } from './verify.js';
import { stopApplication } from './process.js';
import { backupDatabase } from './backup.js';
import { extractPayload } from './extract.js';
import { atomicCodeSwap, applyMigrations } from './migrate.js';
import { relaunchAndVerifyHealth } from './health.js';
import { performRollback } from './rollback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI Arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  for (const arg of args) {
    if (arg.startsWith(`${flag}=`)) {
      return arg.split('=')[1].replace(/^["']|["']$/g, '');
    }
  }
  return defaultValue;
}

const packagePath = getArg('--package');
const appDir = path.resolve(getArg('--app-dir', path.resolve(__dirname, '..')));
const isSilent = args.includes('--silent');

const PROGRESS_FILE = path.join(appDir, 'update_progress.json');
const STATE_FILE = path.join(appDir, 'update_state.json');

function reportProgress(step, progress, message, extra = {}) {
  const payload = {
    step,
    progress,
    message,
    timestamp: new Date().toISOString(),
    ...extra
  };

  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) {}

  if (!isSilent) {
    console.log(JSON.stringify(payload));
  }
}

function updateState(stage, details = {}) {
  try {
    const state = { stage, timestamp: new Date().toISOString(), ...details };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

async function run() {
  console.log('=================================================================');
  console.log('🚀 LOGIFLOW SECURE EXTERNAL UPDATER');
  console.log(`   Target App Directory: ${appDir}`);
  console.log(`   Package Location:     ${packagePath || 'None specified'}`);
  console.log('=================================================================');

  if (!packagePath || !fs.existsSync(packagePath)) {
    reportProgress('ERROR', 0, `Package file does not exist: ${packagePath}`);
    process.exit(1);
  }

  // Check for prior interrupted update (Crash Recovery)
  if (fs.existsSync(STATE_FILE)) {
    try {
      const lastState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (lastState.stage && lastState.stage !== 'COMPLETE' && lastState.stage !== 'ROLLED_BACK') {
        console.warn(`[Updater] Detected prior interrupted update at stage: ${lastState.stage}. Executing automatic recovery rollback...`);
        reportProgress('RECOVERING', 5, 'Recovering from prior interrupted update...');
        await performRollback(appDir, lastState.backupDir);
      }
    } catch (_) {}
  }

  // 0. Mutual Exclusion Lock
  const lockResult = acquireLock(appDir, 'UPDATE');
  if (!lockResult.acquired) {
    reportProgress('LOCKED', 0, lockResult.error);
    process.exit(409);
  }

  let backupDir = null;
  let currentStage = 'INIT';

  try {
    // ─────────────────────────────────────────────────────────────
    // STEP 1: VERIFY Signature & Checksum
    // ─────────────────────────────────────────────────────────────
    currentStage = 'VERIFYING';
    updateState(currentStage);
    reportProgress('VERIFYING', 10, 'Cryptographically verifying Ed25519 signature and SHA-256 hash...');

    const verification = verifyPackage(packagePath);
    if (!verification.valid) {
      throw new Error(`Package verification rejected: ${verification.error}`);
    }

    const { manifest, payloadBuffer } = verification;
    console.log(`[Updater] Validated release package: v${manifest.version} (requiresMigration: ${Boolean(manifest.requiresMigration)})`);

    // ─────────────────────────────────────────────────────────────
    // STEP 2: STOP Running Application Gracefully
    // ─────────────────────────────────────────────────────────────
    currentStage = 'STOPPING';
    updateState(currentStage);
    reportProgress('STOPPING', 25, 'Requesting graceful shutdown from active LogiFlow server...');

    const stopResult = await stopApplication(appDir, 8000);
    if (!stopResult.stopped) {
      throw new Error(`Failed to stop LogiFlow application: ${stopResult.error}`);
    }
    console.log('[Updater] Target application stopped. DB connections guaranteed closed.');

    // ─────────────────────────────────────────────────────────────
    // STEP 3: BACKUP SQLite Database (Post-Exit)
    // ─────────────────────────────────────────────────────────────
    currentStage = 'BACKING_UP';
    updateState(currentStage);
    reportProgress('BACKING_UP', 40, 'Executing WAL checkpoint and creating isolated SQLite backup...');

    const backupResult = backupDatabase(appDir);
    backupDir = backupResult.backupDir;
    updateState(currentStage, { backupDir });

    // ─────────────────────────────────────────────────────────────
    // STEP 4: EXTRACT Staged Payload with Zip-Slip Guard
    // ─────────────────────────────────────────────────────────────
    currentStage = 'EXTRACTING';
    updateState(currentStage, { backupDir });
    reportProgress('EXTRACTING', 55, 'Unpacking update archive to staging with path canonicalization...');

    extractPayload(payloadBuffer, appDir);

    // ─────────────────────────────────────────────────────────────
    // STEP 5: SWAP Application Code Directories
    // ─────────────────────────────────────────────────────────────
    currentStage = 'SWAPPING';
    updateState(currentStage, { backupDir });
    reportProgress('SWAPPING', 70, 'Swapping application code directories while preserving dev.db...');

    atomicCodeSwap(appDir);

    // ─────────────────────────────────────────────────────────────
    // STEP 6: MIGRATE Prisma Schema (if required)
    // ─────────────────────────────────────────────────────────────
    if (manifest.requiresMigration) {
      currentStage = 'MIGRATING';
      updateState(currentStage, { backupDir });
      reportProgress('MIGRATING', 80, 'Applying tracked Prisma migrations (prisma migrate deploy)...');

      applyMigrations(appDir);
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 7: RELAUNCH & Health Check Polling
    // ─────────────────────────────────────────────────────────────
    currentStage = 'RELAUNCHING';
    updateState(currentStage, { backupDir });
    reportProgress('RELAUNCHING', 90, 'Relaunching LogiFlow and polling /api/health for up to 45s...');

    const health = await relaunchAndVerifyHealth(appDir, 45);
    console.log(`[Updater] Health confirmed on port ${health.port}:`, health.response);

    // ─────────────────────────────────────────────────────────────
    // SUCCESS: Complete Update
    // ─────────────────────────────────────────────────────────────
    currentStage = 'COMPLETE';
    updateState('COMPLETE', { version: manifest.version });
    reportProgress('COMPLETE', 100, `Successfully updated to LogiFlow v${manifest.version}!`, {
      version: manifest.version,
      port: health.port
    });

    // Clean up temporary files
    try {
      const stagingDir = path.join(appDir, '_update_staging');
      if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch (_) {}

    releaseLock(appDir, true);
    console.log('[Updater] Update completed successfully. Exiting.');
    process.exit(0);

  } catch (err) {
    console.error(`\n❌ [Updater Error at stage ${currentStage}]:`, err.message);
    reportProgress('ROLLING_BACK', 95, `Update error (${err.message}). Rolling back atomically...`);

    try {
      await performRollback(appDir, backupDir);
      reportProgress('ROLLED_BACK', 0, `Rollback complete: ${err.message}`, { error: err.message });
    } catch (rollbackErr) {
      console.error('❌ [Rollback Failed]:', rollbackErr.message);
      reportProgress('ERROR', 0, `Rollback failed: ${rollbackErr.message}`, { error: rollbackErr.message });
    }

    releaseLock(appDir, true);
    process.exit(1);
  }
}

run();
