import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as xlsx from 'xlsx';
import { getSessionUser, updateWorkerHeartbeat } from '@/lib/auth';

/** Normalize an order number */
function sanitizeOrderNo(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

/** Normalize a column header for flexible matching: strips all symbols, spaces, dashes */
function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Normalize workflow status */
function normalizeStatus(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (['DISPATCHED', 'SENT', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'YES', '1', 'DONE'].includes(s)) return 'DISPATCHED';
  if (['PICKING', 'PICKED', 'INPICKING', 'PICK'].includes(s)) return 'PICKING';
  if (['PACKING', 'PACKED', 'INPACKING', 'BOXED', 'PACK'].includes(s)) return 'PACKING';
  if (['QUALITY_CHECK', 'QC', 'INSPECTION', 'CHECK', 'QUALITY'].includes(s)) return 'QUALITY_CHECK';
  if (['STAGED', 'READY', 'READYTODISPATCH', 'DOCK', 'STAGE'].includes(s)) return 'STAGED';
  if (['HOLD', 'ON_HOLD', 'ONHOLD', 'PAUSED', 'BLOCKED', 'CANCELLED'].includes(s)) return 'ON_HOLD';
  return 'RECEIVED';
}

/** Normalize priority */
function normalizePriority(raw) {
  const p = String(raw || '').trim().toUpperCase();
  if (['URGENT', 'HIGH', 'CRITICAL', 'TOP', 'RUSH', 'HOT'].includes(p)) return 'URGENT';
  if (['EXPRESS', 'MEDIUM', 'FAST', 'PRIORITY', 'AIR'].includes(p)) return 'EXPRESS';
  return 'STANDARD';
}

/** Map a raw column to a known field or keep as extra */
function mapColumn(rawKey, rawValue, customMapping = {}) {
  const cleanKey = String(rawKey || '').trim();
  const k = normalizeKey(cleanKey);
  const v = String(rawValue !== null && rawValue !== undefined ? rawValue : '').trim();

  // If user provided a specific custom mapping from preview UI
  if (customMapping && customMapping[cleanKey]) {
    const target = customMapping[cleanKey];
    if (target === 'orderNo') return { field: 'orderNo', value: sanitizeOrderNo(v) };
    if (target === 'status') return { field: 'status', value: normalizeStatus(v) };
    if (target === 'priority') return { field: 'priority', value: normalizePriority(v) };
    if (target === 'customer') return { field: 'customer', value: v, key: cleanKey };
    if (target === 'destination') return { field: 'destination', value: v, key: cleanKey };
    if (target === 'zone') return { field: 'zone', value: v };
    if (target === 'dockBay') return { field: 'dockBay', value: v };
    if (target === 'transporter') return { field: 'transporter', value: v };
    if (target === 'vehicleNo') return { field: 'vehicleNo', value: v.toUpperCase() };
    if (target === 'boxCount') return { field: 'boxCount', value: parseInt(v, 10) || 1 };
    if (target === 'weightKg') return { field: 'weightKg', value: parseFloat(v) || null };
    if (target === 'invoiceNo') return { field: 'invoiceNo', value: v };
    if (target === 'lrNo') return { field: 'lrNo', value: v };
    if (target === 'notes') return { field: 'notes', value: v };
    if (target === 'skuList') return { field: 'skuList', value: v, key: cleanKey };
  }

  // Auto-detection rules:

  // 1. Order Number / Primary Identifier
  if ([
    'orderno', 'ordernumber', 'orderid', 'order', 'ordernum', 'order#',
    'pono', 'ponumber', 'po#', 'wono', 'wonumber', 'jobno', 'jobnumber',
    'referenceno', 'referencenumber', 'refno', 'refnum', 'ref#', 'reference',
    'bookingno', 'bookingid', 'sonumber', 'sono', 'so#', 'salesorder',
    'challanno', 'challannumber', 'challan#', 'docno', 'documentno',
    'serialno', 'srno', 'sno', 'id', 'trackingid'
  ].includes(k)) {
    return { field: 'orderNo', value: sanitizeOrderNo(rawValue) };
  }

  // 2. Invoice
  if (['invoiceno', 'invoicenumber', 'invoice', 'invoice#', 'billno', 'billnumber', 'bill#', 'taxinvoice'].includes(k)) {
    return { field: 'invoiceNo', value: v };
  }

  // 3. LR / Tracking / Consignment / AWB
  if ([
    'lrno', 'lrnumber', 'lr#', 'lr', 'lrnum', 'docketno', 'docketnumber', 'docket#', 'docket',
    'awb', 'awbno', 'awbnumber', 'awb#', 'consignmentno', 'consignmentnumber', 'consignment#', 'consignment',
    'trackingnumber', 'trackingno', 'tracking#', 'tracking', 'waybill', 'waybillno'
  ].includes(k)) {
    return { field: 'lrNo', value: v };
  }

  // 4. Status / Workflow Stage
  if (['status', 'stage', 'fulfillment', 'shipmentstatus', 'orderstatus', 'dispatchstatus', 'state', 'sent'].includes(k)) {
    return { field: 'status', value: normalizeStatus(v) };
  }

  // 5. Priority
  if (['priority', 'urgency', 'level', 'ordertype', 'prioritylevel', 'type'].includes(k)) {
    return { field: 'priority', value: normalizePriority(v) };
  }

  // 6. Transporter / Carrier / Courier
  if (['transporter', 'carrier', 'courier', 'transport', 'logistics', 'shippingcompany', 'partner', 'vendor', 'vehicletransporter'].includes(k)) {
    return { field: 'transporter', value: v };
  }

  // 7. Vehicle / Truck Number
  if (['vehicleno', 'vehicle', 'truckno', 'truck', 'lorryno', 'plateno', 'carnumber', 'regno', 'registrationno'].includes(k)) {
    return { field: 'vehicleNo', value: v.toUpperCase() };
  }

  // 8. Box / Package Count / Qty
  if (['boxcount', 'boxes', 'packages', 'packagecount', 'qty', 'quantity', 'cartons', 'units', 'pieces', 'pcs', 'box', 'pkgs'].includes(k)) {
    return { field: 'boxCount', value: parseInt(v, 10) || 1 };
  }

  // 9. Weight
  if (['weight', 'weightkg', 'grossweight', 'netweight', 'kg', 'totalweight', 'actualweight', 'chargedweight'].includes(k)) {
    return { field: 'weightKg', value: parseFloat(v) || null };
  }

  // 10. Warehouse Location / Zone / Rack
  if (['zone', 'warehousezone', 'rack', 'shelf', 'bin', 'aisle', 'storage', 'warehouselocation'].includes(k)) {
    return { field: 'zone', value: v };
  }

  // 11. Dock / Bay Door
  if (['dock', 'bay', 'dockbay', 'dockdoor', 'gate', 'stagingbay', 'docklocation'].includes(k)) {
    return { field: 'dockBay', value: v };
  }

  // 12. Notes / Remarks
  if (['notes', 'note', 'remarks', 'remark', 'comment', 'comments', 'specialinstructions', 'instruction'].includes(k)) {
    return { field: 'notes', value: v };
  }

  // 13. Customer / Consignee / Party
  if (['customer', 'customername', 'party', 'partyname', 'consignee', 'consigneename', 'buyer', 'buyername', 'client', 'clientname', 'recipient'].includes(k)) {
    return { field: 'customer', value: v, key: cleanKey };
  }

  // 14. Destination / City / Address
  if (['destination', 'city', 'state', 'deliverycity', 'deliverylocation', 'location', 'address', 'shippingaddress', 'deliveryaddress', 'dest', 'pincode'].includes(k)) {
    return { field: 'destination', value: v, key: cleanKey };
  }

  // 15. Item / SKU / Description
  if (['item', 'items', 'itemname', 'itemdescription', 'product', 'products', 'productname', 'sku', 'skuname', 'description', 'material', 'particulars'].includes(k)) {
    return { field: 'skuList', value: v, key: cleanKey };
  }

  // Everything else → extra
  return { field: 'extra', value: v, key: cleanKey };
}

/**
 * Robustly find true header row index in raw 2D array of sheet data
 */
function detectHeaderRow(rows2D) {
  if (!rows2D || rows2D.length === 0) return 0;
  let bestRowIdx = 0;
  let maxCols = 0;

  for (let i = 0; i < Math.min(rows2D.length, 10); i++) {
    const row = rows2D[i];
    if (!Array.isArray(row)) continue;
    const nonEmpty = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim().length > 0).length;
    if (nonEmpty > maxCols) {
      maxCols = nonEmpty;
      bestRowIdx = i;
    }
  }
  return bestRowIdx;
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

    let customMapping = {};
    const mappingRaw = formData.get('mapping');
    if (mappingRaw) {
      try { customMapping = JSON.parse(mappingRaw); } catch {}
    }

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(buffer), { type: 'buffer' });
    if (workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'No sheets found in Excel file' }, { status: 400 });
    }

    // Default to first sheet or specified sheet
    const sheetName = formData.get('sheetName') || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];

    // Read as 2D array to accurately detect headers
    const rows2D = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rows2D.length === 0) {
      return NextResponse.json({ error: 'Excel sheet has no rows' }, { status: 400 });
    }

    const headerRowIdx = detectHeaderRow(rows2D);
    const headerRow = rows2D[headerRowIdx].map(h => String(h || '').trim());
    const dataRows = rows2D.slice(headerRowIdx + 1);

    if (dataRows.length === 0) {
      return NextResponse.json({ error: 'Excel sheet has headers but no data rows' }, { status: 400 });
    }

    let addedCount = 0;
    let updatedCount = 0;
    let fallbackCount = 0;

    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const rowArr = dataRows[rIdx];
      // Skip purely empty rows
      if (!rowArr || rowArr.every(c => c === '' || c === null || c === undefined)) {
        continue;
      }

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
        skuList: null,
        extra: {}
      };
      let hasStatusValue = false;
      let firstNonEmptyCell = null;

      for (let cIdx = 0; cIdx < headerRow.length; cIdx++) {
        const rawKey = headerRow[cIdx] || `Column_${cIdx + 1}`;
        const rawValue = rowArr[cIdx];
        if (rawValue === '' || rawValue === null || rawValue === undefined) continue;

        if (!firstNonEmptyCell) {
          firstNonEmptyCell = String(rawValue).trim();
        }

        // Always retain original column & value in extra
        parsed.extra[rawKey] = String(rawValue).trim();

        const mapped = mapColumn(rawKey, rawValue, customMapping);
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
        } else if (mapped.field === 'skuList') {
          parsed.skuList = mapped.value;
        } else if (mapped.field === 'customer') {
          // Keep customer in extra, also use in notes if empty
          parsed.extra['Customer'] = mapped.value;
        } else if (mapped.field === 'destination') {
          // If no specific warehouse zone was set, use destination city as zone / location
          if (!parsed.zone) parsed.zone = mapped.value;
          parsed.extra['Destination'] = mapped.value;
        }
      }

      // Zero-Skip Guarantee: If orderNo is not explicitly detected, fall back to other identifiers
      if (!orderNo) {
        if (parsed.invoiceNo) {
          orderNo = sanitizeOrderNo(parsed.invoiceNo);
        } else if (parsed.lrNo) {
          orderNo = sanitizeOrderNo(parsed.lrNo);
        } else if (firstNonEmptyCell) {
          orderNo = sanitizeOrderNo(firstNonEmptyCell);
        } else {
          orderNo = `ORD-${Date.now().toString().slice(-4)}-${rIdx + 1}`;
        }
        fallbackCount++;
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
        if (!existing.skuList && parsed.skuList) updateData.skuList = parsed.skuList;

        if (existing.status === 'RECEIVED' && hasStatusValue && parsed.status !== 'RECEIVED') {
          updateData.status = parsed.status;
          if (parsed.status === 'DISPATCHED') {
            updateData.sent = true;
            updateData.dispatchedAt = new Date();
          }
        }

        // Merge extra fields (preserve all columns)
        let mergedExtra = {};
        try { mergedExtra = existing.extra ? JSON.parse(existing.extra) : {}; } catch {}
        for (const [k, v] of Object.entries(parsed.extra)) {
          mergedExtra[k] = v;
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
            skuList: parsed.skuList || null,
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
        detail: `Uploaded "${file.name}": ${addedCount} added, ${updatedCount} updated, ${fallbackCount} identifiers auto-assigned`
      }
    });

    return NextResponse.json({
      success: true,
      added: addedCount,
      updated: updatedCount,
      fallbackAssigned: fallbackCount,
      totalProcessed: addedCount + updatedCount,
      headersDetected: headerRow
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return NextResponse.json({ error: `Failed to process Excel file: ${error.message}` }, { status: 500 });
  }
}
