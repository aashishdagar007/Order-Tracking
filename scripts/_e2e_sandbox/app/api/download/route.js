import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const isMeta = searchParams.get('info') === 'true';

    const outputDir = path.resolve(process.cwd(), 'windows', 'Output');
    const preferredFiles = [
      'Warehouse_Management_Setup_v1.1.0.exe',
      'Warehouse_Management_Setup.exe'
    ];

    let targetFile = null;
    for (const f of preferredFiles) {
      const fullPath = path.join(outputDir, f);
      if (fs.existsSync(fullPath)) {
        targetFile = fullPath;
        break;
      }
    }

    if (!targetFile) {
      return NextResponse.json(
        { error: 'Windows installer has not been compiled yet. Run npm run build:windows to generate it.' },
        { status: 404 }
      );
    }

    const stat = fs.statSync(targetFile);
    const filename = path.basename(targetFile);

    if (isMeta) {
      return NextResponse.json({
        available: true,
        filename,
        version: '1.1.0',
        sizeBytes: stat.size,
        sizeMB: (stat.size / (1024 * 1024)).toFixed(1),
        modifiedAt: stat.mtime
      });
    }

    const fileStream = fs.createReadStream(targetFile);

    // ReadableStream for web response
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(stat.size)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
