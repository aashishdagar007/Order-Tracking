const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.config.upsert({
    where: { key: 'adminPassword' },
    update: {},
    create: { key: 'adminPassword', value: 'admin123' },
  });
  
  await prisma.config.upsert({
    where: { key: 'workerPassword' },
    update: {},
    create: { key: 'workerPassword', value: 'worker123' },
  });

  const sampleOrders = [
    {
      orderNo: 'ORD-1001',
      invoiceNo: 'INV-2026-001',
      lrNo: 'BLU-882194',
      status: 'STAGED',
      priority: 'URGENT',
      zone: 'Zone A - Rack 04 - Bin 12',
      dockBay: 'Dock Bay 3',
      transporter: 'BlueDart Express',
      vehicleNo: 'MH-12-AB-9921',
      boxCount: 3,
      weightKg: 24.5,
      notes: 'Fragile electrical components. Keep dry.',
      enteredBy: 'Warehouse Admin'
    },
    {
      orderNo: 'ORD-1002',
      invoiceNo: 'INV-2026-002',
      lrNo: 'VRL-773102',
      status: 'PICKING',
      priority: 'EXPRESS',
      zone: 'Zone B - Rack 02 - Bin 08',
      dockBay: 'Dock Bay 1',
      transporter: 'VRL Logistics',
      vehicleNo: 'KA-04-DE-4412',
      boxCount: 2,
      weightKg: 15.0,
      notes: 'Priority air cargo consignment.',
      enteredBy: 'Import Tool'
    },
    {
      orderNo: 'ORD-1003',
      invoiceNo: 'INV-2026-003',
      lrNo: 'TCI-994120',
      status: 'PACKING',
      priority: 'STANDARD',
      zone: 'Zone C - Rack 11 - Bin 03',
      dockBay: 'Dock Bay 2',
      transporter: 'TCI Express',
      vehicleNo: 'DL-01-XY-5531',
      boxCount: 5,
      weightKg: 42.8,
      notes: 'Industrial hardware tools.',
      enteredBy: 'Warehouse Admin'
    },
    {
      orderNo: 'ORD-1004',
      invoiceNo: 'INV-2026-004',
      lrNo: 'DEL-331902',
      status: 'RECEIVED',
      priority: 'STANDARD',
      zone: 'Zone A - Rack 01 - Bin 19',
      dockBay: 'Dock Bay 4',
      transporter: 'Delhivery',
      vehicleNo: 'MH-14-GH-1289',
      boxCount: 1,
      weightKg: 8.2,
      notes: 'Standard carton package.',
      enteredBy: 'Excel Upload'
    },
    {
      orderNo: 'ORD-1005',
      invoiceNo: 'INV-2026-005',
      lrNo: 'GAT-552019',
      status: 'DISPATCHED',
      priority: 'STANDARD',
      zone: 'Zone B - Rack 09 - Bin 01',
      dockBay: 'Dock Bay 1',
      transporter: 'Gati KWE',
      vehicleNo: 'MH-04-JK-7822',
      boxCount: 4,
      weightKg: 38.0,
      notes: 'Dispatched on morning route.',
      enteredBy: 'Warehouse Admin',
      dispatchedAt: new Date()
    },
    {
      orderNo: 'ORD-1006',
      invoiceNo: 'INV-2026-006',
      lrNo: 'BLU-991204',
      status: 'QUALITY_CHECK',
      priority: 'URGENT',
      zone: 'Zone D - Rack 05 - Bin 14',
      dockBay: 'Dock Bay 3',
      transporter: 'BlueDart Express',
      vehicleNo: 'MH-12-AB-9921',
      boxCount: 2,
      weightKg: 18.4,
      notes: 'Awaiting QC seal and barcode affixing.',
      enteredBy: 'Warehouse Admin'
    }
  ];

  for (const ord of sampleOrders) {
    const isDispatched = ord.status === 'DISPATCHED';
    await prisma.order.upsert({
      where: { orderNo: ord.orderNo },
      update: {
        status: ord.status,
        priority: ord.priority,
        zone: ord.zone,
        dockBay: ord.dockBay,
        transporter: ord.transporter,
        vehicleNo: ord.vehicleNo,
        boxCount: ord.boxCount,
        weightKg: ord.weightKg,
        invoiceNo: ord.invoiceNo,
        lrNo: ord.lrNo,
        notes: ord.notes,
        sent: isDispatched,
        dispatchedAt: isDispatched ? new Date() : null,
      },
      create: {
        ...ord,
        sent: isDispatched,
        events: {
          create: {
            status: ord.status,
            actorName: ord.enteredBy,
            actorRole: 'ADMIN',
            note: 'Initial seed record'
          }
        }
      }
    });
  }

  console.log('✅ Database seeded with warehouse configuration and sample inventory orders!');
  console.log('  Worker password: worker123');
  console.log('  Admin password:  admin123');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
