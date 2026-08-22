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

export async function GET() {
  const user = await getUser();
  if (!user || user.role !== 'ADMIN') return new Response('Unauthorized', { status: 401 });

  try {
    const orders = await prisma.order.findMany({
      orderBy: [
        { priority: 'desc' },
        { enteredAt: 'desc' }
      ]
    });

    const exportData = orders.map(order => {
      const base = {
        'Order No': order.orderNo,
        'Status': order.status,
        'Priority': order.priority,
        'Location / Zone': order.zone || '',
        'Staging Dock / Bay': order.dockBay || '',
        'Transporter': order.transporter || '',
        'Vehicle No': order.vehicleNo || '',
        'Box Count': order.boxCount,
        'Weight (kg)': order.weightKg || '',
        'Invoice No': order.invoiceNo || '',
        'LR No': order.lrNo || '',
        'Notes': order.notes || '',
        'Entered By': order.enteredBy || '',
        'Entered At': order.enteredAt ? new Date(order.enteredAt).toLocaleString() : '',
        'Picked By': order.pickedBy || '',
        'Picked At': order.pickedAt ? new Date(order.pickedAt).toLocaleString() : '',
        'Packed By': order.packedBy || '',
        'Packed At': order.packedAt ? new Date(order.packedAt).toLocaleString() : '',
        'Dispatched At': order.dispatchedAt ? new Date(order.dispatchedAt).toLocaleString() : '',
        'Updated By': order.updatedBy || '',
        'Updated At': order.updatedAt ? new Date(order.updatedAt).toLocaleString() : ''
      };

      if (order.extra) {
        try {
          const extraJson = JSON.parse(order.extra);
          for (const [k, v] of Object.entries(extraJson)) {
            base[`[Raw] ${k}`] = v;
          }
        } catch {}
      }
      return base;
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Warehouse Orders");
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Log event
    await prisma.log.create({
      data: {
        name: user.name,
        role: user.role,
        action: 'Export Data',
        detail: `Exported ${orders.length} warehouse records to Excel`
      }
    });

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="warehouse_orders_export.xlsx"',
      },
    });
  } catch (error) {
    console.error('Export API Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
