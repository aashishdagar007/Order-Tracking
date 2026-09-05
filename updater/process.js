import fs from 'fs';
import path from 'path';
import http from 'http';
import { execSync } from 'child_process';

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Checks on Windows whether the given PID matches LogiFlow process identity
 * (guards against Windows PID reuse after unclean exit).
 */
export function verifyProcessIdentity(pid, expectedExecPath) {
  if (process.platform !== 'win32') {
    return isProcessAlive(pid);
  }

  try {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object -ExpandProperty ExecutablePath"`;
    const output = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 4000 }).toString().trim();

    if (!output) {
      return false; // Process does not exist
    }

    // Check if executable path ends with node.exe or matches expected
    const lowerOut = output.toLowerCase();
    const isNode = lowerOut.endsWith('node.exe');
    const matchesExpected = expectedExecPath ? lowerOut === expectedExecPath.toLowerCase() : isNode;

    return isNode || matchesExpected;
  } catch (e) {
    // If PowerShell query fails, fallback to standard alive check
    return isProcessAlive(pid);
  }
}

/**
 * Sends graceful shutdown hook to the running application via loopback HTTP.
 */
function sendShutdownHook(port, shutdownToken) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/internal/shutdown',
      method: 'POST',
      headers: {
        'x-shutdown-token': shutdownToken || '',
        'Content-Type': 'application/json'
      },
      timeout: 3000
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Safely stops LogiFlow process recorded in app.lock:
 * 1. Checks app.lock exists
 * 2. Confirms PID identity against Windows PID reuse
 * 3. Calls /internal/shutdown hook
 * 4. Waits up to timeoutMs for exit
 * 5. Falls back to taskkill /PID <pid> /T only if needed
 */
export async function stopApplication(appDir = process.cwd(), timeoutMs = 8000) {
  const lockFile = path.join(appDir, 'app.lock');

  if (!fs.existsSync(lockFile)) {
    return { stopped: true, reason: 'No app.lock found; server appears already stopped' };
  }

  let lockData;
  try {
    lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  } catch (err) {
    console.warn('[Process] Corrupt app.lock, unlinking...');
    try { fs.unlinkSync(lockFile); } catch (_) {}
    return { stopped: true, reason: 'Corrupt app.lock removed' };
  }

  const { pid, port, execPath, shutdownToken } = lockData;

  if (!pid || !isProcessAlive(pid)) {
    console.log('[Process] Target PID is already not running. Removing stale app.lock.');
    try { fs.unlinkSync(lockFile); } catch (_) {}
    return { stopped: true, reason: 'PID was not running' };
  }

  // Windows PID Reuse Guard
  const identityMatches = verifyProcessIdentity(pid, execPath);
  if (!identityMatches) {
    console.warn(`[Process] PID ${pid} is active but DOES NOT match LogiFlow identity! Preserving unrelated process.`);
    try { fs.unlinkSync(lockFile); } catch (_) {}
    return { stopped: true, reason: 'PID reuse detected: preserved foreign process' };
  }

  console.log(`[Process] Identified running LogiFlow process: PID=${pid} Port=${port}. Requesting graceful shutdown...`);

  // Try loopback HTTP shutdown hook first
  const hookSent = await sendShutdownHook(port, shutdownToken);
  if (hookSent) {
    console.log('[Process] Loopback shutdown hook accepted. Waiting for process exit...');
  } else {
    console.warn('[Process] Shutdown hook did not respond or failed. Monitoring exit...');
  }

  // Poll for process exit
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) {
      console.log(`[Process] Process PID ${pid} has exited gracefully.`);
      try { fs.unlinkSync(lockFile); } catch (_) {}
      return { stopped: true, graceful: true };
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // Fallback: Targeted taskkill /PID <pid> /T
  console.warn(`[Process] Process did not exit within ${timeoutMs}ms. Initiating targeted taskkill /PID ${pid} /T...`);
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (e) {
    console.error('[Process] taskkill error:', e.message);
  }

  // Wait another 2 seconds
  await new Promise((r) => setTimeout(r, 1500));

  if (!isProcessAlive(pid)) {
    console.log(`[Process] Process PID ${pid} terminated via fallback.`);
    try { fs.unlinkSync(lockFile); } catch (_) {}
    return { stopped: true, graceful: false };
  }

  return { stopped: false, error: `Could not terminate process ${pid}` };
}
