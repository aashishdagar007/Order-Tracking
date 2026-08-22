import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key-change-in-production');

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function PUT(request) {
  const user = await getUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { workerPassword, adminPassword } = await request.json();

    if (workerPassword && String(workerPassword).trim()) {
      await prisma.config.upsert({
        where: { key: 'workerPassword' },
        update: { value: String(workerPassword).trim() },
        create: { key: 'workerPassword', value: String(workerPassword).trim() }
      });
    }

    if (adminPassword && String(adminPassword).trim()) {
      await prisma.config.upsert({
        where: { key: 'adminPassword' },
        update: { value: String(adminPassword).trim() },
        create: { key: 'adminPassword', value: String(adminPassword).trim() }
      });
    }

    await prisma.log.create({
      data: {
        name: user.name,
        role: user.role,
        action: 'Settings Change',
        detail: 'Updated passwords'
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Config API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
