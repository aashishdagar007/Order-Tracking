import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(APP_DIR, 'dev.db');

console.log('=================================================================');
console.log('🧪 TESTING SERVER PROCESS MANAGEMENT & SHUTDOWN HOOK');
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

function makeRequest(port, path, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers,
      timeout: 4000
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => resolve({ status: 500, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, error: 'Timeout' }); });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  const TEST_PORT = 3188;
  const lockFile = path.join(APP_DIR, 'app.lock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch (_) {}
  }

  console.log(`1. Launching server on test port ${TEST_PORT}...`);
  const serverProcess = spawn('node', ['server.js'], {
    cwd: APP_DIR,
    env: { ...process.env, PORT: TEST_PORT.toString(), NODE_ENV: 'production' },
    stdio: 'ignore'
  });

  // Wait up to 10s for app.lock
  let lockData = null;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (fs.existsSync(lockFile)) {
      try {
        lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        if (lockData.port === TEST_PORT) break;
      } catch (_) {}
    }
    await new Promise(r => setTimeout(r, 400));
  }

  assert(lockData !== null, 'server.js writes app.lock upon startup');
  assert(lockData?.pid === serverProcess.pid, 'app.lock contains correct server PID');
  assert(lockData?.port === TEST_PORT, 'app.lock contains dynamic listen port');
  assert(Boolean(lockData?.startedAt), 'app.lock records startedAt timestamp');
  assert(Boolean(lockData?.execPath), 'app.lock records Node execPath for PID reuse verification');
  assert(Boolean(lockData?.shutdownToken), 'app.lock generates cryptographically secure shutdownToken');

  console.log('\n2. Testing /internal/shutdown security guards...');
  // Attempt 1: Unauthorized shutdown request (no token)
  const unauthRes = await makeRequest(TEST_PORT, '/internal/shutdown', 'POST');
  assert(unauthRes.status === 403, 'POST /internal/shutdown rejects request without token (403 Forbidden)');

  // Attempt 2: Bad token
  const badTokenRes = await makeRequest(TEST_PORT, '/internal/shutdown', 'POST', {
    'x-shutdown-token': 'wrong-token'
  });
  assert(badTokenRes.status === 403, 'POST /internal/shutdown rejects invalid token (403 Forbidden)');

  // Attempt 3: Authorized shutdown request
  console.log('\n3. Testing authorized graceful shutdown via loopback hook...');
  const authRes = await makeRequest(TEST_PORT, '/internal/shutdown', 'POST', {
    'x-shutdown-token': lockData.shutdownToken
  });
  assert(authRes.status === 200, 'POST /internal/shutdown accepts valid token (200 OK)');

  // Wait for server exit
  let serverExited = false;
  const exitDeadline = Date.now() + 6000;
  while (Date.now() < exitDeadline) {
    try {
      process.kill(serverProcess.pid, 0);
      await new Promise(r => setTimeout(r, 300));
    } catch (_) {
      serverExited = true;
      break;
    }
  }

  assert(serverExited === true, 'Server process gracefully terminates after internal shutdown hook');
  assert(!fs.existsSync(lockFile), 'app.lock is automatically cleaned up on graceful shutdown');

  console.log('\n=================================================================');
  console.log(`📊 SERVER TESTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('=================================================================\n');
}

run();
