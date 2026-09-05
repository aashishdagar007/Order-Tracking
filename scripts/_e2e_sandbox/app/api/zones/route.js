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

    // Active (undispatched) orders
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { not: 'DISPATCHED' }
      },
      select: {
        id: true,
        orderNo: true,
        invoiceNo: true,
        status: true,
        priority: true,
        zone: true,
        dockBay: true,
        transporter: true,
        boxCount: true,
        enteredAt: true
      },
      orderBy: { enteredAt: 'desc' }
    });

    const ZONES_CONFIG = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];
    const DOCK_BAYS_CONFIG = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6'];

    const zonesData = {};
    ZONES_CONFIG.forEach(z => {
      zonesData[z] = {
        name: z,
        orders: [],
        count: 0,
        urgentCount: 0
      };
    });

    const dockBaysData = {};
    DOCK_BAYS_CONFIG.forEach(bay => {
      dockBaysData[bay] = {
        name: bay,
        orders: [],
        count: 0
      };
    });

    const unassigned = [];

    activeOrders.forEach(o => {
      let assignedZone = false;
      if (o.zone) {
        for (const z of ZONES_CONFIG) {
          if (o.zone.toLowerCase().includes(z.toLowerCase())) {
            zonesData[z].orders.push(o);
            zonesData[z].count++;
            if (o.priority === 'URGENT' || o.priority === 'EXPRESS') zonesData[z].urgentCount++;
            assignedZone = true;
            break;
          }
        }
      }

      if (o.dockBay) {
        for (const bay of DOCK_BAYS_CONFIG) {
          if (o.dockBay.toLowerCase().includes(bay.toLowerCase())) {
            dockBaysData[bay].orders.push(o);
            dockBaysData[bay].count++;
            break;
          }
        }
      }

      if (!assignedZone && !o.dockBay) {
        unassigned.push(o);
      }
    });

    return NextResponse.json({
      zones: zonesData,
      dockBays: dockBaysData,
      unassignedCount: unassigned.length,
      unassignedOrders: unassigned.slice(0, 10),
      totalActiveOrders: activeOrders.length
    });
  } catch (error) {
    console.error('Zones error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
