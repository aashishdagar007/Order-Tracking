/**
 * excelParser.worker.js
 * Web Worker: runs xlsx parsing off the main thread so the UI never freezes.
 */

/* global importScripts, XLSX */
importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');

function detectHeaderRow(rows2D) {
  if (!rows2D || rows2D.length === 0) return 0;
  var bestIdx = 0, maxCols = 0;
  for (var i = 0; i < Math.min(rows2D.length, 10); i++) {
    var row = rows2D[i];
    if (!Array.isArray(row)) continue;
    var count = row.filter(function(c){ return c !== null && c !== undefined && cellVal(c).trim().length > 0; }).length;
    if (count > maxCols) { maxCols = count; bestIdx = i; }
  }
  return bestIdx;
}

function cellVal(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'object' && c !== null && c.v !== undefined) return String(c.v);
  return String(c);
}

self.onmessage = function (e) {
  var type = e.data.type;
  var buffer = e.data.buffer;
  var sheetName = e.data.sheetName;

  try {
    if (type === 'PARSE_FILE') {
      var wb = XLSX.read(buffer, { type: 'array', dense: true });

      var sheetMeta = wb.SheetNames.map(function(name) {
        var ws = wb.Sheets[name];
        if (!ws) return { name: name, rowCount: 0, headers: [] };
        var rows2D = ws['!data'] || [];
        var hIdx = detectHeaderRow(rows2D);
        var headerRow = rows2D[hIdx] || [];
        var headers = headerRow.map(cellVal).map(function(s){ return s.trim(); }).filter(Boolean);
        var dataRows = rows2D.slice(hIdx + 1).filter(function(r){
          return r && r.some(function(c){ return cellVal(c).trim() !== ''; });
        });
        return { name: name, rowCount: dataRows.length, headers: headers };
      });

      var firstSheetName = wb.SheetNames[0] || '';
      var firstWs = firstSheetName ? wb.Sheets[firstSheetName] : null;
      var previewHeaders = [], previewRows = [], totalRows = 0;

      if (firstWs) {
        var fRows = firstWs['!data'] || [];
        var fHIdx = detectHeaderRow(fRows);
        previewHeaders = (fRows[fHIdx] || []).map(cellVal).map(function(s){ return s.trim(); }).filter(Boolean);
        var fData = fRows.slice(fHIdx + 1).filter(function(r){
          return r && r.some(function(c){ return cellVal(c).trim() !== ''; });
        });
        totalRows = fData.length;
        previewRows = fData.slice(0, 20).map(function(row){ return row.map(cellVal); });
      }

      self.postMessage({ type: 'SHEET_LIST', sheetMeta: sheetMeta, firstSheet: firstSheetName, previewHeaders: previewHeaders, previewRows: previewRows, totalRows: totalRows });
      return;
    }

    if (type === 'GET_SHEET_DATA') {
      var wb2 = XLSX.read(buffer, { type: 'array', dense: true });
      var ws2 = wb2.Sheets[sheetName];
      if (!ws2) { self.postMessage({ type: 'ERROR', message: 'Sheet not found: ' + sheetName }); return; }
      var rows2D2 = ws2['!data'] || [];
      var hIdx2 = detectHeaderRow(rows2D2);
      var headers2 = (rows2D2[hIdx2] || []).map(cellVal).map(function(s){ return s.trim(); }).filter(Boolean);
      var dataRows2 = rows2D2.slice(hIdx2 + 1).filter(function(r){
        return r && r.some(function(c){ return cellVal(c).trim() !== ''; });
      });
      var rows2 = dataRows2.map(function(row){ return row.map(cellVal); });
      self.postMessage({ type: 'SHEET_DATA', sheetName: sheetName, headers: headers2, rows: rows2, totalRows: rows2.length });
      return;
    }

  } catch (err) {
    self.postMessage({ type: 'ERROR', message: String(err && err.message ? err.message : err) });
  }
};
