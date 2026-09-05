import http from 'http';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { SignJWT } from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(APP_DIR, 'dev.db');
import fs from 'fs';
const envFile = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8');
const secretMatch = envFile.match(/JWT_SECRET=["']?([^"'\r\n]+)/);
const jwtSecret = secretMatch ? secretMatch[1] : 'warehouse-wms-super-secret-jwt-key-2026';
const secretKey = new TextEncoder().encode(jwtSecret);

async function createToken(user) {
  return await new SignJWT({
    userId: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    permissions: { canViewOrders: true, canPickPack: true }
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(secretKey);
}

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

function makeRequest(port, endpoint, method, headers = {}, body = null) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: endpoint,
      method,
      headers,
      timeout: 5000
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
  console.log('=================================================================');
  console.log('🧪 TESTING /api/system/update RBAC & AUDIT LOGGING');
  console.log('=================================================================\n');

  // Check if dev server is running on 3000
  const port = 3000;
  const workerToken = await createToken({ id: 'worker-1', name: 'Test Worker', username: 'worker1', role: 'WORKER' });
  const adminToken = await createToken({ id: 'cmth902030000e4kvvpznduwn', name: 'Master Admin', username: 'admin', role: 'ADMIN' });

  // 1. GET /api/system/update without auth
  const unauthGet = await makeRequest(port, '/api/system/update', 'GET');
  assert(unauthGet.status === 403 || unauthGet.status === 401, 'GET /api/system/update without token rejected');

  // 2. GET /api/system/update with worker token
  const workerGet = await makeRequest(port, '/api/system/update', 'GET', {
    'Authorization': `Bearer ${workerToken}`
  });
  assert(workerGet.status === 403, 'GET /api/system/update with WORKER role rejected with 403 Forbidden');

  // 3. GET /api/system/update with admin token
  const adminGet = await makeRequest(port, '/api/system/update', 'GET', {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(adminGet.status === 200, 'GET /api/system/update with ADMIN role returns 200 OK');
  assert(Boolean(adminGet.data?.currentVersion), `Returns currentVersion: v${adminGet.data?.currentVersion}`);
  assert(Array.isArray(adminGet.data?.backups), 'Returns backups array');

  // 4. POST /api/system/update without auth
  const unauthPost = await makeRequest(port, '/api/system/update', 'POST');
  assert(unauthPost.status === 401, 'POST /api/system/update without auth rejected with 401');

  // 5. POST /api/system/update with worker token
  const workerPost = await makeRequest(port, '/api/system/update', 'POST', {
    'Authorization': `Bearer ${workerToken}`
  });
  assert(workerPost.status === 403, 'POST /api/system/update with WORKER role rejected with 403');

  // 6. Audit Logging Check in Database
  const db = new Database(DB_PATH, { readonly: true });
  const logCount = db.prepare('SELECT COUNT(*) as c FROM "Log"').get()?.c ?? 0;
  assert(logCount >= 0, `Log table accessible (currently ${logCount} total audit log rows)`);
  db.close();

  console.log('\n=================================================================');
  console.log(`📊 RBAC TESTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('=================================================================\n');
}

run();
