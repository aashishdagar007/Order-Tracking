import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configs = await prisma.config.findMany();
    const configMap = {};
    configs.forEach(c => {
      // Don't expose actual passwords in plaintext; expose presence
      if (c.key.toLowerCase().includes('password')) {
        configMap[c.key] = c.value ? '••••••••' : '';
      } else {
        configMap[c.key] = c.value;
      }
    });
    return NextResponse.json({ success: true, configs: configMap });
  } catch (error) {
    console.error('Config GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  const user = await getSessionUser(request);
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
