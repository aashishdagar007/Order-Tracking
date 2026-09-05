import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const where = session.adminId ? { adminId: session.userId } : { role: 'WORKER' };

    // Get all workers
    const workers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        isActive: true,
        lastSeen: true,
        lastAction: true,
        lastActionAt: true,
        canViewOrders: true,
        canPickPack: true,
        canDispatch: true,
        canUpload: true,
        canExport: true,
        canViewLogs: true,
      },
      orderBy: { lastActionAt: 'desc' },
    });

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Fetch recent events & logs for each worker
    const workerActivities = await Promise.all(
      workers.map(async (worker) => {
        const isOnline = worker.lastSeen && new Date(worker.lastSeen) > fiveMinutesAgo;

        // Count operations performed today
        const [todayEventsCount, recentEvents] = await Promise.all([
          prisma.orderEvent.count({
            where: {
              actorName: worker.name,
              timestamp: { gte: startOfToday },
            },
          }),
          prisma.orderEvent.findMany({
            where: {
              actorName: worker.name,
            },
            take: 5,
            orderBy: { timestamp: 'desc' },
            include: {
              order: {
                select: {
                  orderNo: true,
                  zone: true,
                  status: true,
                },
              },
            },
          }),
        ]);

        return {
          ...worker,
          isOnline,
          todayOperationsCount: todayEventsCount,
          recentEvents,
        };
      })
    );

    return NextResponse.json({ activities: workerActivities, serverTime: now });
  } catch (error) {
    console.error('Activity GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch live activity' }, { status: 500 });
  }
}
