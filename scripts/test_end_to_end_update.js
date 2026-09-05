import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SANDBOX_DIR = path.join(ROOT_DIR, 'scripts', '_e2e_sandbox');
const OUTPUT_DIR = path.join(ROOT_DIR, 'Output');

console.log('=================================================================');
console.log('🚀 END-TO-END STAGING UPDATE ARCHITECTURE VALIDATION');
console.log('=================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
  }
}

async function runE2ETest() {
  // 1. Locate generated .wms package
  const wmsFiles = fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.wms'))
    : [];

  if (wmsFiles.length === 0) {
    throw new Error('No .wms package found in Output/ directory. Run build:update first.');
  }
  const packagePath = path.join(OUTPUT_DIR, wmsFiles[wmsFiles.length - 1]);
  console.log(`Using update package: ${packagePath} (${(fs.statSync(packagePath).size / 1024 / 1024).toFixed(2)} MB)`);

  // 2. Setup Staging Sandbox
  console.log('Setting up isolated staging sandbox directory...');
  if (fs.existsSync(SANDBOX_DIR)) {
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });

  // Copy minimal code and live database to sandbox
  const itemsToCopy = ['updater', 'package.json', 'server.js', '.env', 'prisma.config.ts'];
  for (const item of itemsToCopy) {
    const src = path.join(ROOT_DIR, item);
    const dest = path.join(SANDBOX_DIR, item);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }

  // Link node_modules so server and prisma commands run instantly without 600MB copy
  const nmSrc = path.join(ROOT_DIR, 'node_modules');
  const nmDest = path.join(SANDBOX_DIR, 'node_modules');
  if (process.platform === 'win32') {
    try { execSync(`cmd /c mklink /J "${nmDest}" "${nmSrc}"`, { stdio: 'ignore' }); } catch (_) {}
  }

  // Copy real dev.db into sandbox
  const realDb = path.join(ROOT_DIR, 'dev.db');
  fs.copyFileSync(realDb, path.join(SANDBOX_DIR, 'dev.db'));

  // Verify baseline order count in sandbox
  const baselineDb = new Database(path.join(SANDBOX_DIR, 'dev.db'), { readonly: true });
  const baselineOrderCount = baselineDb.prepare('SELECT COUNT(*) as c FROM "Order"').get()?.c ?? 0;
  baselineDb.close();

  assert(baselineOrderCount >= 13000, `Baseline staging database has ${baselineOrderCount} live orders`);

  // 3. Test Updater Execution via CLI
  console.log('\nExecuting external updater (updater/cli.js)...');
  const cliPath = path.join(ROOT_DIR, 'updater', 'cli.js');

  const updateOutput = execSync(`node "${cliPath}" --package="${packagePath}" --app-dir="${SANDBOX_DIR}"`, {
    stdio: ['pipe', 'pipe', 'pipe']
  }).toString();

  console.log('[Updater Log Snippet]:');
  const logLines = updateOutput.trim().split('\n');
  logLines.slice(-8).forEach(l => console.log('  ' + l));

  // 4. Verify Post-Update Assertions
  console.log('\nVerifying post-update integrity...');

  // A. Progress file shows COMPLETE
  const progressFile = path.join(SANDBOX_DIR, 'update_progress.json');
  assert(fs.existsSync(progressFile), 'update_progress.json was generated');
  if (fs.existsSync(progressFile)) {
    const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    assert(progress.step === 'COMPLETE', `Final update step is COMPLETE (progress: ${progress.progress}%)`);
  }

  // B. Backup directory exists and contains intact snapshot
  const backupsDir = path.join(SANDBOX_DIR, 'prisma', 'backups');
  assert(fs.existsSync(backupsDir), 'prisma/backups/ was created');
  const backupEntries = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : [];
  assert(backupEntries.length > 0, `At least one database backup snapshot created (${backupEntries[0]})`);

  if (backupEntries.length > 0) {
    const metaPath = path.join(backupsDir, backupEntries[0], 'backup_meta.json');
    assert(fs.existsSync(metaPath), 'backup_meta.json was recorded');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      assert(meta.rowCounts?.Order === baselineOrderCount, `Snapshot preserves all ${baselineOrderCount} orders`);
      assert(meta.integrityOk === true, 'Snapshot integrity_check verified');
    }
  }

  // C. Live database in updated sandbox was NOT destroyed or overwritten
  const postUpdateDb = new Database(path.join(SANDBOX_DIR, 'dev.db'), { readonly: true });
  const postUpdateOrderCount = postUpdateDb.prepare('SELECT COUNT(*) as c FROM "Order"').get()?.c ?? 0;
  postUpdateDb.close();

  assert(postUpdateOrderCount === baselineOrderCount, `Live database after update retains all ${baselineOrderCount} orders (ZERO DATA LOSS)`);

  // D. Updater lock was released cleanly
  assert(!fs.existsSync(path.join(SANDBOX_DIR, 'updater.lock')), 'updater.lock was cleanly released');

  // Clean up sandbox
  try {
    if (process.platform === 'win32') {
      try { execSync(`cmd /c rmdir "${nmDest}"`, { stdio: 'ignore' }); } catch (_) {}
    }
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n=================================================================');
  console.log(`📊 END-TO-END RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('=================================================================\n');
}

runE2ETest().catch(err => {
  console.error('❌ E2E Test Error:', err);
  process.exit(1);
});
