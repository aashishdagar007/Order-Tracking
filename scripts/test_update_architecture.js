import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

import { verifyPackage, verifySignature, computeSha256 } from '../updater/verify.js';
import { extractPayload } from '../updater/extract.js';
import { acquireLock, releaseLock, isLocked } from '../updater/lock.js';
import { backupDatabase } from '../updater/backup.js';
import { verifyProcessIdentity } from '../updater/process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const SCRATCH_DIR = path.join(APP_DIR, 'scripts', '_test_scratch');

console.log('=================================================================');
console.log('🧪 RUNNING AUTOMATED UPDATE ARCHITECTURE VERIFICATION TEST SUITE');
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

async function runTests() {
  if (!fs.existsSync(SCRATCH_DIR)) fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  // ── TEST 1: Lock Mutual Exclusion & 409 Conflict ───────────────────
  console.log('1. Testing Mutual Exclusion Locking (updater/lock.js)...');
  const tempAppDir = path.join(SCRATCH_DIR, 'test_lock_sandbox');
  if (fs.existsSync(tempAppDir)) fs.rmSync(tempAppDir, { recursive: true });
  fs.mkdirSync(tempAppDir, { recursive: true });

  const lock1 = acquireLock(tempAppDir, 'PATH_A');
  assert(lock1.acquired === true, 'Path A successfully acquires updater.lock');
  assert(isLocked(tempAppDir) === true, 'isLocked returns true when lock is active');

  const lock2 = acquireLock(tempAppDir, 'PATH_B');
  assert(lock2.acquired === false, 'Path B concurrent attempt is rejected with conflict (409)');

  releaseLock(tempAppDir, true);
  assert(isLocked(tempAppDir) === false, 'updater.lock released cleanly');

  // ── TEST 2: Zip-Slip Path Traversal Protection ─────────────────────
  console.log('\n2. Testing Zip-Slip Guard (updater/extract.js)...');
  const evilZip = new AdmZip();
  evilZip.addFile('evil.js', Buffer.from('console.log("pwned")'));
  evilZip.getEntries()[0].entryName = '../../evil.js';
  evilZip.addFile('normal.js', Buffer.from('console.log("normal")'));

  let zipSlipCaught = false;
  try {
    extractPayload(evilZip.toBuffer(), tempAppDir);
  } catch (err) {
    if (err.message.includes('Zip-Slip Attack Detected')) {
      zipSlipCaught = true;
    }
  }
  assert(zipSlipCaught === true, 'Archive entry with "../../evil.js" is strictly blocked by Zip-Slip guard');

  // ── TEST 3: Cryptographic Signature & Tamper Detection ─────────────
  console.log('\n3. Testing Ed25519 Package Verification & Tampering...');
  const outputDir = path.join(APP_DIR, 'Output');
  const wmsFiles = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir).filter(f => f.endsWith('.wms'))
    : [];

  if (wmsFiles.length > 0) {
    const validPkgPath = path.join(outputDir, wmsFiles[wmsFiles.length - 1]);
    const pkgSizeMb = (fs.statSync(validPkgPath).size / 1024 / 1024).toFixed(2);
    console.log(`   Found .wms package: ${wmsFiles[wmsFiles.length - 1]} (${pkgSizeMb} MB)`);

    assert(parseFloat(pkgSizeMb) < 25.0, `Package size is within lightweight requirement (< 25MB): ${pkgSizeMb} MB`);

    const validResult = verifyPackage(validPkgPath);
    assert(validResult.valid === true, 'Valid package passes Ed25519 cryptographic signature & SHA-256');

    // Tamper Test: Modify 1 byte in the package
    const tamperedPkgPath = path.join(tempAppDir, 'tampered.wms');
    const validBytes = fs.readFileSync(validPkgPath);
    validBytes[Math.floor(validBytes.length / 2)] ^= 0xFF;
    fs.writeFileSync(tamperedPkgPath, validBytes);

    const tamperedResult = verifyPackage(tamperedPkgPath);
    assert(tamperedResult.valid === false, 'Single tampered byte causes instant verification rejection');
  } else {
    console.warn('   ⚠ No .wms package found in Output/ yet to test signature.');
  }

  // ── TEST 4: SQLite WAL Checkpoint & 13,000+ Records Preservation ──
  console.log('\n4. Testing SQLite WAL Checkpoint & Data Preservation...');
  const realDbPath = path.join(APP_DIR, 'dev.db');
  if (fs.existsSync(realDbPath)) {
    const stageDbDir = path.join(tempAppDir, 'db_stage');
    fs.mkdirSync(stageDbDir, { recursive: true });
    fs.copyFileSync(realDbPath, path.join(stageDbDir, 'dev.db'));

    const backupResult = backupDatabase(stageDbDir);
    assert(backupResult.success === true, 'SQLite WAL checkpoint (TRUNCATE) executes cleanly on copy of dev.db');
    assert(backupResult.meta.integrityOk === true, 'SQLite PRAGMA integrity_check passes on database snapshot');
    assert((backupResult.meta.rowCounts?.Order ?? 0) >= 13000, `All ${backupResult.meta.rowCounts?.Order} live orders preserved in backup`);
    assert(fs.existsSync(path.join(backupResult.backupDir, 'dev.db')), 'dev.db copied to backup snapshot directory');
    assert(fs.existsSync(path.join(backupResult.backupDir, 'backup_meta.json')), 'backup_meta.json created with checksums and rowcounts');
  }

  // ── TEST 5: Windows PID Reuse Protection ───────────────────────────
  console.log('\n5. Testing Windows Process Identity / PID Reuse Guard...');
  const isCurrentNode = verifyProcessIdentity(process.pid, process.execPath);
  assert(isCurrentNode === true, 'Current Node.js process identity correctly identified');

  const isFakeNode = verifyProcessIdentity(999999, 'C:\\nonexistent.exe');
  assert(isFakeNode === false, 'Non-existent PID correctly rejected by identity checker');

  // ── CLEANUP ────────────────────────────────────────────────────────
  try { fs.rmSync(SCRATCH_DIR, { recursive: true, force: true }); } catch (_) {}

  console.log('\n=================================================================');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('=================================================================\n');
}

runTests();
