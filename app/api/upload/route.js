import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as xlsx from 'xlsx';
import { getSessionUser, updateWorkerHeartbeat } from '@/lib/auth';

/** Normalize an order number */
function sanitizeOrderNo(raw) {
  let s = String(raw).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

/** Normalize a column header for flexible matching */
function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s_\-\.]+/g, '');
}

/** Normalize workflow status */
function normalizeStatus(raw) {
  const s = String(raw).trim().toUpperCase();
  if (['DISPATCHED', 'SENT', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'YES', '1'].includes(s)) return 'DISPATCHED';
  if (['PICKING', 'PICKED', 'INPICKING'].includes(s)) return 'PICKING';
  if (['PACKING', 'PACKED', 'INPACKING', 'BOXED'].includes(s)) return 'PACKING';
  if (['QUALITY_CHECK', 'QC', 'INSPECTION', 'CHECK'].includes(s)) return 'QUALITY_CHECK';
  if (['STAGED', 'READY', 'READYTODISPATCH', 'DOCK'].includes(s)) return 'STAGED';
  if (['HOLD', 'ON_HOLD', 'ONHOLD', 'PAUSED', 'BLOCKED'].includes(s)) return 'ON_HOLD';
  return 'RECEIVED';
}

/** Normalize priority */
function normalizePriority(raw) {
  const p = String(raw).trim().toUpperCase();
  if (['URGENT', 'HIGH', 'CRITICAL', 'TOP'].includes(p)) return 'URGENT';
  if (['EXPRESS', 'MEDIUM', 'FAST', 'PRIORITY'].includes(p)) return 'EXPRESS';
  return 'STANDARD';
}

/** Map a raw column to a known field or 'extra' */
function mapColumn(rawKey, rawValue) {
  const k = normalizeKey(rawKey);
  const v = String(rawValue).trim();

  // Order Number
  if (['orderno', 'ordernumber', 'orderid', 'order', 'pono', 'wono'].includes(k)) {
    return { field: 'orderNo', value: sanitizeOrderNo(rawValue) };
  }
  // Invoice
  if (['invoiceno', 'invoicenumber', 'invoice', 'billno'].includes(k)) {
    return { field: 'invoiceNo', value: v };
  }
  // LR
  if (['lrno', 'lrnumber', 'lr', 'lrnum', 'docketno', 'awb', 'consignmentno'].includes(k)) {
    return { field: 'lrNo', value: v };
  }
  // Status / Workflow
  if (['status', 'stage', 'fulfillment', 'shipmentstatus', 'state', 'sent'].includes(k)) {
    return { field: 'status', value: normalizeStatus(v) };
  }
  // Priority
  if (['priority', 'urgency', 'level', 'ordertype', 'prioritylevel'].includes(k)) {
    return { field: 'priority', value: normalizePriority(v) };
  }
  // Warehouse Zone / Location
  if (['zone', 'location', 'rack', 'shelf', 'bin', 'aisle', 'storage', 'warehouselocation'].includes(k)) {
    return { field: 'zone', value: v };
  }
  // Dock / Staging Bay
  if (['dock', 'bay', 'dockbay', 'dockdoor', 'gate', 'stagingbay'].includes(k)) {
    return { field: 'dockBay', value: v };
  }
  // Transporter / Carrier
  if (['transporter', 'carrier', 'courier', 'transport', 'logistics', 'shippingcompany', 'partner'].includes(k)) {
    return { field: 'transporter', value: v };
  }
  // Vehicle / Truck No
  if (['vehicleno', 'vehicle', 'truckno', 'truck', 'lorryno', 'plateno', 'carnumber'].includes(k)) {
    return { field: 'vehicleNo', value: v.toUpperCase() };
  }
  // Box / Package Count
  if (['boxcount', 'boxes', 'packages', 'packagecount', 'qty', 'cartons', 'units', 'box'].includes(k)) {
    return { field: 'boxCount', value: parseInt(v, 10) || 1 };
  }
  // Weight
  if (['weight', 'weightkg', 'grossweight', 'netweight', 'kg', 'totalweight'].includes(k)) {
    return { field: 'weightKg', value: parseFloat(v) || null };
  }
  // Notes
  if (['notes', 'note', 'remarks', 'remark', 'comment', 'comments'].includes(k)) {
    return { field: 'notes', value: v };
  }

  // Everything else → extra
  return { field: 'extra', value: v, key: rawKey };
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN' && user.permissions?.canUpload !== true) {
    return NextResponse.json({ error: 'Access denied: You do not have Excel upload permission' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(buffer), { type: 'buffer' });
    if (workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'No sheets found in Excel file' }, { status: 400 });
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawData.length === 0) {
      return NextResponse.json({ error: 'Excel file has no data rows' }, { status: 400 });
    }

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rawData) {
      let orderNo = '';
      const parsed = {
        invoiceNo: null,
        lrNo: null,
        status: 'RECEIVED',
        priority: 'STANDARD',
        zone: null,
        dockBay: null,
        transporter: null,
        vehicleNo: null,
        boxCount: 1,
        weightKg: null,
        notes: null,
        extra: {}
      };
      let hasStatusValue = false;

      for (const [rawKey, rawValue] of Object.entries(row)) {
        if (rawValue === '' || rawValue === null || rawValue === undefined) continue;

        const mapped = mapColumn(rawKey, rawValue);
        if (mapped.field === 'orderNo') {
          orderNo = mapped.value;
        } else if (mapped.field === 'status') {
          parsed.status = mapped.value;
          hasStatusValue = true;
        } else if (mapped.field === 'priority') {
          parsed.priority = mapped.value;
        } else if (mapped.field === 'zone') {
          parsed.zone = mapped.value;
        } else if (mapped.field === 'dockBay') {
          parsed.dockBay = mapped.value;
        } else if (mapped.field === 'transporter') {
          parsed.transporter = mapped.value;
        } else if (mapped.field === 'vehicleNo') {
          parsed.vehicleNo = mapped.value;
        } else if (mapped.field === 'boxCount') {
          parsed.boxCount = mapped.value;
        } else if (mapped.field === 'weightKg') {
          parsed.weightKg = mapped.value;
        } else if (mapped.field === 'invoiceNo') {
          parsed.invoiceNo = mapped.value;
        } else if (mapped.field === 'lrNo') {
          parsed.lrNo = mapped.value;
        } else if (mapped.field === 'notes') {
          parsed.notes = mapped.value;
        } else if (mapped.field === 'extra' && mapped.value) {
          parsed.extra[mapped.key] = mapped.value;
        }
      }

      if (!orderNo) {
        skippedCount++;
        continue;
      }

      const existing = await prisma.order.findUnique({ where: { orderNo } });

      if (existing) {
        // Merge: fill in missing fields without destructive overwriting
        const updateData = { updatedBy: `${user.name} (upload)` };
        if (!existing.invoiceNo && parsed.invoiceNo) updateData.invoiceNo = parsed.invoiceNo;
        if (!existing.lrNo && parsed.lrNo) updateData.lrNo = parsed.lrNo;
        if (!existing.zone && parsed.zone) updateData.zone = parsed.zone;
        if (!existing.dockBay && parsed.dockBay) updateData.dockBay = parsed.dockBay;
        if (!existing.transporter && parsed.transporter) updateData.transporter = parsed.transporter;
        if (!existing.vehicleNo && parsed.vehicleNo) updateData.vehicleNo = parsed.vehicleNo;
        if (!existing.weightKg && parsed.weightKg) updateData.weightKg = parsed.weightKg;
        if (!existing.notes && parsed.notes) updateData.notes = parsed.notes;

        if (existing.status === 'RECEIVED' && hasStatusValue && parsed.status !== 'RECEIVED') {
          updateData.status = parsed.status;
          if (parsed.status === 'DISPATCHED') {
            updateData.sent = true;
            updateData.dispatchedAt = new Date();
          }
        }

        // Merge extra fields
        let mergedExtra = {};
        try { mergedExtra = existing.extra ? JSON.parse(existing.extra) : {}; } catch {}
        for (const [k, v] of Object.entries(parsed.extra)) {
          if (!(k in mergedExtra)) mergedExtra[k] = v;
        }
        updateData.extra = Object.keys(mergedExtra).length > 0 ? JSON.stringify(mergedExtra) : null;

        await prisma.order.update({ where: { id: existing.id }, data: updateData });
        updatedCount++;
      } else {
        const isDispatched = parsed.status === 'DISPATCHED';
        await prisma.order.create({
          data: {
            orderNo,
            invoiceNo: parsed.invoiceNo || null,
            lrNo: parsed.lrNo || null,
            sent: isDispatched,
            status: parsed.status,
            priority: parsed.priority || 'STANDARD',
            zone: parsed.zone || null,
            dockBay: parsed.dockBay || null,
            transporter: parsed.transporter || null,
            vehicleNo: parsed.vehicleNo || null,
            boxCount: parsed.boxCount || 1,
            weightKg: parsed.weightKg || null,
            notes: parsed.notes || null,
            extra: Object.keys(parsed.extra).length > 0 ? JSON.stringify(parsed.extra) : null,
            enteredBy: `${user.name} (Excel)`,
            dispatchedAt: isDispatched ? new Date() : null,
            events: {
              create: {
                status: parsed.status,
                actorName: user.name,
                actorRole: user.role,
                note: `Imported via Excel: ${file.name}`
              }
            }
          }
        });
        addedCount++;
      }
    }

    await updateWorkerHeartbeat(user.userId, `Uploaded Excel file "${file.name}" (${addedCount} added, ${updatedCount} updated)`);

    await prisma.log.create({
      data: {
        userId: user.userId,
        name: user.name,
        role: user.role,
        action: 'Excel Upload',
        detail: `Uploaded "${file.name}": ${addedCount} added, ${updatedCount} updated, ${skippedCount} skipped`
      }
    });

    return NextResponse.json({ success: true, added: addedCount, updated: updatedCount, skipped: skippedCount });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return NextResponse.json({ error: `Failed to process Excel file: ${error.message}` }, { status: 500 });
  }
}
