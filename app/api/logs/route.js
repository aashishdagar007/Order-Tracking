import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN' && user.permissions?.canViewLogs !== true) {
    return NextResponse.json({ error: 'Forbidden: Log view permission required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filterName = searchParams.get('name');

    const where = filterName ? { name: { contains: filterName } } : {};

    const logs = await prisma.log.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 200
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Logs API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
