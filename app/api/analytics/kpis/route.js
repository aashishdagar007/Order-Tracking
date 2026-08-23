import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Fetch Orders
    const allOrders = await prisma.order.findMany({
      include: {
        events: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    // 2. Status Counts
    const statusCounts = {
      RECEIVED: 0,
      PICKING: 0,
      PACKING: 0,
      QUALITY_CHECK: 0,
      STAGED: 0,
      DISPATCHED: 0,
      ON_HOLD: 0,
      TOTAL: allOrders.length
    };

    let expressCount = 0;
    let urgentCount = 0;

    allOrders.forEach(o => {
      if (statusCounts[o.status] !== undefined) {
        statusCounts[o.status]++;
      }
      if (o.priority === 'EXPRESS') expressCount++;
      if (o.priority === 'URGENT') urgentCount++;
    });

    // 3. Stage Turnaround Times (in minutes)
    const stageTimes = {
      pickingMinutes: [],
      packingMinutes: [],
      stagingMinutes: [],
      totalMinutes: []
    };

    allOrders.forEach(o => {
      if (o.enteredAt && o.pickedAt) {
        const diff = (new Date(o.pickedAt) - new Date(o.enteredAt)) / 60000;
        if (diff >= 0 && diff < 10000) stageTimes.pickingMinutes.push(diff);
      }
      if (o.pickedAt && o.packedAt) {
        const diff = (new Date(o.packedAt) - new Date(o.pickedAt)) / 60000;
        if (diff >= 0 && diff < 10000) stageTimes.packingMinutes.push(diff);
      }
      if (o.enteredAt && o.dispatchedAt) {
        const diff = (new Date(o.dispatchedAt) - new Date(o.enteredAt)) / 60000;
        if (diff >= 0 && diff < 20000) stageTimes.totalMinutes.push(diff);
      }
    });

    const avg = arr => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

    const turnaroundAverages = {
      avgPickingMin: avg(stageTimes.pickingMinutes),
      avgPackingMin: avg(stageTimes.packingMinutes),
      avgTotalFulfillmentMin: avg(stageTimes.totalMinutes)
    };

    // 4. Worker Productivity Leaderboard
    const workers = await prisma.user.findMany({
      select: {
        id: 'asc',
        username: true,
        name: true,
        role: true,
        isActive: true,
        lastSeen: true,
        lastAction: true,
        lastActionAt: true
      }
    });

    const todayEvents = await prisma.orderEvent.findMany({
      where: {
        timestamp: { gte: startOfToday }
      }
    });

    const workerStats = {};
    workers.forEach(w => {
      workerStats[w.name] = {
        name: w.name,
        username: w.username,
        role: w.role,
        isActive: w.isActive,
        lastAction: w.lastAction,
        lastActionAt: w.lastActionAt,
        pickedToday: 0,
        packedToday: 0,
        dispatchedToday: 0,
        totalActionsToday: 0
      };
    });

    todayEvents.forEach(e => {
      const stats = workerStats[e.actorName];
      if (stats) {
        stats.totalActionsToday++;
        if (e.status === 'PICKING') stats.pickedToday++;
        if (e.status === 'PACKING') stats.packedToday++;
        if (e.status === 'DISPATCHED') stats.dispatchedToday++;
      }
    });

    const leaderboard = Object.values(workerStats).sort((a, b) => b.totalActionsToday - a.totalActionsToday);

    // 5. Hourly Throughput Today (0h to 23h)
    const hourlyThroughput = Array(24).fill(0);
    todayEvents.forEach(e => {
      const h = new Date(e.timestamp).getHours();
      hourlyThroughput[h]++;
    });

    return NextResponse.json({
      statusCounts,
      turnaroundAverages,
      priorityDistribution: {
        standard: allOrders.length - expressCount - urgentCount,
        express: expressCount,
        urgent: urgentCount
      },
      leaderboard,
      hourlyThroughput,
      dispatchedTodayCount: allOrders.filter(o => o.dispatchedAt && new Date(o.dispatchedAt) >= startOfToday).length
    });
  } catch (error) {
    console.error('KPI error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
