import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { isLocked } from '@/updater/lock';
import { getUpdateStatus, getBackupHistory, triggerUpdate } from '@/lib/updateManager';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getSessionUser(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const appDir = process.cwd();
    const pkgPath = path.join(appDir, 'package.json');
    let version = '1.1.0';
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        version = pkg.version || version;
      } catch (_) {}
    }

    const status = getUpdateStatus(appDir);
    const backups = getBackupHistory(appDir);

    return NextResponse.json({
      currentVersion: version,
      ...status,
      backups
    });
  } catch (err) {
    console.error('[API /system/update GET] Error:', err);
    return NextResponse.json({ error: 'Failed to retrieve update status' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin role required to apply system updates' }, { status: 403 });
    }

    const appDir = process.cwd();

    // Check mutual exclusion lock
    if (isLocked(appDir)) {
      return NextResponse.json(
        { error: 'Conflict: An update or maintenance task is already actively running.' },
        { status: 409 }
      );
    }

    // Write immutable audit log entry BEFORE performing any action
    try {
      await prisma.log.create({
        data: {
          userId: session.userId,
          name: session.name,
          role: session.role,
          action: 'System Update Initiated',
          detail: `Admin ${session.username} initiated system update package upload from IP.`
        }
      });
    } catch (logErr) {
      console.error('[API /system/update POST] Failed writing audit log:', logErr);
    }

    // Stream uploaded package directly to disk to bypass Next.js buffering limits
    const incomingPath = path.join(appDir, '_incoming_update.wms');
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('package');

      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No update package file provided in form data' }, { status: 400 });
      }

      const fileStream = Readable.fromWeb(file.stream());
      const writeStream = fs.createWriteStream(incomingPath);
      await pipeline(fileStream, writeStream);
    } else {
      // Direct binary stream
      if (!request.body) {
        return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
      }

      const webStream = request.body;
      const fileStream = Readable.fromWeb(webStream);
      const writeStream = fs.createWriteStream(incomingPath);
      await pipeline(fileStream, writeStream);
    }

    const fileSizeMb = (fs.statSync(incomingPath).size / 1024 / 1024).toFixed(2);
    console.log(`[API /system/update POST] Update package streamed to disk: ${fileSizeMb} MB`);

    // Launch detached external updater process
    const triggerResult = triggerUpdate(incomingPath, appDir);

    return NextResponse.json({
      ok: true,
      message: 'Update package received and updater process launched.',
      fileSizeMb,
      pid: triggerResult.pid
    });

  } catch (err) {
    console.error('[API /system/update POST] Error:', err);
    return NextResponse.json({ error: `Update trigger failed: ${err.message}` }, { status: 500 });
  }
}
