import prisma from '@/lib/prisma';
import * as xlsx from 'xlsx';
import { getSessionUser, updateWorkerHeartbeat } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (user.role !== 'ADMIN' && user.permissions?.canExport !== true) {
    return new Response('Forbidden: Export permission required', { status: 403 });
  }

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
            const cleanKey = k.replace(/^\[Raw\]\s*/i, '');
            if (!(cleanKey in base)) {
              base[cleanKey] = v;
            }
          }
        } catch {}
      }
      return base;
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Warehouse Orders");
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await updateWorkerHeartbeat(user.userId, `Exported ${orders.length} orders to Excel manifest`);

    // Log event
    await prisma.log.create({
      data: {
        userId: user.userId,
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
