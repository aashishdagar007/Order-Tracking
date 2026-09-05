import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, updateWorkerHeartbeat } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orderIds, status, dockBay, transporter, vehicleNo, note } = await request.json();

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'No order IDs provided' }, { status: 400 });
    }

    const now = new Date();
    const updateData = {
      updatedBy: session.name,
      updatedAt: now
    };

    if (status) {
      updateData.status = status;
      if (status === 'PICKING') {
        updateData.pickedBy = session.name;
        updateData.pickedAt = now;
      } else if (status === 'PACKING') {
        updateData.packedBy = session.name;
        updateData.packedAt = now;
      } else if (status === 'DISPATCHED') {
        updateData.dispatchedAt = now;
        updateData.sent = true;
      }
    }

    if (dockBay) updateData.dockBay = dockBay;
    if (transporter) updateData.transporter = transporter;
    if (vehicleNo) updateData.vehicleNo = vehicleNo;

    // Transaction for all orders & events
    const results = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: updateData
      });

      // Create OrderEvent for each order
      const eventData = orderIds.map(id => ({
        orderId: id,
        status: status || 'BATCH_UPDATE',
        actorName: session.name,
        actorRole: session.role,
        note: note || `Batch wave update (${orderIds.length} orders)`
      }));

      await tx.orderEvent.createMany({
        data: eventData
      });

      // Add log
      await tx.log.create({
        data: {
          name: session.name,
          role: session.role,
          action: `BATCH_UPDATE_${status || 'MODIFIED'}`,
          detail: `Updated ${orderIds.length} orders to ${status || 'updated fields'}`
        }
      });

      return updated;
    });

    if (session.userId) {
      await updateWorkerHeartbeat(session.userId, `Wave updated ${orderIds.length} orders to ${status || 'staged'}`);
    }

    return NextResponse.json({
      success: true,
      count: results.count,
      status
    });
  } catch (error) {
    console.error('Batch update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
