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

/** Normalise an order number consistently with orders/route.js */
function sanitizeOrderNo(raw) {
  let s = String(raw).trim();
  // Excel sometimes converts numeric IDs to floats: "8603005734.0" → "8603005734"
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

/** Normalise a column header for flexible matching */
function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s_\-\.]+/g, '');
}

/** Map a raw column to a known field or 'extra' */
function mapColumn(rawKey, rawValue) {
  const k = normalizeKey(rawKey);
  const v = String(rawValue).trim();

  // Order Number — covers: "Order Number", "OrderNo", "Order No", "Order_No", "OrderID", "Order ID", "Order"
  if (['orderno', 'ordernumber', 'orderid', 'order'].includes(k)) {
    return { field: 'orderNo', value: sanitizeOrderNo(rawValue) };
  }
  // Invoice — covers: "Invoice No.", "Invoice No", "InvoiceNo", "Invoice Number", "Invoice"
  if (['invoiceno', 'invoicenumber', 'invoice'].includes(k)) {
    return { field: 'invoiceNo', value: v };
  }
  // LR — covers: "Lr Number", "LR No", "LrNo", "LR", "Lr Num"
  if (['lrno', 'lrnumber', 'lr', 'lrnum'].includes(k)) {
    return { field: 'lrNo', value: v };
  }
  // Status / Sent
  if (['status', 'sent', 'dispatched', 'shipmentstatus'].includes(k)) {
    const lower = v.toLowerCase();
    const isSent = ['yes', 'true', 'dispatched', 'done', 'delivered', '1', 'completed'].includes(lower);
    return { field: 'sent', value: isSent };
  }
  // Notes
  if (['notes', 'note', 'remarks', 'remark', 'comment', 'comments'].includes(k)) {
    return { field: 'notes', value: v };
  }
  // Everything else → extra (keep original header for display)
  return { field: 'extra', value: v, key: rawKey };
}

export async function POST(request) {
  const user = await getUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    if (workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'No sheets found in Excel file' }, { status: 400 });
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawData.length === 0) {
      return NextResponse.json({ error: 'Excel file has no data rows' }, { status: 400 });
    }

    // Log discovered column headers for debugging
    const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
    const headerMap = headers.map(h => `"${h}"→${mapColumn(h, '').field}`).join(', ');
    console.log(`[Upload] Columns detected: ${headerMap}`);

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rawData) {
      let orderNo = '';
      const parsed = { invoiceNo: null, lrNo: null, sent: false, notes: null, extra: {} };
      let hasSentValue = false;

      for (const [rawKey, rawValue] of Object.entries(row)) {
        // Skip empty cells
        if (rawValue === '' || rawValue === null || rawValue === undefined) continue;

        const mapped = mapColumn(rawKey, rawValue);
        if (mapped.field === 'orderNo') {
          orderNo = mapped.value;
        } else if (mapped.field === 'invoiceNo') {
          parsed.invoiceNo = mapped.value;
        } else if (mapped.field === 'lrNo') {
          parsed.lrNo = mapped.value;
        } else if (mapped.field === 'sent') {
          parsed.sent = mapped.value;
          hasSentValue = true;
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
        // Merge: only fill fields that are currently blank, never overwrite
        const updateData = { updatedBy: `${user.name} (upload)` };
        if (!existing.invoiceNo && parsed.invoiceNo) updateData.invoiceNo = parsed.invoiceNo;
        if (!existing.lrNo && parsed.lrNo) updateData.lrNo = parsed.lrNo;
        if (!existing.notes && parsed.notes) updateData.notes = parsed.notes;
        if (!existing.sent && hasSentValue && parsed.sent) updateData.sent = true;

        // Merge extra fields (only add missing keys)
        let mergedExtra = {};
        try { mergedExtra = existing.extra ? JSON.parse(existing.extra) : {}; } catch {}
        for (const [k, v] of Object.entries(parsed.extra)) {
          if (!(k in mergedExtra)) mergedExtra[k] = v;
        }
        updateData.extra = JSON.stringify(mergedExtra);

        await prisma.order.update({ where: { id: existing.id }, data: updateData });
        updatedCount++;
      } else {
        await prisma.order.create({
          data: {
            orderNo,
            invoiceNo: parsed.invoiceNo || null,
            lrNo: parsed.lrNo || null,
            sent: parsed.sent || false,
            notes: parsed.notes || null,
            extra: Object.keys(parsed.extra).length > 0 ? JSON.stringify(parsed.extra) : null,
            enteredBy: `${user.name} (Excel)`,
          }
        });
        addedCount++;
      }
    }

    console.log(`[Upload] Done: ${addedCount} added, ${updatedCount} updated, ${skippedCount} skipped`);

    await prisma.log.create({
      data: {
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
