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
  console.log('Database seeded!');
  console.log('  Worker password: worker123');
  console.log('  Admin password:  admin123');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
