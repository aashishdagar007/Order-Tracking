const { spawn, exec, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = process.env.PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;
const APP_DIR = path.resolve(__dirname, '..');

// Find local Wi-Fi / Ethernet IPv4
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
console.log('📦 WAREHOUSE MANAGEMENT - WINDOWS LAUNCHER');
console.log('====================================================');
console.log(`Local Terminal URL:    http://localhost:${PORT}`);
console.log(`Android Scanner IP:    http://${localIp}:${PORT}`);
console.log('====================================================');

// Automatically free port 3000 if occupied by a stale instance
function freePortIfOccupied(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[1].includes(`:${port}`) && parts[3] === 'LISTENING') {
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          console.log(`⚡ Freeing port ${port} (terminating stale process PID ${pid})...`);
          execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore' });
        }
      }
    }
  } catch (e) {
    // Port is free
  }
}

freePortIfOccupied(PORT);

// Ensure DB directory exists
const prismaDir = path.join(APP_DIR, 'prisma');
if (!fs.existsSync(prismaDir)) {
  fs.mkdirSync(prismaDir, { recursive: true });
}

// Determine node executable and Next.js start command
const nodeExe = process.execPath;
const possibleNextClis = [
  path.join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next'),
  path.join(APP_DIR, 'node_modules', 'next', 'bin', 'next'),
  path.join(APP_DIR, 'node_modules', '.bin', 'next')
];
const nextCli = possibleNextClis.find(p => fs.existsSync(p));
const hasProductionBuild = fs.existsSync(path.join(APP_DIR, '.next'));

const env = {
  ...process.env,
  NODE_ENV: hasProductionBuild ? 'production' : 'development',
  PORT: String(PORT),
  JWT_SECRET: process.env.JWT_SECRET || 'warehouse-wms-production-key-2026'
};

const nextCommand = hasProductionBuild ? 'start' : 'dev';
console.log(`Using Node runtime: ${nodeExe}`);
console.log(`Launching server in ${env.NODE_ENV} mode...`);

let serverProcess = null;

if (nextCli) {
  serverProcess = spawn(nodeExe, [nextCli, nextCommand, '-H', '0.0.0.0', '-p', String(PORT)], {
    cwd: APP_DIR,
    env,
    stdio: 'inherit'
  });
} else {
  console.error('❌ Could not locate local next binary in node_modules.');
  process.exit(1);
}

serverProcess.on('error', (err) => {
  console.error('❌ Failed to start server process:', err);
});

serverProcess.on('exit', (code, signal) => {
  console.log(`\n⚠ Server process exited with code ${code}, signal: ${signal}`);
  process.exit(code || 0);
});

// Check when server is ready and open browser
let browserOpened = false;

function checkServerReady(retries = 40) {
  if (retries <= 0) {
    console.warn('⚠ Server startup check reached limit, but process is still running.');
    return;
  }

  http.get(APP_URL, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 500 && !browserOpened) {
      browserOpened = true;
      console.log(`\n====================================================`);
      console.log(`✅ Warehouse Management Server is LIVE and RUNNING!`);
      console.log(`====================================================`);
      console.log(`📱 Android APK URL: http://${localIp}:${PORT}`);
      console.log(`💻 Local PC URL:    ${APP_URL}`);
      console.log(`\n👉 Leave this window OPEN while using Warehouse Management.`);
      console.log(`👉 Press Ctrl+C at any time to stop the server.`);
      console.log(`====================================================\n`);
      exec(`start ${APP_URL}`);
    } else if (!browserOpened) {
      setTimeout(() => checkServerReady(retries - 1), 1000);
    }
  }).on('error', () => {
    if (!browserOpened) {
      setTimeout(() => checkServerReady(retries - 1), 1000);
    }
  });
}

checkServerReady();

// Keep process permanently alive with a heartbeat timer
const keepAliveTimer = setInterval(() => {
  // heartbeat keeping Node.js event loop active
}, 60000);

function cleanup() {
  console.log('\n🛑 Stopping Warehouse Management server...');
  clearInterval(keepAliveTimer);
  if (serverProcess) {
    try {
      serverProcess.kill('SIGINT');
      if (serverProcess.pid) {
        execSync(`taskkill /F /T /PID ${serverProcess.pid} 2>nul`, { stdio: 'ignore' });
      }
    } catch (e) {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGBREAK', cleanup);
