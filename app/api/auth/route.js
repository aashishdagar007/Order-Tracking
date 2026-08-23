import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { hashPassword, verifyPassword, createSessionToken, getSessionUser, updateWorkerHeartbeat } from '@/lib/auth';

export async function POST(request) {
  try {
    const { action, username, name, role, password } = await request.json();

    if (action === 'logout') {
      const user = await getSessionUser(request);
      try {
        const cookieStore = await cookies();
        cookieStore.delete('token');
      } catch (e) {}

      const logName = user?.name || name || 'Unknown User';
      const logRole = user?.role || role || 'UNKNOWN';

      await prisma.log.create({
        data: {
          userId: user?.userId || null,
          name: logName,
          role: logRole,
          action: 'Logout',
          detail: 'User logged out'
        }
      });
      return NextResponse.json({ success: true });
    }

    if (action !== 'login') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const loginIdentifier = (username || name || '').trim();
    if (!loginIdentifier || !password) {
      return NextResponse.json({ error: 'Username / Name and password are required' }, { status: 400 });
    }

    // Find user by username or name
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: loginIdentifier },
          { name: loginIdentifier }
        ]
      }
    });

    // If no user exists and database is fresh, create default admin
    if (!user && (role === 'ADMIN' || loginIdentifier.toLowerCase() === 'admin')) {
      user = await prisma.user.create({
        data: {
          username: 'admin',
          name: 'Master Admin',
          passwordHash: hashPassword('admin123'),
          role: 'ADMIN',
          canViewOrders: true,
          canPickPack: true,
          canDispatch: true,
          canUpload: true,
          canExport: true,
          canViewLogs: true,
        }
      });
    }

    if (!user) {
      return NextResponse.json({ error: 'Account not found. Please contact your warehouse admin.' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Your account is deactivated. Please contact your admin.' }, { status: 403 });
    }

    const isPasswordValid = verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid credentials. Please try again.' }, { status: 401 });
    }

    // Update lastSeen
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastSeen: new Date(),
        lastAction: 'Logged into warehouse terminal',
        lastActionAt: new Date(),
      }
    });

    // Generate JWT with permissions and admin scope
    const token = await createSessionToken(user);

    // Set cookie (secure: false for LAN Wi-Fi HTTP, sameSite: 'lax')
    try {
      const cookieStore = await cookies();
      cookieStore.set('token', token, {
        httpOnly: true,
        secure: false, // Must be false for local HTTP LAN access (http://192.168.x.x:3000)
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    } catch (e) {}

    // Log the login event
    await prisma.log.create({
      data: {
        userId: user.id,
        name: user.name,
        role: user.role,
        action: 'Login',
        detail: `Logged in via ${user.role} terminal`
      }
    });

    return NextResponse.json({
      success: true,
      token,
      role: user.role,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        permissions: {
          canViewOrders: user.canViewOrders,
          canPickPack: user.canPickPack,
          canDispatch: user.canDispatch,
          canUpload: user.canUpload,
          canExport: user.canExport,
          canViewLogs: user.canViewLogs,
        }
      }
    });
  } catch (error) {
    console.error('Auth API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ user: null });
    }

    // Refresh user state from db to verify active status
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        adminId: true,
        canViewOrders: true,
        canPickPack: true,
        canDispatch: true,
        canUpload: true,
        canExport: true,
        canViewLogs: true,
        isActive: true,
      }
    });

    if (!dbUser || !dbUser.isActive) {
      try {
        const cookieStore = await cookies();
        cookieStore.delete('token');
      } catch (e) {}
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        ...user,
        permissions: {
          canViewOrders: dbUser.canViewOrders,
          canPickPack: dbUser.canPickPack,
          canDispatch: dbUser.canDispatch,
          canUpload: dbUser.canUpload,
          canExport: dbUser.canExport,
          canViewLogs: dbUser.canViewLogs,
        }
      }
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function PATCH(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { actionText } = await request.json();
    await updateWorkerHeartbeat(user.userId, actionText);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update heartbeat' }, { status: 500 });
  }
}
