const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, '_dist');

console.log('====================================================');
console.log('📦 PREPARING WINDOWS DISTRIBUTION FOR INNO SETUP 7');
console.log('====================================================');

// 1. Ensure Next.js build is generated
const nextBuildDir = path.join(ROOT_DIR, '.next');
if (!fs.existsSync(nextBuildDir)) {
  console.log('Building production Next.js assets...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
}

// 2. Clean & recreate _dist
if (fs.existsSync(DIST_DIR)) {
  console.log('Cleaning previous _dist directory...');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// 3. Copy required directories & files
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

console.log('Staging application files into _dist...');
for (const item of itemsToCopy) {
  const src = path.join(ROOT_DIR, item);
  const dest = path.join(DIST_DIR, item);
  if (fs.existsSync(src)) {
    console.log(`  Copying ${item}...`);
    fs.cpSync(src, dest, { recursive: true, errorOnExist: false });
  }
}

console.log('\n====================================================');
console.log('✅ Staging complete! Location:', DIST_DIR);
console.log('To compile your Windows EXE with Inno Setup 7:');
console.log('  1. Open Inno Setup Compiler');
console.log('  2. Open "windows/installer.iss"');
console.log('  3. Click "Build" / "Compile" (or press Ctrl+F9)');
console.log('  Your EXE installer will be generated in "windows/Output/"');
console.log('====================================================\n');
