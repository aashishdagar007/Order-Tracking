import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key-change-in-production');

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

/** Normalise an order number: trim whitespace, strip trailing .0 from Excel floats, uppercase */
function sanitizeOrderNo(raw) {
  let s = String(raw).trim();
  // Excel sometimes converts numeric order IDs to floats: "8603005734.0" → "8603005734"
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

export async function GET(request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orderNo = searchParams.get('orderNo');
  if (!orderNo) return NextResponse.json({ error: 'orderNo is required' }, { status: 400 });

  // Admin: support listing all orders if orderNo === '_all'
  if (orderNo === '_all' && user.role === 'ADMIN') {
    const orders = await prisma.order.findMany({ orderBy: { enteredAt: 'desc' } });
    return NextResponse.json({ orders });
  }

  try {
    const key = sanitizeOrderNo(orderNo);
    const order = await prisma.order.findUnique({ where: { orderNo: key } });
    return NextResponse.json({ order: order || null });
  } catch (error) {
    console.error('Order GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await request.json();
    if (!data.orderNo || !String(data.orderNo).trim()) {
      return NextResponse.json({ error: 'Order number is required' }, { status: 400 });
    }
    const orderNo = sanitizeOrderNo(data.orderNo);

    const existing = await prisma.order.findUnique({ where: { orderNo } });
    if (existing) return NextResponse.json({ error: 'Order already exists' }, { status: 400 });

    const newOrder = await prisma.order.create({
      data: {
        orderNo,
        invoiceNo: data.invoiceNo || null,
        lrNo: data.lrNo || null,
        sent: data.sent === true || data.sent === 'Yes' || data.sent === 'yes' || data.sent === 'true',
        notes: data.notes || null,
        extra: data.extra ? JSON.stringify(data.extra) : null,
        enteredBy: user.name,
      }
    });

    await prisma.log.create({
      data: { name: user.name, role: user.role, action: 'Add Order', detail: `Added order ${orderNo}` }
    });

    return NextResponse.json({ order: newOrder });
  } catch (error) {
    console.error('Order POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  const user = await getUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await request.json();
    const { id } = data;
    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        invoiceNo: data.invoiceNo !== undefined ? (data.invoiceNo || null) : undefined,
        lrNo: data.lrNo !== undefined ? (data.lrNo || null) : undefined,
        sent: data.sent !== undefined ? (data.sent === true || data.sent === 'yes' || data.sent === 'true') : undefined,
        notes: data.notes !== undefined ? (data.notes || null) : undefined,
        extra: data.extra !== undefined ? (typeof data.extra === 'string' ? data.extra : JSON.stringify(data.extra)) : undefined,
        updatedBy: user.name,
      }
    });

    await prisma.log.create({
      data: { name: user.name, role: user.role, action: 'Edit Order', detail: `Edited order ${updatedOrder.orderNo}` }
    });

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error('Order PUT Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
