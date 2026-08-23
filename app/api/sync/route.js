import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET: Full or incremental sync pull from server
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');

    const where = {};
    if (since) {
      where.updatedAt = { gte: new Date(since) };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        events: {
          orderBy: { timestamp: 'desc' },
          take: 5
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      orders,
      serverTime: new Date().toISOString(),
      total: orders.length
    });
  } catch (error) {
    console.error('Sync GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Reconcile mutations & new orders pushed from offline Android devices
export async function POST(request) {
  try {
    const session = await getSessionUser();
    const actorName = session?.name || 'Mobile Scanner (Offline Sync)';
    const actorRole = session?.role || 'WORKER';

    const body = await request.json();
    const { mutations = [], newOrders = [] } = body;

    let appliedMutations = 0;
    let createdOrders = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Process New Orders created while offline
      for (const ord of newOrders) {
        if (!ord.orderNo) continue;
        const exists = await tx.order.findUnique({
          where: { orderNo: ord.orderNo }
        });

        if (!exists) {
          const now = ord.enteredAt ? new Date(ord.enteredAt) : new Date();
          const created = await tx.order.create({
            data: {
              orderNo: ord.orderNo,
              invoiceNo: ord.invoiceNo || null,
              lrNo: ord.lrNo || null,
              status: ord.status || 'RECEIVED',
              priority: ord.priority || 'STANDARD',
              zone: ord.zone || null,
              dockBay: ord.dockBay || null,
              transporter: ord.transporter || null,
              vehicleNo: ord.vehicleNo || null,
              boxCount: ord.boxCount ? parseInt(ord.boxCount, 10) : 1,
              weightKg: ord.weightKg ? parseFloat(ord.weightKg) : null,
              notes: ord.notes || null,
              enteredBy: ord.enteredBy || actorName,
              enteredAt: now
            }
          });

          await tx.orderEvent.create({
            data: {
              orderId: created.id,
              status: created.status,
              actorName: ord.enteredBy || actorName,
              actorRole,
              note: 'Created offline on mobile device and synced',
              timestamp: now
            }
          });
          createdOrders++;
        }
      }

      // 2. Process Mutations (status transitions) executed while offline
      for (const mut of mutations) {
        if (!mut.orderNo && !mut.orderId) continue;

        const where = mut.orderId ? { id: mut.orderId } : { orderNo: mut.orderNo };
        const existing = await tx.order.findUnique({ where });

        if (existing) {
          const timestamp = mut.timestamp ? new Date(mut.timestamp) : new Date();
          const updateData = {
            updatedBy: mut.actorName || actorName,
            updatedAt: timestamp
          };

          if (mut.status) {
            updateData.status = mut.status;
            if (mut.status === 'PICKING' && !existing.pickedAt) {
              updateData.pickedBy = mut.actorName || actorName;
              updateData.pickedAt = timestamp;
            } else if (mut.status === 'PACKING' && !existing.packedAt) {
              updateData.packedBy = mut.actorName || actorName;
              updateData.packedAt = timestamp;
            } else if (mut.status === 'DISPATCHED') {
              updateData.dispatchedAt = timestamp;
              updateData.sent = true;
            }
          }

          if (mut.dockBay !== undefined) updateData.dockBay = mut.dockBay;
          if (mut.transporter !== undefined) updateData.transporter = mut.transporter;
          if (mut.vehicleNo !== undefined) updateData.vehicleNo = mut.vehicleNo;
          if (mut.boxCount !== undefined) updateData.boxCount = parseInt(mut.boxCount, 10);
          if (mut.weightKg !== undefined) updateData.weightKg = parseFloat(mut.weightKg);
          if (mut.lrNo !== undefined) updateData.lrNo = mut.lrNo;
          if (mut.invoiceNo !== undefined) updateData.invoiceNo = mut.invoiceNo;

          await tx.order.update({
            where: { id: existing.id },
            data: updateData
          });

          await tx.orderEvent.create({
            data: {
              orderId: existing.id,
              status: mut.status || 'OFFLINE_UPDATE',
              actorName: mut.actorName || actorName,
              actorRole: mut.actorRole || actorRole,
              note: mut.note || `Offline mobile action synced (${mut.status})`,
              timestamp
            }
          });

          appliedMutations++;
        }
      }

      // 3. Log the sync session
      await tx.log.create({
        data: {
          name: actorName,
          role: actorRole,
          action: 'MOBILE_OFFLINE_SYNC',
          detail: `Synchronized ${appliedMutations} status transitions and ${createdOrders} offline orders`
        }
      });
    });

    // Return the latest active manifest
    const latestOrders = await prisma.order.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200
    });

    return NextResponse.json({
      success: true,
      appliedMutations,
      createdOrders,
      orders: latestOrders,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
