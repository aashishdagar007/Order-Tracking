import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const totalOrders = await prisma.order.count();
    
    // Status counts
    const statusGroups = await prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const statusCounts = {
      RECEIVED: 0,
      PICKING: 0,
      PACKING: 0,
      QUALITY_CHECK: 0,
      STAGED: 0,
      DISPATCHED: 0,
      ON_HOLD: 0,
    };

    for (const g of statusGroups) {
      if (g.status in statusCounts) {
        statusCounts[g.status] = g._count.id;
      }
    }

    // Priority counts
    const priorityGroups = await prisma.order.groupBy({
      by: ['priority'],
      _count: { id: true },
    });

    const priorityCounts = {
      STANDARD: 0,
      EXPRESS: 0,
      URGENT: 0,
    };

    for (const p of priorityGroups) {
      if (p.priority in priorityCounts) {
        priorityCounts[p.priority] = p._count.id;
      }
    }

    // Today's stats
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const enteredToday = await prisma.order.count({
      where: { enteredAt: { gte: startOfToday } }
    });

    const dispatchedToday = await prisma.order.count({
      where: {
        status: 'DISPATCHED',
        dispatchedAt: { gte: startOfToday }
      }
    });

    // Top Transporters
    const transporterGroups = await prisma.order.groupBy({
      by: ['transporter'],
      where: { transporter: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });

    const topTransporters = transporterGroups.map(t => ({
      name: t.transporter || 'Unassigned',
      count: t._count.id
    }));

    return NextResponse.json({
      totalOrders,
      statusCounts,
      priorityCounts,
      enteredToday,
      dispatchedToday,
      topTransporters
    });
  } catch (error) {
    console.error('Analytics API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
