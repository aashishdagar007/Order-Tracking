import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prismaClient ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaClient = prisma;
}

export default prisma;