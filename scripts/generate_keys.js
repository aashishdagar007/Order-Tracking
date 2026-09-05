import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const KEYS_DIR = path.join(ROOT_DIR, 'keys');

export function generateKeys() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  const privateKeyPath = path.join(KEYS_DIR, 'update_signing_key.pem');
  const publicKeyPath = path.join(KEYS_DIR, 'update_public_key.pem');

  if (fs.existsSync(privateKeyPath)) {
    console.log('[Keys] Signing key already exists at:', privateKeyPath);
    const pub = fs.readFileSync(publicKeyPath, 'utf8');
    return { privateKeyPath, publicKeyPath, publicKeyPem: pub };
  }

  console.log('[Keys] Generating fresh 256-bit Ed25519 keypair...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

  console.log('[Keys] Private key written to:', privateKeyPath);
  console.log('[Keys] Public key written to:', publicKeyPath);

  return { privateKeyPath, publicKeyPath, publicKeyPem: publicKey };
}

// If executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = generateKeys();
  console.log('\n--- EMBEDDABLE PUBLIC KEY ---');
  console.log(result.publicKeyPem);
  console.log('-----------------------------\n');
}
