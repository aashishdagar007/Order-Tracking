const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  // Legacy config seed
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

  // 1. Seed Master Admin User
  const adminHash = hashPassword('admin123');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash: adminHash,
      role: 'ADMIN',
      canViewOrders: true,
      canPickPack: true,
      canDispatch: true,
      canUpload: true,
      canExport: true,
      canViewLogs: true,
      isActive: true,
    },
    create: {
      username: 'admin',
      name: 'Master Admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      canViewOrders: true,
      canPickPack: true,
      canDispatch: true,
      canUpload: true,
      canExport: true,
      canViewLogs: true,
      isActive: true,
      lastAction: 'Warehouse terminal initialized',
      lastActionAt: new Date(),
    }
  });

  // 2. Seed Managed Worker Accounts
  const workerHash = hashPassword('worker123');
  await prisma.user.upsert({
    where: { username: 'worker1' },
    update: {
      adminId: admin.id,
      name: 'John Picker (Aisle A)',
      passwordHash: workerHash,
      role: 'WORKER',
      canViewOrders: true,
      canPickPack: true,
      canDispatch: true,
      canUpload: false,
      canExport: false,
      canViewLogs: false,
      isActive: true,
    },
    create: {
      username: 'worker1',
      name: 'John Picker (Aisle A)',
      passwordHash: workerHash,
      role: 'WORKER',
      adminId: admin.id,
      canViewOrders: true,
      canPickPack: true,
      canDispatch: true,
      canUpload: false,
      canExport: false,
      canViewLogs: false,
      isActive: true,
      lastAction: 'Station initialized in Zone A',
      lastActionAt: new Date(),
    }
  });

  await prisma.user.upsert({
    where: { username: 'worker2' },
    update: {
      adminId: admin.id,
      name: 'Sarah Packer (Station 2)',
      passwordHash: workerHash,
      role: 'WORKER',
      canViewOrders: true,
      canPickPack: true,
      canDispatch: false,
      canUpload: false,
      canExport: false,
      canViewLogs: false,
      isActive: true,
    },
    create: {
      username: 'worker2',
      name: 'Sarah Packer (Station 2)',
      passwordHash: workerHash,
      role: 'WORKER',
      adminId: admin.id,
      canViewOrders: true,
      canPickPack: true,
      canDispatch: false,
      canUpload: false,
      canExport: false,
      canViewLogs: false,
      isActive: true,
      lastAction: 'Inspecting Order ORD-1006',
      lastActionAt: new Date(),
    }
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
      enteredBy: 'Master Admin'
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
      enteredBy: 'John Picker (Aisle A)'
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
      enteredBy: 'Sarah Packer (Station 2)'
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
      enteredBy: 'Master Admin'
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
      enteredBy: 'Master Admin',
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
      enteredBy: 'Sarah Packer (Station 2)'
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
            actorRole: ord.enteredBy.includes('Admin') ? 'ADMIN' : 'WORKER',
            note: 'Initial inventory entry'
          }
        }
      }
    });
  }

  console.log('✅ Database successfully seeded!');
  console.log('  Admin Login:  admin   / admin123');
  console.log('  Worker 1:     worker1 / worker123 (Full permissions)');
  console.log('  Worker 2:     worker2 / worker123 (Pick & Pack only)');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
