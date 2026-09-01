import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as xlsx from 'xlsx';
import { getSessionUser, updateWorkerHeartbeat } from '@/lib/auth';
import { bus } from '@/lib/eventBus';

/** Normalize an order number */
function sanitizeOrderNo(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

/** Normalize a column header for flexible matching */
function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
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

/** Map a raw column to a known field */
function mapColumn(rawKey, rawValue, customMapping = {}) {
  const cleanKey = String(rawKey || '').trim();
  const k = normalizeKey(cleanKey);
  const v = String(rawValue !== null && rawValue !== undefined ? rawValue : '').trim();

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

  if (['orderno','ordernumber','orderid','order','ordernum','order#','pono','ponumber','po#','wono','wonumber',
       'jobno','jobnumber','referenceno','referencenumber','refno','refnum','ref#','reference','bookingno',
       'bookingid','sonumber','sono','so#','salesorder','challanno','challannumber','challan#','docno',
       'documentno','serialno','srno','sno','id','trackingid'].includes(k)) {
    return { field: 'orderNo', value: sanitizeOrderNo(rawValue) };
  }
  if (['invoiceno','invoicenumber','invoice','invoice#','billno','billnumber','bill#','taxinvoice'].includes(k)) {
    return { field: 'invoiceNo', value: v };
  }
  if (['lrno','lrnumber','lr#','lr','lrnum','docketno','docketnumber','docket#','docket','awb','awbno',
       'awbnumber','awb#','consignmentno','consignmentnumber','consignment#','consignment','trackingnumber',
       'trackingno','tracking#','tracking','waybill','waybillno'].includes(k)) {
    return { field: 'lrNo', value: v };
  }
  if (['status','stage','fulfillment','shipmentstatus','orderstatus','dispatchstatus','state','sent'].includes(k)) {
    return { field: 'status', value: normalizeStatus(v) };
  }
  if (['priority','urgency','level','ordertype','prioritylevel','type'].includes(k)) {
    return { field: 'priority', value: normalizePriority(v) };
  }
  if (['transporter','carrier','courier','transport','logistics','shippingcompany','partner','vendor','vehicletransporter'].includes(k)) {
    return { field: 'transporter', value: v };
  }
  if (['vehicleno','vehicle','truckno','truck','lorryno','plateno','carnumber','regno','registrationno'].includes(k)) {
    return { field: 'vehicleNo', value: v.toUpperCase() };
  }
  if (['boxcount','boxes','packages','packagecount','qty','quantity','cartons','units','pieces','pcs','box','pkgs'].includes(k)) {
    return { field: 'boxCount', value: parseInt(v, 10) || 1 };
  }
  if (['weight','weightkg','grossweight','netweight','kg','totalweight','actualweight','chargedweight'].includes(k)) {
    return { field: 'weightKg', value: parseFloat(v) || null };
  }
  if (['zone','warehousezone','rack','shelf','bin','aisle','storage','warehouselocation'].includes(k)) {
    return { field: 'zone', value: v };
  }
  if (['dock','bay','dockbay','dockdoor','gate','stagingbay','docklocation'].includes(k)) {
    return { field: 'dockBay', value: v };
  }
  if (['notes','note','remarks','remark','comment','comments','specialinstructions','instruction'].includes(k)) {
    return { field: 'notes', value: v };
  }
  if (['customer','customername','party','partyname','consignee','consigneename','buyer','buyername','client','clientname','recipient'].includes(k)) {
    return { field: 'customer', value: v, key: cleanKey };
  }
  if (['destination','city','state','deliverycity','deliverylocation','location','address','shippingaddress','deliveryaddress','dest','pincode'].includes(k)) {
    return { field: 'destination', value: v, key: cleanKey };
  }
  if (['item','items','itemname','itemdescription','product','products','productname','sku','skuname','description','material','particulars'].includes(k)) {
    return { field: 'skuList', value: v, key: cleanKey };
  }
  return { field: 'extra', value: v, key: cleanKey };
}

/** Robustly find header row index in raw 2D array */
function detectHeaderRow(rows2D) {
  if (!rows2D || rows2D.length === 0) return 0;
  let bestRowIdx = 0, maxCols = 0;
  for (let i = 0; i < Math.min(rows2D.length, 10); i++) {
    const row = rows2D[i];
    if (!Array.isArray(row)) continue;
    const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim().length > 0).length;
    if (nonEmpty > maxCols) { maxCols = nonEmpty; bestRowIdx = i; }
  }
  return bestRowIdx;
}

/**
 * Parse a single worksheet and return an array of {orderNo, parsed} records.
 * Pure in-memory — no DB calls here.
 */
function parseWorksheet(worksheet, customMapping, fileName, userNameForFallback) {
  const rows2D = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rows2D.length === 0) return [];

  const headerRowIdx = detectHeaderRow(rows2D);
  const headerRow = rows2D[headerRowIdx].map(h => String(h || '').trim());
  const dataRows = rows2D.slice(headerRowIdx + 1);

  const records = [];
  let fallbackIdx = 0;

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const rowArr = dataRows[rIdx];
    if (!rowArr || rowArr.every(c => c === '' || c === null || c === undefined)) continue;

    let orderNo = '';
    const parsed = {
      invoiceNo: null, lrNo: null, status: 'RECEIVED', priority: 'STANDARD',
      zone: null, dockBay: null, transporter: null, vehicleNo: null,
      boxCount: 1, weightKg: null, notes: null, skuList: null, extra: {}
    };
    let hasStatusValue = false;
    let firstNonEmptyCell = null;

    for (let cIdx = 0; cIdx < headerRow.length; cIdx++) {
      const rawKey = headerRow[cIdx] || `Column_${cIdx + 1}`;
      const rawValue = rowArr[cIdx];
      if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
      if (!firstNonEmptyCell) firstNonEmptyCell = String(rawValue).trim();

      parsed.extra[rawKey] = String(rawValue).trim();

      const mapped = mapColumn(rawKey, rawValue, customMapping);
      if (mapped.field === 'orderNo') { orderNo = mapped.value; }
      else if (mapped.field === 'status') { parsed.status = mapped.value; hasStatusValue = true; }
      else if (mapped.field === 'priority') { parsed.priority = mapped.value; }
      else if (mapped.field === 'zone') { parsed.zone = mapped.value; }
      else if (mapped.field === 'dockBay') { parsed.dockBay = mapped.value; }
      else if (mapped.field === 'transporter') { parsed.transporter = mapped.value; }
      else if (mapped.field === 'vehicleNo') { parsed.vehicleNo = mapped.value; }
      else if (mapped.field === 'boxCount') { parsed.boxCount = mapped.value; }
      else if (mapped.field === 'weightKg') { parsed.weightKg = mapped.value; }
      else if (mapped.field === 'invoiceNo') { parsed.invoiceNo = mapped.value; }
      else if (mapped.field === 'lrNo') { parsed.lrNo = mapped.value; }
      else if (mapped.field === 'notes') { parsed.notes = mapped.value; }
      else if (mapped.field === 'skuList') { parsed.skuList = mapped.value; }
      else if (mapped.field === 'customer') { parsed.extra['Customer'] = mapped.value; }
      else if (mapped.field === 'destination') {
        if (!parsed.zone) parsed.zone = mapped.value;
        parsed.extra['Destination'] = mapped.value;
      }
    }

    if (!orderNo) {
      if (parsed.invoiceNo) orderNo = sanitizeOrderNo(parsed.invoiceNo);
      else if (parsed.lrNo) orderNo = sanitizeOrderNo(parsed.lrNo);
      else if (firstNonEmptyCell) orderNo = sanitizeOrderNo(firstNonEmptyCell);
      else orderNo = `ORD-${Date.now().toString().slice(-6)}-${++fallbackIdx}`;
    }

    records.push({ orderNo, parsed, hasStatusValue });
  }

  return records;
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

    // Parse custom column mapping
    let customMapping = {};
    try { customMapping = JSON.parse(formData.get('mapping') || '{}'); } catch {}

    // Parse sheet selection: support single sheetName OR sheetNames[] JSON array
    let sheetsToImport = [];
    const sheetNamesRaw = formData.get('sheetNames');
    const sheetNameSingle = formData.get('sheetName');

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(buffer), { type: 'buffer' });
    if (workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'No sheets found in Excel file' }, { status: 400 });
    }

    if (sheetNamesRaw) {
      try {
        const parsed = JSON.parse(sheetNamesRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sheetsToImport = parsed.filter(s => workbook.SheetNames.includes(s));
        }
      } catch {}
    }
    if (sheetsToImport.length === 0) {
      sheetsToImport = [sheetNameSingle || workbook.SheetNames[0]];
    }

    // ── PHASE 1: Parse all selected sheets in memory ──────────────────────
    // Use a Map keyed by orderNo so that first-sheet-wins for duplicates
    const allRecordsMap = new Map(); // orderNo -> { parsed, hasStatusValue }

    for (const shName of sheetsToImport) {
      const worksheet = workbook.Sheets[shName];
      if (!worksheet) continue;
      const records = parseWorksheet(worksheet, customMapping, file.name, user.name);
      for (const rec of records) {
        // First-sheet-wins: skip if orderNo already exists in our accumulator
        if (!allRecordsMap.has(rec.orderNo)) {
          allRecordsMap.set(rec.orderNo, rec);
        }
      }
    }

    if (allRecordsMap.size === 0) {
      return NextResponse.json({ error: 'No valid data rows found in the selected sheets' }, { status: 400 });
    }

    const allOrderNos = Array.from(allRecordsMap.keys());

    // ── PHASE 2: Fetch ALL existing orders in ONE query ────────────────────
    const existingOrders = await prisma.order.findMany({
      where: { orderNo: { in: allOrderNos } },
      select: {
        id: true, orderNo: true, invoiceNo: true, lrNo: true, zone: true,
        dockBay: true, transporter: true, vehicleNo: true, weightKg: true,
        notes: true, skuList: true, extra: true, status: true
      }
    });
    const existingMap = new Map(existingOrders.map(o => [o.orderNo, o]));

    // ── PHASE 3: Split into creates and updates ────────────────────────────
    const toCreate = [];
    const toUpdate = [];

    for (const [orderNo, rec] of allRecordsMap) {
      const { parsed, hasStatusValue } = rec;
      const existing = existingMap.get(orderNo);

      if (existing) {
        // Merge: fill in missing fields only
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
          if (parsed.status === 'DISPATCHED') { updateData.sent = true; updateData.dispatchedAt = new Date(); }
        }
        let mergedExtra = {};
        try { mergedExtra = existing.extra ? JSON.parse(existing.extra) : {}; } catch {}
        Object.assign(mergedExtra, parsed.extra);
        updateData.extra = Object.keys(mergedExtra).length > 0 ? JSON.stringify(mergedExtra) : null;
        toUpdate.push({ id: existing.id, data: updateData });
      } else {
        const isDispatched = parsed.status === 'DISPATCHED';
        toCreate.push({
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
        });
      }
    }

    // ── PHASE 4: Batch create + batch update in a transaction ─────────────
    let addedCount = 0, updatedCount = 0;

    // Batch create (skipDuplicates as safety net)
    if (toCreate.length > 0) {
      const created = await prisma.order.createMany({ data: toCreate, skipDuplicates: true });
      addedCount = created.count;
    }

    // Batch update in chunks of 200 inside a transaction to avoid SQLite lock timeouts
    const UPDATE_CHUNK = 200;
    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
      const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
      await prisma.$transaction(
        chunk.map(u => prisma.order.update({ where: { id: u.id }, data: u.data }))
      );
      updatedCount += chunk.length;
    }

    // Create import events in bulk for new orders (fetch their IDs first)
    if (addedCount > 0) {
      const newOrderNos = toCreate.map(r => r.orderNo);
      const newOrders = await prisma.order.findMany({
        where: { orderNo: { in: newOrderNos } },
        select: { id: true, status: true }
      });
      if (newOrders.length > 0) {
        await prisma.orderEvent.createMany({
          data: newOrders.map(o => ({
            orderId: o.id,
            status: o.status,
            actorName: user.name,
            actorRole: user.role,
            note: `Imported via Excel: ${file.name}`
          })),
          skipDuplicates: true
        });
      }
    }

    await updateWorkerHeartbeat(user.userId, `Uploaded Excel "${file.name}" (${addedCount} added, ${updatedCount} updated)`);

    const sheetsLabel = sheetsToImport.join(', ');
    await prisma.log.create({
      data: {
        userId: user.userId,
        name: user.name,
        role: user.role,
        action: 'Excel Upload',
        detail: `Uploaded "${file.name}" [${sheetsLabel}]: ${addedCount} added, ${updatedCount} updated (${allRecordsMap.size} total rows processed)`
      }
    });

    // Broadcast bulk upload event to all connected dashboards
    bus.emit('order_update', {
      type: 'BULK_UPLOAD',
      added: addedCount,
      updated: updatedCount,
      fileName: file.name,
      actorName: user.name,
      actorRole: user.role,
    });

    return NextResponse.json({
      success: true,
      added: addedCount,
      updated: updatedCount,
      totalProcessed: addedCount + updatedCount,
      sheetsImported: sheetsToImport,
      headersDetected: []
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return NextResponse.json({ error: `Failed to process Excel file: ${error.message}` }, { status: 500 });
  }
}
