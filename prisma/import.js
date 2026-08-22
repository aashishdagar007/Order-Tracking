/**
 * Direct CLI import tool - bypasses the web UI.
 * Run: node prisma/import.js "C:\path\to\your\file.xlsx"
 */
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbPath });
const prisma = new PrismaClient({ adapter });

function sanitizeOrderNo(raw) {
  let s = String(raw).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s_\-\.]+/g, '');
}

function mapColumn(rawKey, rawValue) {
  const k = normalizeKey(rawKey);
  const v = String(rawValue).trim();
  if (['orderno', 'ordernumber', 'orderid', 'order'].includes(k)) return { field: 'orderNo', value: sanitizeOrderNo(rawValue) };
  if (['invoiceno', 'invoicenumber', 'invoice'].includes(k)) return { field: 'invoiceNo', value: v };
  if (['lrno', 'lrnumber', 'lr', 'lrnum'].includes(k)) return { field: 'lrNo', value: v };
  if (['status', 'sent', 'dispatched', 'shipmentstatus'].includes(k)) {
    const lower = v.toLowerCase();
    return { field: 'sent', value: ['yes', 'true', 'dispatched', 'done', 'delivered', '1', 'completed'].includes(lower) };
  }
  if (['notes', 'note', 'remarks', 'remark'].includes(k)) return { field: 'notes', value: v };
  return { field: 'extra', value: v, key: rawKey };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node prisma/import.js "path/to/file.xlsx"'); process.exit(1); }
  if (!fs.existsSync(filePath)) { console.error('File not found:', filePath); process.exit(1); }

  const workbook = xlsx.read(fs.readFileSync(filePath), { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

  console.log(`Processing ${rawData.length} rows from "${path.basename(filePath)}"...`);

  if (rawData.length > 0) {
    console.log('Columns:', Object.keys(rawData[0]).map(h => `"${h}"(→${mapColumn(h,'').field})`).join(', '));
  }

  let added = 0, updated = 0, skipped = 0;

  for (const row of rawData) {
    let orderNo = '';
    const parsed = { invoiceNo: null, lrNo: null, sent: false, notes: null, extra: {} };
    let hasSentValue = false;

    for (const [rawKey, rawValue] of Object.entries(row)) {
      if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
      const mapped = mapColumn(rawKey, rawValue);
      if (mapped.field === 'orderNo') orderNo = mapped.value;
      else if (mapped.field === 'invoiceNo') parsed.invoiceNo = mapped.value;
      else if (mapped.field === 'lrNo') parsed.lrNo = mapped.value;
      else if (mapped.field === 'sent') { parsed.sent = mapped.value; hasSentValue = true; }
      else if (mapped.field === 'notes') parsed.notes = mapped.value;
      else if (mapped.field === 'extra' && mapped.value) parsed.extra[mapped.key] = mapped.value;
    }

    if (!orderNo) { skipped++; continue; }

    const existing = await prisma.order.findUnique({ where: { orderNo } });
    if (existing) {
      const upd = { updatedBy: 'CLI Import' };
      if (!existing.invoiceNo && parsed.invoiceNo) upd.invoiceNo = parsed.invoiceNo;
      if (!existing.lrNo && parsed.lrNo) upd.lrNo = parsed.lrNo;
      if (!existing.notes && parsed.notes) upd.notes = parsed.notes;
      if (!existing.sent && hasSentValue && parsed.sent) upd.sent = true;
      let mergedExtra = {};
      try { mergedExtra = existing.extra ? JSON.parse(existing.extra) : {}; } catch(e) {}
      for (const [k, v] of Object.entries(parsed.extra)) { if (!(k in mergedExtra)) mergedExtra[k] = v; }
      upd.extra = JSON.stringify(mergedExtra);
      await prisma.order.update({ where: { id: existing.id }, data: upd });
      updated++;
    } else {
      await prisma.order.create({
        data: {
          orderNo,
          invoiceNo: parsed.invoiceNo || null,
          lrNo: parsed.lrNo || null,
          sent: parsed.sent || false,
          notes: parsed.notes || null,
          extra: Object.keys(parsed.extra).length > 0 ? JSON.stringify(parsed.extra) : null,
          enteredBy: 'CLI Import',
        }
      });
      added++;
      if (added <= 5) console.log(`  Added: ${orderNo}`);
    }
  }

  console.log(`\n✅ Import complete: ${added} added, ${updated} updated, ${skipped} skipped`);
  const total = await prisma.order.count();
  console.log(`📦 Total orders now in database: ${total}`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
