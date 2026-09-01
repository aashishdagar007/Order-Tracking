import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, updateWorkerHeartbeat } from '@/lib/auth';
import { bus } from '@/lib/eventBus';

/** Normalize an order number: trim whitespace, strip trailing .0 from Excel floats, uppercase */
function sanitizeOrderNo(raw) {
  let s = String(raw).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role === 'WORKER' && user.permissions?.canViewOrders === false) {
    return NextResponse.json({ error: 'Access denied: You do not have permission to view orders' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const orderNo = searchParams.get('orderNo');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const transporter = searchParams.get('transporter');
  const search = searchParams.get('search');
  const extraKey = searchParams.get('extraKey');   // Filter by an Excel column key
  const extraVal = searchParams.get('extraVal');   // ...with this value
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const page = parseInt(searchParams.get('page') || '1', 10);


  try {
    // Single order lookup
    if (orderNo && orderNo !== '_all') {
      const key = sanitizeOrderNo(orderNo);
      const rawTrimmed = String(orderNo).trim();
      let order = await prisma.order.findUnique({
        where: { orderNo: key },
        include: {
          events: {
            orderBy: { timestamp: 'asc' }
          }
        }
      });

      // Fallback: If not found by primary orderNo, search by invoiceNo, lrNo, or extra attributes
      if (!order && rawTrimmed) {
        order = await prisma.order.findFirst({
          where: {
            OR: [
              { invoiceNo: { contains: rawTrimmed } },
              { lrNo: { contains: rawTrimmed } },
              { extra: { contains: rawTrimmed } }
            ]
          },
          include: {
            events: {
              orderBy: { timestamp: 'asc' }
            }
          }
        });
      }

      return NextResponse.json({ order: order || null });
    }

    // Filtered list / All orders (Admin or Worker overview)
    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (priority && priority !== 'ALL') {
      where.priority = priority;
    }

    if (transporter && transporter !== 'ALL') {
      where.transporter = transporter;
    }

    if (search && search.trim()) {
      const query = search.trim();
      where.OR = [
        { orderNo: { contains: query } },
        { invoiceNo: { contains: query } },
        { lrNo: { contains: query } },
        { zone: { contains: query } },
        { transporter: { contains: query } },
        { vehicleNo: { contains: query } },
        { notes: { contains: query } },
        { skuList: { contains: query } },
        { extra: { contains: query } }
      ];
    }

    // Filter by a specific Excel column key/value stored in the extra JSON field
    // Uses a string-contains approach that works across all Prisma/SQLite setups
    if (extraKey && extraVal && extraVal.trim()) {
      const snippet = `"${extraKey}":"${extraVal.trim()}"`;
      const snippetAlt = `"${extraKey}": "${extraVal.trim()}"`;
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          { extra: { contains: snippet } },
          { extra: { contains: snippetAlt } }
        ]
      });
    }


    const total = await prisma.order.count({ where });
    const orders = await prisma.order.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { enteredAt: 'desc' }
      ],
      take: limit,
      skip: (page - 1) * limit,
      include: {
        events: {
          orderBy: { timestamp: 'desc' },
          take: 3
        }
      }
    });

    // Discover all unique Excel columns across the returned orders
    const excelColumnsSet = new Set();
    orders.forEach(o => {
      if (o.extra) {
        try {
          const parsed = JSON.parse(o.extra);
          Object.keys(parsed).forEach(k => excelColumnsSet.add(k));
        } catch {}
      }
    });

    return NextResponse.json({
      orders,
      availableExcelColumns: Array.from(excelColumnsSet),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Order GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role === 'WORKER' && user.permissions?.canPickPack === false) {
    return NextResponse.json({ error: 'Access denied: You do not have permission to add orders' }, { status: 403 });
  }

  try {
    const data = await request.json();
    if (!data.orderNo || !String(data.orderNo).trim()) {
      return NextResponse.json({ error: 'Order number is required' }, { status: 400 });
    }
    const orderNo = sanitizeOrderNo(data.orderNo);

    const existing = await prisma.order.findUnique({ where: { orderNo } });
    if (existing) return NextResponse.json({ error: 'Order already exists' }, { status: 400 });

    const status = data.status || 'RECEIVED';
    const isDispatched = status === 'DISPATCHED' || data.sent === true || data.sent === 'yes' || data.sent === 'true';

    if (isDispatched && user.role === 'WORKER' && user.permissions?.canDispatch === false) {
      return NextResponse.json({ error: 'Access denied: You do not have dispatch clearance' }, { status: 403 });
    }

    const newOrder = await prisma.order.create({
      data: {
        orderNo,
        invoiceNo: data.invoiceNo || null,
        lrNo: data.lrNo || null,
        sent: isDispatched,
        status: isDispatched ? 'DISPATCHED' : status,
        priority: data.priority || 'STANDARD',
        zone: data.zone || null,
        dockBay: data.dockBay || null,
        transporter: data.transporter || null,
        vehicleNo: data.vehicleNo || null,
        boxCount: parseInt(data.boxCount || '1', 10) || 1,
        weightKg: data.weightKg ? parseFloat(data.weightKg) : null,
        notes: data.notes || null,
        extra: data.extra ? (typeof data.extra === 'string' ? data.extra : JSON.stringify(data.extra)) : null,
        enteredBy: user.name,
        dispatchedAt: isDispatched ? new Date() : null,
        events: {
          create: {
            status: isDispatched ? 'DISPATCHED' : status,
            actorName: user.name,
            actorRole: user.role,
            note: data.notes ? `Created: ${data.notes}` : 'Order registered in warehouse'
          }
        }
      },
      include: {
        events: true
      }
    });

    await updateWorkerHeartbeat(user.userId, `Registered new order ${orderNo}`);

    await prisma.log.create({
      data: {
        userId: user.userId,
        name: user.name,
        role: user.role,
        action: 'Add Order',
        detail: `Added order ${orderNo} (${newOrder.status}, Priority: ${newOrder.priority})`
      }
    });

    // Broadcast real-time event to WebSocket clients
    bus.emit('order_update', {
      type: 'ORDER_CREATED',
      order: newOrder,
      actorName: user.name,
      actorRole: user.role,
    });

    return NextResponse.json({ order: newOrder });
  } catch (error) {
    console.error('Order POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await request.json();

    // ── Batch Status Update Support ──
    if (Array.isArray(data.ids) && data.ids.length > 0) {
      if (user.role === 'WORKER' && user.permissions?.canPickPack === false) {
        return NextResponse.json({ error: 'Access denied: You do not have processing permissions' }, { status: 403 });
      }

      const { ids, status: batchStatus, transporter, vehicleNo, dockBay, note } = data;

      if (batchStatus === 'DISPATCHED' && user.role === 'WORKER' && user.permissions?.canDispatch === false) {
        return NextResponse.json({ error: 'Access denied: You do not have dispatch clearance' }, { status: 403 });
      }

      const now = new Date();
      const updatePayload = {
        updatedBy: user.name,
      };

      if (batchStatus) {
        updatePayload.status = batchStatus;
        if (batchStatus === 'DISPATCHED') {
          updatePayload.sent = true;
          updatePayload.dispatchedAt = now;
        } else {
          updatePayload.sent = false;
        }
        if (batchStatus === 'PICKING') {
          updatePayload.pickedBy = user.name;
          updatePayload.pickedAt = now;
        }
        if (batchStatus === 'PACKING') {
          updatePayload.packedBy = user.name;
          updatePayload.packedAt = now;
        }
      }

      if (transporter !== undefined) updatePayload.transporter = transporter || null;
      if (vehicleNo !== undefined) updatePayload.vehicleNo = vehicleNo || null;
      if (dockBay !== undefined) updatePayload.dockBay = dockBay || null;

      await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: updatePayload
      });

      // Record events for each updated order
      if (batchStatus) {
        const eventsData = ids.map(orderId => ({
          orderId,
          status: batchStatus,
          actorName: user.name,
          actorRole: user.role,
          note: note || `Bulk updated to ${batchStatus}`
        }));

        await prisma.orderEvent.createMany({
          data: eventsData
        });
      }

      await updateWorkerHeartbeat(user.userId, `Batch updated ${ids.length} orders to ${batchStatus || 'new state'}`);

      await prisma.log.create({
        data: {
          userId: user.userId,
          name: user.name,
          role: user.role,
          action: 'Batch Update',
          detail: `Updated ${ids.length} orders to ${batchStatus || 'new settings'}`
        }
      });

      // Broadcast batch update event
      bus.emit('order_update', {
        type: 'BATCH_UPDATE',
        ids,
        status: batchStatus,
        actorName: user.name,
        actorRole: user.role,
      });

      return NextResponse.json({ success: true, count: ids.length });
    }

    // ── Single Order Update ──
    const { id } = data;
    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const currentOrder = await prisma.order.findUnique({ where: { id } });
    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const targetStatus = data.status || currentOrder.status;
    const isStatusChanging = data.status && data.status !== currentOrder.status;

    if (user.role === 'WORKER') {
      if (targetStatus === 'DISPATCHED' && user.permissions?.canDispatch === false) {
        return NextResponse.json({ error: 'Access denied: You do not have dispatch clearance' }, { status: 403 });
      }
      if (isStatusChanging && user.permissions?.canPickPack === false) {
        return NextResponse.json({ error: 'Access denied: You do not have picking/packing permissions' }, { status: 403 });
      }
    }

    const now = new Date();
    const updateData = {
      invoiceNo: data.invoiceNo !== undefined ? (data.invoiceNo || null) : undefined,
      lrNo: data.lrNo !== undefined ? (data.lrNo || null) : undefined,
      priority: data.priority !== undefined ? data.priority : undefined,
      zone: data.zone !== undefined ? (data.zone || null) : undefined,
      dockBay: data.dockBay !== undefined ? (data.dockBay || null) : undefined,
      transporter: data.transporter !== undefined ? (data.transporter || null) : undefined,
      vehicleNo: data.vehicleNo !== undefined ? (data.vehicleNo || null) : undefined,
      boxCount: data.boxCount !== undefined ? parseInt(data.boxCount, 10) : undefined,
      weightKg: data.weightKg !== undefined ? (data.weightKg ? parseFloat(data.weightKg) : null) : undefined,
      notes: data.notes !== undefined ? (data.notes || null) : undefined,
      extra: data.extra !== undefined ? (typeof data.extra === 'string' ? data.extra : JSON.stringify(data.extra)) : undefined,
      updatedBy: user.name,
    };

    if (data.status !== undefined) {
      updateData.status = targetStatus;
      if (targetStatus === 'DISPATCHED') {
        updateData.sent = true;
        updateData.dispatchedAt = now;
      } else {
        updateData.sent = false;
      }
      if (targetStatus === 'PICKING' && !currentOrder.pickedAt) {
        updateData.pickedBy = user.name;
        updateData.pickedAt = now;
      }
      if (targetStatus === 'PACKING' && !currentOrder.packedAt) {
        updateData.packedBy = user.name;
        updateData.packedAt = now;
      }
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        events: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    // Record Event if status changed or note provided
    if (isStatusChanging || data.eventNote) {
      const event = await prisma.orderEvent.create({
        data: {
          orderId: id,
          status: targetStatus,
          actorName: user.name,
          actorRole: user.role,
          note: data.eventNote || (isStatusChanging ? `Status changed to ${targetStatus}` : 'Order details updated')
        }
      });
      updatedOrder.events.push(event);
    }

    await updateWorkerHeartbeat(user.userId, `Processed order ${updatedOrder.orderNo} (${updatedOrder.status})`);

    await prisma.log.create({
      data: {
        userId: user.userId,
        name: user.name,
        role: user.role,
        action: 'Edit Order',
        detail: `Updated order ${updatedOrder.orderNo} (Status: ${updatedOrder.status})`
      }
    });

    // Broadcast real-time event to WebSocket clients
    bus.emit('order_update', {
      type: 'STATUS_CHANGE',
      order: updatedOrder,
      orderId: updatedOrder.id,
      orderNo: updatedOrder.orderNo,
      newStatus: updatedOrder.status,
      actorName: user.name,
      actorRole: user.role,
    });

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error('Order PUT Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
