import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'prisma/dev.db');

const globalForPrisma = globalThis;

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prismaClient ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaClient = prisma;
}

export default prisma;