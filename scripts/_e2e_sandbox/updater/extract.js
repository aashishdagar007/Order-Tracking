import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export function extractPayload(payloadBufferOrZipPath, appDir = process.cwd()) {
  const stagingDir = path.join(appDir, '_update_staging');

  // Clean existing staging dir
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  const canonicalStagingRoot = path.resolve(stagingDir);
  const zip = Buffer.isBuffer(payloadBufferOrZipPath)
    ? new AdmZip(payloadBufferOrZipPath)
    : new AdmZip(payloadBufferOrZipPath);

  const zipEntries = zip.getEntries();
  const extractedFiles = [];

  for (const entry of zipEntries) {
    if (entry.isDirectory) {
      continue;
    }

    // Canonicalize entry path (Zip-Slip Guard)
    const rawEntryName = entry.entryName;
    const entryName = rawEntryName.replace(/\\/g, '/');
    const targetPath = path.resolve(canonicalStagingRoot, entryName);

    // Strict Zip-Slip Prevention Check: token check + canonical prefix check
    const hasTraversalToken = entryName.split('/').some(segment => segment === '..');
    const isOutsideRoot = !targetPath.startsWith(canonicalStagingRoot + path.sep) && targetPath !== canonicalStagingRoot;

    if (hasTraversalToken || isOutsideRoot) {
      throw new Error(`[Zip-Slip Attack Detected] Malicious archive entry: "${rawEntryName}" attempts directory traversal outside staging root: "${targetPath}"`);
    }

    // Ensure parent directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file data
    fs.writeFileSync(targetPath, entry.getData());
    extractedFiles.push(entryName);
  }

  console.log(`[Extract] Safely extracted ${extractedFiles.length} files to staging: ${stagingDir}`);
  return { stagingDir, extractedFiles };
}
