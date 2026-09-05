(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/lib/thermalLabel.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Thermal 4x6 Shipping Label & Delivery Challan Generator
__turbopack_context__.s([
    "generateBarcodeSvg",
    ()=>generateBarcodeSvg,
    "printDeliveryChallan",
    ()=>printDeliveryChallan,
    "printThermalLabel",
    ()=>printThermalLabel
]);
function generateBarcodeSvg(text) {
    // Generates clean SVG vertical barcode stripes for standard thermal labels
    const clean = String(text || 'ORDER').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
    const width = 280;
    const height = 65;
    const bars = [];
    // Deterministic pseudo Code128 pattern based on char codes
    let cursor = 10;
    for(let i = 0; i < clean.length; i++){
        const code = clean.charCodeAt(i);
        const w1 = code % 3 + 1.5;
        const s1 = (code >> 1) % 3 + 1.5;
        const w2 = (code >> 2) % 3 + 2;
        const s2 = (code >> 3) % 2 + 1.5;
        bars.push(`<rect x="${cursor}" y="0" width="${w1}" height="${height}" fill="#000" />`);
        cursor += w1 + s1;
        bars.push(`<rect x="${cursor}" y="0" width="${w2}" height="${height}" fill="#000" />`);
        cursor += w2 + s2;
    }
    return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${cursor + 10} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#fff"/>
      ${bars.join('')}
    </svg>
  `;
}
function printThermalLabel(order) {
    const printWindow = window.open('', '_blank', 'width=450,height=650');
    if (!printWindow) {
        alert('Please allow popups to print shipping labels.');
        return;
    }
    const barcodeSvg = generateBarcodeSvg(order.orderNo);
    const now = new Date().toLocaleString();
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Shipping Label - ${order.orderNo}</title>
      <style>
        @page {
          size: 4in 6in;
          margin: 0.15in;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, monospace; }
        body { background: #fff; color: #000; padding: 0.15in; }
        .label-box {
          border: 3px solid #000;
          width: 100%;
          height: 100%;
          padding: 8px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #000;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .title { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
        .badge {
          background: #000;
          color: #fff;
          padding: 2px 6px;
          font-weight: 800;
          font-size: 12px;
          border-radius: 2px;
        }
        .section {
          border-bottom: 1px solid #000;
          padding: 6px 0;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .label-key { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #444; }
        .label-val { font-size: 14px; font-weight: 800; }
        .big-val { font-size: 20px; font-weight: 900; }
        .barcode-container {
          text-align: center;
          margin: 8px 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .barcode-text { font-family: monospace; font-size: 13px; font-weight: 700; letter-spacing: 2px; margin-top: 3px; }
        .footer {
          display: flex;
          justify-content: space-between;
          font-size: 8px;
          color: #333;
          padding-top: 4px;
        }
      </style>
    </head>
    <body onload="window.print();">
      <div class="label-box">
        <div class="header">
          <div>
            <div class="title">WAREHOUSE EXPRESS</div>
            <div style="font-size: 9px; font-weight: 600;">LOGISTICS &amp; FULFILLMENT</div>
          </div>
          <div>
            <span class="badge">${order.priority || 'STANDARD'}</span>
          </div>
        </div>

        <div class="section grid">
          <div>
            <div class="label-key">Order Number</div>
            <div class="label-val">${order.orderNo}</div>
          </div>
          <div>
            <div class="label-key">Invoice Ref</div>
            <div class="label-val">${order.invoiceNo || 'N/A'}</div>
          </div>
        </div>

        <div class="section grid">
          <div>
            <div class="label-key">Carrier / Transporter</div>
            <div class="big-val">${order.transporter || 'DIRECT HAUL'}</div>
          </div>
          <div>
            <div class="label-key">LR / Tracking #</div>
            <div class="label-val">${order.lrNo || 'PENDING'}</div>
          </div>
        </div>

        <div class="section grid">
          <div>
            <div class="label-key">Warehouse Zone</div>
            <div class="label-val">${order.zone || 'MAIN AISLE'}</div>
          </div>
          <div>
            <div class="label-key">Dock Bay</div>
            <div class="big-val">${order.dockBay || 'BAY 1'}</div>
          </div>
        </div>

        <div class="section grid">
          <div>
            <div class="label-key">Total Packages</div>
            <div class="big-val">${order.boxCount || 1} PKG (${order.weightKg ? order.weightKg + ' KG' : 'STD'})</div>
          </div>
          <div>
            <div class="label-key">Vehicle Plate</div>
            <div class="label-val">${order.vehicleNo || 'FLEET'}</div>
          </div>
        </div>

        <div class="barcode-container">
          ${barcodeSvg}
          <div class="barcode-text">*${order.orderNo}*</div>
        </div>

        <div class="footer">
          <span>Printed: ${now}</span>
          <span>Status: ${order.status}</span>
        </div>
      </div>
    </body>
    </html>
  `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}
function printDeliveryChallan(order) {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
        alert('Please allow popups to print delivery challans.');
        return;
    }
    const barcodeSvg = generateBarcodeSvg(order.orderNo);
    const now = new Date().toLocaleString();
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Delivery Challan - ${order.orderNo}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
        body { background: #fff; color: #111; padding: 25px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 15px; }
        h1 { font-size: 20px; font-weight: 800; }
        h2 { font-size: 14px; color: #555; }
        .challan-no { font-family: monospace; font-size: 16px; font-weight: 700; text-align: right; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
        .card { border: 1px solid #ccc; padding: 10px 14px; border-radius: 3px; }
        .card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 700; }
        .sign-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; }
        .sign-box { border-top: 1px dashed #333; padding-top: 6px; text-align: center; font-size: 11px; font-weight: 600; }
      </style>
    </head>
    <body onload="window.print();">
      <div class="header">
        <div>
          <h1>WAREHOUSE OUTBOUND DELIVERY CHALLAN</h1>
          <h2>Dispatch &amp; Handover Manifest</h2>
        </div>
        <div>
          <div class="challan-no">ORDER: ${order.orderNo}</div>
          <div style="font-size: 11px; color: #666; text-align: right;">Date: ${now}</div>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-title">Order Information</div>
          <div><strong>Order Number:</strong> ${order.orderNo}</div>
          <div><strong>Invoice Number:</strong> ${order.invoiceNo || 'N/A'}</div>
          <div><strong>Priority:</strong> ${order.priority || 'STANDARD'}</div>
          <div><strong>Status:</strong> ${order.status}</div>
        </div>
        <div class="card">
          <div class="card-title">Logistics &amp; Transport</div>
          <div><strong>Transporter:</strong> ${order.transporter || 'Direct Courier'}</div>
          <div><strong>LR / Tracking #:</strong> ${order.lrNo || 'N/A'}</div>
          <div><strong>Vehicle No:</strong> ${order.vehicleNo || 'N/A'}</div>
          <div><strong>Dock Bay:</strong> ${order.dockBay || 'Bay 1'}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item / Package Description</th>
            <th>Zone / Rack</th>
            <th>Package Count</th>
            <th>Weight (KG)</th>
            <th>Picked By</th>
            <th>Packed By</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Fulfillment Package (${order.priority || 'STANDARD'})</td>
            <td>${order.zone || 'Zone A'}</td>
            <td>${order.boxCount || 1} Box(es)</td>
            <td>${order.weightKg ? order.weightKg + ' kg' : 'Standard'}</td>
            <td>${order.pickedBy || 'Floor Staff'}</td>
            <td>${order.packedBy || 'Packaging Team'}</td>
          </tr>
        </tbody>
      </table>

      <div style="text-align: center; margin: 15px 0;">
        ${barcodeSvg}
        <div style="font-family: monospace; font-size: 12px; margin-top: 4px;">*${order.orderNo}*</div>
      </div>

      <div class="sign-grid">
        <div class="sign-box">Warehouse Supervisor</div>
        <div class="sign-box">Transporter / Driver Handover</div>
        <div class="sign-box">Security Gate Pass Officer</div>
      </div>
    </body>
    </html>
  `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=lib_thermalLabel_1ablcik.js.map