const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, '_dist');

console.log('====================================================');
console.log('📦 PREPARING WINDOWS DISTRIBUTION FOR INNO SETUP 7');
console.log('====================================================');

// 1. Build Next.js
console.log('Step 1: Building production Next.js assets...');
execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

// 2. Clean & recreate _dist
if (fs.existsSync(DIST_DIR)) {
  console.log('Step 2: Cleaning previous _dist directory...');
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
  'package.json',
  'next.config.ts'
];

console.log('Step 3: Staging application files...');
for (const item of itemsToCopy) {
  const src = path.join(ROOT_DIR, item);
  const dest = path.join(DIST_DIR, item);
  if (fs.existsSync(src)) {
    console.log(`  Copying ${item}...`);
    fs.cpSync(src, dest, { recursive: true });
  }
}

// 4. Install production dependencies inside _dist
console.log('Step 4: Installing production dependencies in _dist...');
execSync('npm install --omit=dev --ignore-scripts', { cwd: DIST_DIR, stdio: 'inherit' });

// 5. Generate Prisma Client in _dist
console.log('Step 5: Generating Prisma client for distribution...');
execSync('npx prisma generate', { cwd: DIST_DIR, stdio: 'inherit' });

console.log('\n====================================================');
console.log('✅ Staging complete! Location:', DIST_DIR);
console.log('To compile your Windows EXE with Inno Setup 7:');
console.log('  1. Open Inno Setup Compiler');
console.log('  2. Open "windows/installer.iss"');
console.log('  3. Click "Build" / "Compile" (or press Ctrl+F9)');
console.log('  Your EXE installer will be generated in "windows/Output/"');
console.log('====================================================\n');
