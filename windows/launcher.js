const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = process.env.PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;
const APP_DIR = path.resolve(__dirname, '..');

// Find local Wi-Fi / Ethernet IP
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();

console.log('====================================================');
console.log('🏭 WAREHOUSE MANAGEMENT SYSTEM - WINDOWS LAUNCHER');
console.log('====================================================');
console.log(`Local Terminal URL:    http://localhost:${PORT}`);
console.log(`Android Scanner IP:    http://${localIp}:${PORT}`);
console.log('====================================================');

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
  serverProcess = spawn(nodeExe, [nextCli, 'start', '-H', '0.0.0.0', '-p', String(PORT)], {
    cwd: APP_DIR,
    env,
    stdio: 'inherit'
  });
} else {
  serverProcess = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', String(PORT)], {
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
      console.log(`\n✅ Warehouse WMS is live!`);
      console.log(`  📱 On Android APK: Enter  http://${localIp}:${PORT}`);
      console.log(`  💻 On this PC:    Opening ${APP_URL} in your browser...\n`);
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
