import crypto from 'crypto';
import fs from 'fs';
import AdmZip from 'adm-zip';

export const EMBEDDED_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA4Ja6mHJmexLToDPlGV+2hfusGsiDdG+AqxNiT2B7DxY=
-----END PUBLIC KEY-----`;

/**
 * Computes SHA-256 of a Buffer
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes signature data string for deterministic verification
 */
export function getSignaturePayload(manifest) {
  return `${manifest.version}:${manifest.sha256}:${manifest.releaseDate}:${manifest.requiresMigration ? '1' : '0'}`;
}

/**
 * Verifies Ed25519 signature against public key
 */
export function verifySignature(signaturePayload, signatureBase64, publicKeyPem = EMBEDDED_PUBLIC_KEY) {
  try {
    const dataBuffer = Buffer.from(signaturePayload, 'utf8');
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');
    return crypto.verify(null, dataBuffer, publicKeyPem, signatureBuffer);
  } catch (err) {
    console.error('[Verify] Signature verification error:', err.message);
    return false;
  }
}

/**
 * Verifies a .wms package:
 * 1. Checks archive format
 * 2. Extracts and parses update-manifest.json
 * 3. Verifies Ed25519 digital signature of manifest against embedded public key
 * 4. Verifies SHA-256 of the payload archive content
 */
export function verifyPackage(packagePath, publicKeyPem = EMBEDDED_PUBLIC_KEY) {
  if (!fs.existsSync(packagePath)) {
    return { valid: false, error: `Package file not found: ${packagePath}` };
  }

  try {
    const zip = new AdmZip(packagePath);
    const manifestEntry = zip.getEntry('update-manifest.json');

    if (!manifestEntry) {
      return { valid: false, error: 'Package missing update-manifest.json' };
    }

    const manifestText = manifestEntry.getData().toString('utf8');
    const manifest = JSON.parse(manifestText);

    if (!manifest.version || !manifest.sha256 || !manifest.signature) {
      return { valid: false, error: 'Malformed update-manifest.json (missing version, sha256, or signature)' };
    }

    // Verify Ed25519 signature
    const sigPayload = getSignaturePayload(manifest);
    const isSignatureValid = verifySignature(sigPayload, manifest.signature, publicKeyPem);

    if (!isSignatureValid) {
      return {
        valid: false,
        error: 'Ed25519 signature verification failed. Package is untrusted or tampered.',
        manifest
      };
    }

    // Verify Payload SHA-256
    const payloadZipEntry = zip.getEntry('payload.zip');
    if (!payloadZipEntry) {
      return { valid: false, error: 'Package missing internal payload.zip', manifest };
    }

    const payloadBuffer = payloadZipEntry.getData();
    const computedHash = computeSha256(payloadBuffer);

    if (computedHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
      return {
        valid: false,
        error: `Payload SHA-256 mismatch! Expected: ${manifest.sha256}, Actual: ${computedHash}`,
        manifest
      };
    }

    return {
      valid: true,
      manifest,
      payloadBuffer
    };
  } catch (err) {
    return {
      valid: false,
      error: `Failed to inspect update package: ${err.message}`
    };
  }
}
