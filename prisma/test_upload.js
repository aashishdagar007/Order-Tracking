/**
 * Test script to see how the upload would parse an Excel file.
 * Run: node prisma/test_upload.js "path/to/your/file.xlsx"
 */
const xlsx = require('xlsx');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node prisma/test_upload.js "path/to/file.xlsx"');
  process.exit(1);
}

function normalizeKey(key) {
  return key.trim().toLowerCase().replace(/[\s_\-\.]+/g, '');
}

function mapColumn(rawKey, rawValue) {
  const k = normalizeKey(rawKey);
  const v = String(rawValue).trim();

  if (['orderno', 'ordernumber', 'orderid', 'order'].includes(k)) {
    return { field: 'orderNo', value: v.toUpperCase() };
  }
  if (['invoiceno', 'invoicenumber', 'invoice'].includes(k)) {
    return { field: 'invoiceNo', value: v };
  }
  if (['lrno', 'lrnumber', 'lr', 'lrnum'].includes(k)) {
    return { field: 'lrNo', value: v };
  }
  if (['status', 'sent', 'dispatched', 'shipmentstatus'].includes(k)) {
    const lower = v.toLowerCase();
    const isSent = ['yes', 'true', 'dispatched', 'done', 'delivered', '1', 'completed'].includes(lower);
    return { field: 'sent', value: isSent };
  }
  if (['notes', 'note', 'remarks', 'remark', 'comment', 'comments'].includes(k)) {
    return { field: 'notes', value: v };
  }
  return { field: 'extra', value: v, key: rawKey };
}

const workbook = xlsx.read(require('fs').readFileSync(filePath), { type: 'buffer' });
const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const rawData = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });

console.log(`\n--- File: ${path.basename(filePath)} ---`);
console.log(`Total rows: ${rawData.length}`);
if (rawData.length > 0) {
  console.log(`\nColumn headers found:`);
  Object.keys(rawData[0]).forEach(k => {
    const normalized = normalizeKey(k);
    const mapped = mapColumn(k, 'test');
    console.log(`  "${k}" → normalized: "${normalized}" → field: "${mapped.field}"`);
  });
}

console.log(`\nFirst 5 rows (parsed):`);
rawData.slice(0, 5).forEach((row, i) => {
  const parsed = { extra: {} };
  let orderNo = '';
  for (const [key, value] of Object.entries(row)) {
    if (value === '' || value === null || value === undefined) continue;
    const mapped = mapColumn(key, value);
    if (mapped.field === 'orderNo') orderNo = mapped.value;
    else if (mapped.field === 'extra') parsed.extra[key] = mapped.value;
    else parsed[mapped.field] = mapped.value;
  }
  console.log(`  Row ${i + 1}: orderNo="${orderNo}"`, JSON.stringify(parsed));
});
