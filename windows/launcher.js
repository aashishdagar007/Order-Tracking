const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;
const APP_DIR = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('🏭 WAREHOUSE MANAGEMENT SYSTEM - WINDOWS LAUNCHER');
console.log('====================================================');
console.log(`Starting background server on port ${PORT}...`);

// Ensure DB directory exists
const prismaDir = path.join(APP_DIR, 'prisma');
if (!fs.existsSync(prismaDir)) {
  fs.mkdirSync(prismaDir, { recursive: true });
}

// Determine node executable
const nodeExe = process.execPath;
const nextCli = path.join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(PORT),
  JWT_SECRET: process.env.JWT_SECRET || 'warehouse-wms-production-key-2026'
};

let serverProcess = null;

if (fs.existsSync(nextCli)) {
  serverProcess = spawn(nodeExe, [nextCli, 'start', '-p', String(PORT)], {
    cwd: APP_DIR,
    env,
    stdio: 'inherit'
  });
} else {
  console.log('Running direct next start in app directory...');
  serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR,
    env,
    shell: true,
    stdio: 'inherit'
  });
}

function checkServerReady(retries = 30) {
  if (retries <= 0) {
    console.error('❌ Server startup timed out.');
    return;
  }

  http.get(APP_URL, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 500) {
      console.log(`✅ Warehouse WMS is live at ${APP_URL}`);
      console.log('Opening your default browser...');
      exec(`start ${APP_URL}`);
    } else {
      setTimeout(() => checkServerReady(retries - 1), 1000);
    }
  }).on('error', () => {
    setTimeout(() => checkServerReady(retries - 1), 1000);
  });
}

checkServerReady();

function cleanup() {
  console.log('Stopping background WMS server...');
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
