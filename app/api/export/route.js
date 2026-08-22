import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';
import * as xlsx from 'xlsx';

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

export async function GET(request) {
  const user = await getUser();
  if (!user || user.role !== 'ADMIN') return new Response('Unauthorized', { status: 401 });

  try {
    // Fix orderBy
    const ordersFixed = await prisma.order.findMany({
      orderBy: { enteredAt: 'desc' }
    });

    const exportData = ordersFixed.map(order => {
      const base = {
        'Order No': order.orderNo,
        'Invoice No': order.invoiceNo || '',
        'LR No': order.lrNo || '',
        'Sent': order.sent ? 'Yes' : 'No',
        'Notes': order.notes || '',
        'Entered By': order.enteredBy || '',
        'Entered At': order.enteredAt ? new Date(order.enteredAt).toLocaleString() : '',
        'Updated By': order.updatedBy || '',
        'Updated At': order.updatedAt ? new Date(order.updatedAt).toLocaleString() : ''
      };

      if (order.extra) {
        try {
          const extraJson = JSON.parse(order.extra);
          for (const [k, v] of Object.entries(extraJson)) {
            base[k] = v;
          }
        } catch(e) {}
      }
      return base;
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Orders");
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Log event
    await prisma.log.create({
      data: {
        name: user.name,
        role: user.role,
        action: 'Export Data',
        detail: `Exported ${ordersFixed.length} records to Excel`
      }
    });

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="orders_export.xlsx"',
      },
    });
  } catch (error) {
    console.error('Export API Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
