import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, hashPassword } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // Admins see workers under them (or all workers if super-admin)
    const where = session.adminId ? { adminId: session.userId } : { role: 'WORKER' };

    const workers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        adminId: true,
        canViewOrders: true,
        canPickPack: true,
        canDispatch: true,
        canUpload: true,
        canExport: true,
        canViewLogs: true,
        isActive: true,
        lastSeen: true,
        lastAction: true,
        lastActionAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ workers });
  } catch (error) {
    console.error('Users GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const {
      username,
      name,
      password,
      canViewOrders = true,
      canPickPack = true,
      canDispatch = false,
      canUpload = false,
      canExport = false,
      canViewLogs = false,
    } = await request.json();

    if (!username?.trim() || !name?.trim() || !password) {
      return NextResponse.json({ error: 'Username, name, and password are required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      return NextResponse.json({ error: 'Username already taken. Please choose another.' }, { status: 400 });
    }

    const passwordHash = hashPassword(password);

    const newWorker = await prisma.user.create({
      data: {
        username: cleanUsername,
        name: name.trim(),
        passwordHash,
        role: 'WORKER',
        adminId: session.userId,
        canViewOrders: Boolean(canViewOrders),
        canPickPack: Boolean(canPickPack),
        canDispatch: Boolean(canDispatch),
        canUpload: Boolean(canUpload),
        canExport: Boolean(canExport),
        canViewLogs: Boolean(canViewLogs),
        isActive: true,
        lastAction: 'Account created by admin',
        lastActionAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        canViewOrders: true,
        canPickPack: true,
        canDispatch: true,
        canUpload: true,
        canExport: true,
        canViewLogs: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Log admin action
    await prisma.log.create({
      data: {
        userId: session.userId,
        name: session.name,
        role: session.role,
        action: 'Create Worker',
        detail: `Created worker "${newWorker.name}" (@${newWorker.username})`,
      },
    });

    return NextResponse.json({ success: true, worker: newWorker });
  } catch (error) {
    console.error('Users POST Error:', error);
    return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const {
      id,
      name,
      password,
      canViewOrders,
      canPickPack,
      canDispatch,
      canUpload,
      canExport,
      canViewLogs,
      isActive,
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Worker ID is required' }, { status: 400 });
    }

    const updateData = {};
    if (name?.trim()) updateData.name = name.trim();
    if (password) updateData.passwordHash = hashPassword(password);
    if (typeof canViewOrders === 'boolean') updateData.canViewOrders = canViewOrders;
    if (typeof canPickPack === 'boolean') updateData.canPickPack = canPickPack;
    if (typeof canDispatch === 'boolean') updateData.canDispatch = canDispatch;
    if (typeof canUpload === 'boolean') updateData.canUpload = canUpload;
    if (typeof canExport === 'boolean') updateData.canExport = canExport;
    if (typeof canViewLogs === 'boolean') updateData.canViewLogs = canViewLogs;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;

    const updatedWorker = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        canViewOrders: true,
        canPickPack: true,
        canDispatch: true,
        canUpload: true,
        canExport: true,
        canViewLogs: true,
        isActive: true,
      },
    });

    await prisma.log.create({
      data: {
        userId: session.userId,
        name: session.name,
        role: session.role,
        action: 'Update Worker',
        detail: `Updated settings for worker "${updatedWorker.name}" (@${updatedWorker.username})`,
      },
    });

    return NextResponse.json({ success: true, worker: updatedWorker });
  } catch (error) {
    console.error('Users PUT Error:', error);
    return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Worker ID is required' }, { status: 400 });
    }

    const deleted = await prisma.user.delete({
      where: { id },
    });

    await prisma.log.create({
      data: {
        userId: session.userId,
        name: session.name,
        role: session.role,
        action: 'Delete Worker',
        detail: `Deleted worker "${deleted.name}" (@${deleted.username})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Users DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
  }
}
