import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';

function fetchHealth(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/health',
      method: 'GET',
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, status: res.statusCode, data: json });
        } catch (_) {
          resolve({ ok: res.statusCode === 200, status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    });
    req.end();
  });
}

/**
 * Relaunches LogiFlow and monitors startup health
 */
export async function relaunchAndVerifyHealth(appDir = process.cwd(), maxPollSeconds = 45) {
  const launcherBat = path.join(appDir, 'launcher.bat');
  const serverJs = path.join(appDir, 'server.js');
  const runtimeNode = path.join(appDir, 'runtime', 'node.exe');

  console.log('[Health] Relaunching application...');
  const launchTime = Date.now();

  let child;
  if (fs.existsSync(launcherBat)) {
    console.log('[Health] Spawning launcher.bat');
    child = spawn('cmd.exe', ['/c', launcherBat], {
      cwd: appDir,
      detached: true,
      stdio: 'ignore'
    });
  } else {
    const nodeBin = fs.existsSync(runtimeNode) ? runtimeNode : 'node';
    console.log(`[Health] Spawning ${nodeBin} server.js --production`);
    child = spawn(nodeBin, [serverJs, '--production'], {
      cwd: appDir,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, NODE_ENV: 'production' }
    });
  }

  child.unref();

  // Wait for new app.lock with dynamic port
  const lockPath = path.join(appDir, 'app.lock');
  console.log('[Health] Waiting for fresh app.lock...');

  let port = null;
  let pid = null;
  const lockTimeout = Date.now() + 15000;

  while (Date.now() < lockTimeout) {
    if (fs.existsSync(lockPath)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const lockTime = new Date(lockData.startedAt).getTime();
        // Ensure this lock was written after relaunch was triggered
        if (lockTime >= launchTime - 1000) {
          port = lockData.port;
          pid = lockData.pid;
          console.log(`[Health] Discovered active process from app.lock: PID=${pid} Dynamic Port=${port}`);
          break;
        }
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!port) {
    throw new Error('Timeout waiting for server to write fresh app.lock after relaunch.');
  }

  // Poll /api/health every 2s for up to maxPollSeconds
  console.log(`[Health] Polling http://127.0.0.1:${port}/api/health every 2s (up to ${maxPollSeconds}s)...`);
  const deadline = Date.now() + maxPollSeconds * 1000;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;
    const res = await fetchHealth(port);
    if (res.ok) {
      console.log(`[Health] Verified application healthy on port ${port} in ${attempts} attempts.`);
      return { healthy: true, port, pid, response: res.data };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(`Health check failed after ${maxPollSeconds}s polling on port ${port}`);
}
