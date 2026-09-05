import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = performance.now();

  try {
    // 1. Measure database latency & query health
    const orderCount = await prisma.order.count();
    const dbLatencyMs = Math.round((performance.now() - start) * 100) / 100;

    // 2. Process & Memory Telemetry
    const mem = process.memoryUsage();
    const memory = {
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    };

    // 3. WebSocket stats (from globalThis registered in server.js)
    const wsStats = globalThis.__wmsStats ? {
      connectedClients: globalThis.__wmsStats.getClientCount ? globalThis.__wmsStats.getClientCount() : 0,
      activeRooms: globalThis.__wmsStats.rooms ? globalThis.__wmsStats.rooms.size : 0
    } : null;

    const responsePayload = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'connected',
        engine: 'SQLite (WAL Mode)',
        latencyMs: dbLatencyMs,
        totalOrders: orderCount
      },
      system: {
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        memory
      },
      websocket: wsStats
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });
  } catch (error) {
    console.error('[Health Check Failed]', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        uptimeSeconds: Math.floor(process.uptime())
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      }
    );
  }
}
