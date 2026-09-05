import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

import { generateKeys } from './generate_keys.js';
import { getSignaturePayload, computeSha256 } from '../updater/verify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'Output');

// Parse flags
const args = process.argv.slice(2);
const isPatch = args.includes('--type=patch') || !args.includes('--type=minor');
const skipBuild = args.includes('--skip-build');

console.log('=================================================================');
console.log('📦 LOGIFLOW SECURE UPDATE BUILDER');
console.log('=================================================================');

// 1. Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 2. Ensure Ed25519 signing keys exist
const { privateKeyPath } = generateKeys();
const privateKeyPem = process.env.UPDATE_SIGNING_KEY || fs.readFileSync(privateKeyPath, 'utf8');

// 3. Read and bump package.json version
const pkgPath = path.join(ROOT_DIR, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version || '1.1.0';

const versionParts = currentVersion.split('.').map((n) => parseInt(n, 10));
if (isPatch) {
  versionParts[2] = (versionParts[2] || 0) + 1;
} else {
  versionParts[1] = (versionParts[1] || 0) + 1;
  versionParts[2] = 0;
}
const nextVersion = versionParts.join('.');
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`[Version] Bumped version from v${currentVersion} to v${nextVersion}`);

// 4. Run Next.js production build if not skipped
if (!skipBuild) {
  console.log('[Build] Compiling production Next.js assets (npm run build)...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
} else {
  console.log('[Build] Skipped next build per flag.');
}

// 5. Detect if migrations are present
const migrationsDir = path.join(ROOT_DIR, 'prisma', 'migrations');
let requiresMigration = false;
if (fs.existsSync(migrationsDir)) {
  const entries = fs.readdirSync(migrationsDir).filter((e) => !e.startsWith('.') && e !== 'migration_lock.toml');
  requiresMigration = entries.length > 0;
}
console.log(`[Migrations] Migration requirement detected: ${requiresMigration}`);

// 6. Bundle payload into memory ZIP
console.log('[Bundle] Assembling lightweight update payload...');
const payloadZip = new AdmZip();

function addFolderRecursively(zip, srcDir, zipTargetPrefix) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullSrc = path.join(srcDir, entry.name);
    const relZipPath = zipTargetPrefix ? `${zipTargetPrefix}/${entry.name}` : entry.name;

    // Strict exclusions: build cache, standalone duplicates, databases, and node_modules
    if ((entry.name === 'cache' || entry.name === 'standalone') && zipTargetPrefix.startsWith('.next')) continue;
    if (entry.name.endsWith('.db') || entry.name.endsWith('.db-wal') || entry.name.endsWith('.db-shm')) continue;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    if (entry.isDirectory()) {
      addFolderRecursively(zip, fullSrc, relZipPath);
    } else {
      zip.addLocalFile(fullSrc, path.dirname(relZipPath));
    }
  }
}

// Items to bundle in the update payload
const itemsToInclude = [
  '.next',
  'app',
  'lib',
  'public',
  'server.js',
  'package.json',
  'prisma.config.ts',
  'next.config.ts'
];

for (const item of itemsToInclude) {
  const fullPath = path.join(ROOT_DIR, item);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addFolderRecursively(payloadZip, fullPath, item);
    } else {
      payloadZip.addLocalFile(fullPath);
    }
  }
}

// Include prisma schema and migrations (NEVER include dev.db!)
const schemaPath = path.join(ROOT_DIR, 'prisma', 'schema.prisma');
if (fs.existsSync(schemaPath)) {
  payloadZip.addLocalFile(schemaPath, 'prisma');
}
if (fs.existsSync(migrationsDir)) {
  payloadZip.addLocalFolder(migrationsDir, 'prisma/migrations');
}

console.log('[Bundle] Compressing payload...');
const payloadBuffer = payloadZip.toBuffer();
const payloadHash = computeSha256(payloadBuffer);
console.log(`[Bundle] Payload SHA-256: ${payloadHash}`);
console.log(`[Bundle] Payload size: ${(payloadBuffer.length / 1024 / 1024).toFixed(2)} MB`);

// 7. Cryptographically sign manifest with Ed25519
const releaseDate = new Date().toISOString();
const manifestObj = {
  version: nextVersion,
  releaseDate,
  sha256: payloadHash,
  minSupportedVersion: '1.0.0',
  changelog: `LogiFlow update v${nextVersion} (Performance & security enhancements)`,
  requiresMigration
};

const signaturePayload = getSignaturePayload(manifestObj);
const signature = crypto.sign(null, Buffer.from(signaturePayload, 'utf8'), privateKeyPem).toString('base64');
manifestObj.signature = signature;

console.log('[Sign] Successfully signed manifest with Ed25519 private key.');

// 8. Output final .wms archive
const wmsZip = new AdmZip();
wmsZip.addFile('update-manifest.json', Buffer.from(JSON.stringify(manifestObj, null, 2), 'utf8'));
wmsZip.addFile('payload.zip', payloadBuffer);

const wmsFilename = `logiflow-update-v${nextVersion}.wms`;
const wmsOutputPath = path.join(OUTPUT_DIR, wmsFilename);
wmsZip.writeZip(wmsOutputPath);

const finalSizeBytes = fs.statSync(wmsOutputPath).size;
const finalSizeMb = (finalSizeBytes / 1024 / 1024).toFixed(2);

console.log('\n=================================================================');
console.log('✅ UPDATE PACKAGE GENERATED SUCCESSFULLY');
console.log(`   Output File: ${wmsOutputPath}`);
console.log(`   Size:        ${finalSizeMb} MB (Target: 8–25 MB)`);
console.log(`   Version:     v${nextVersion}`);
console.log(`   SHA-256:     ${payloadHash}`);
console.log('=================================================================\n');

// 9. Check if Inno Setup is available to compile standalone patch installer
function findISCC() {
  const localApp = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(localApp, 'Programs', 'Inno Setup 7', 'ISCC.exe'),
    path.join(localApp, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Program Files\\Inno Setup 7\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 7\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const fromPath = execSync('where iscc', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n')[0].trim();
    if (fromPath && fs.existsSync(fromPath)) return fromPath;
  } catch (e) {}
  return null;
}

const iscc = findISCC();
const patchIssPath = path.join(ROOT_DIR, 'windows', 'patch_installer.iss');

if (iscc && fs.existsSync(patchIssPath)) {
  console.log(`[Installer] Compiling Update_v${nextVersion}.exe using Inno Setup at: ${iscc}`);
  try {
    execSync(`"${iscc}" /DMyAppVersion="${nextVersion}" /DWmsFile="${wmsOutputPath}" "${patchIssPath}"`, {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
    console.log(`[Installer] Successfully compiled Update_v${nextVersion}.exe`);
  } catch (err) {
    console.warn('[Installer] Inno Setup compilation notice:', err.message);
  }
} else {
  console.log('[Installer] Inno Setup compiler (ISCC.exe) not found or patch_installer.iss pending. .wms package ready for deployment.');
}
