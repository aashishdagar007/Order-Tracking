const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');

const dbPath = path.resolve('./prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbPath });
const prisma = new PrismaClient({ adapter });

async function main() {
  const count = await prisma.order.count();
  console.log('Total orders in DB:', count);

  const orders = await prisma.order.findMany({
    take: 10,
    select: { orderNo: true, enteredBy: true, sent: true }
  });
  console.log('Sample orders:', JSON.stringify(orders, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
