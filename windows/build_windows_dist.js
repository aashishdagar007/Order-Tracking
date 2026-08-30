const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, '_dist');
const WINDOWS_DIR = path.join(ROOT_DIR, 'windows');
const RUNTIME_DIR = path.join(WINDOWS_DIR, 'runtime');

console.log('====================================================');
console.log('📦 PREPARING WINDOWS DISTRIBUTION FOR INNO SETUP 7');
console.log('====================================================');

// 1. Ensure Standalone Node.js Runtime is staged
console.log('1. Staging standalone Node.js runtime (so target PCs don\'t need Node.js installed)...');
if (!fs.existsSync(RUNTIME_DIR)) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}
const nodeExePath = process.execPath;
const bundledNodeDest = path.join(RUNTIME_DIR, 'node.exe');
if (fs.existsSync(nodeExePath)) {
  console.log(`   Copying active Node runtime from: ${nodeExePath}`);
  fs.copyFileSync(nodeExePath, bundledNodeDest);
  console.log(`   ✓ Bundled Node.js runtime ready (${(fs.statSync(bundledNodeDest).size / 1024 / 1024).toFixed(1)} MB)`);
} else {
  console.warn('   ⚠ Warning: process.execPath not found. Please place node.exe into windows/runtime/');
}

// 2. Ensure Next.js build is generated
console.log('\n2. Verifying production Next.js assets...');
const nextBuildDir = path.join(ROOT_DIR, '.next');
if (!fs.existsSync(nextBuildDir)) {
  console.log('   Building production Next.js assets...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
} else {
  console.log('   ✓ Production build detected in .next/');
}

// 3. Clean & recreate _dist
console.log('\n3. Cleaning and staging _dist directory...');
if (fs.existsSync(DIST_DIR)) {
  console.log('   Cleaning previous _dist directory...');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// 4. Copy required directories & files
const itemsToCopy = [
  '.next',
  'public',
  'prisma',
  'lib',
  'app',
  'windows',
  'node_modules',
  'package.json',
  'next.config.ts'
];

for (const item of itemsToCopy) {
  const src = path.join(ROOT_DIR, item);
  const dest = path.join(DIST_DIR, item);
  if (fs.existsSync(src)) {
    console.log(`   Copying ${item}...`);
    fs.cpSync(src, dest, { recursive: true, errorOnExist: false });
  }
}

// Also stage runtime directory directly into _dist/runtime
const distRuntimeDir = path.join(DIST_DIR, 'runtime');
fs.mkdirSync(distRuntimeDir, { recursive: true });
if (fs.existsSync(bundledNodeDest)) {
  fs.copyFileSync(bundledNodeDest, path.join(distRuntimeDir, 'node.exe'));
}

console.log('\n====================================================');
console.log('✅ Staging complete! Location:', DIST_DIR);
console.log('====================================================');

// 5. Look for Inno Setup compiler and compile automatically
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

const isccPath = findISCC();
if (isccPath) {
  console.log(`\n🔨 Found Inno Setup Compiler at: ${isccPath}`);
  console.log('Building standalone Windows installer EXE...');
  try {
    const issFile = path.join(WINDOWS_DIR, 'installer.iss');
    execSync(`"${isccPath}" "${issFile}"`, { cwd: WINDOWS_DIR, stdio: 'inherit' });
    console.log('\n====================================================');
    console.log('🎉 INNO SETUP COMPILATION SUCCEEDED!');

    // Mirror to standard Warehouse_Management_Setup.exe so direct downloads always have the latest build
    const outputDir = path.join(WINDOWS_DIR, 'Output');
    const versionedExe = path.join(outputDir, 'Warehouse_Management_Setup_v1.1.0.exe');
    const standardExe = path.join(outputDir, 'Warehouse_Management_Setup.exe');

    if (fs.existsSync(versionedExe)) {
      fs.copyFileSync(versionedExe, standardExe);
      const sizeMB = (fs.statSync(versionedExe).size / (1024 * 1024)).toFixed(1);
      console.log(`📦 Generated Installer: ${versionedExe} (${sizeMB} MB)`);
      console.log(`📦 Latest Release Alias: ${standardExe}`);
    }
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Inno Setup compilation failed:', err.message);
  }
} else {
  console.log('\nℹ To compile your installer manually:');
  console.log('  1. Open Inno Setup Compiler');
  console.log('  2. Open "windows/installer.iss"');
  console.log('  3. Click Compile (Ctrl+F9)');
  console.log('====================================================\n');
}
