import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key-change-in-production');

export async function POST(request) {
  try {
    const { action, name, role, password } = await request.json();

    if (action === 'logout') {
      const cookieStore = await cookies();
      cookieStore.delete('token');
      
      // Always log logout event, use provided name/role or defaults
      const logName = name || 'Unknown User';
      const logRole = role || 'UNKNOWN';
      
      await prisma.log.create({
        data: { name: logName, role: logRole, action: 'Logout', detail: 'User logged out' }
      });
      return NextResponse.json({ success: true });
    }

    // Login Action
    const configKey = role === 'ADMIN' ? 'adminPassword' : 'workerPassword';
    let config = await prisma.config.findUnique({ where: { key: configKey } });
    
    // Seed default if not exists
    if (!config) {
      const defaultValue = role === 'ADMIN' ? 'admin123' : 'worker123';
      config = await prisma.config.create({
        data: { key: configKey, value: defaultValue }
      });
    }

    if (config.value !== password) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Generate JWT
    const token = await new SignJWT({ name, role })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(secret);

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // Log the login event
    await prisma.log.create({
      data: { name, role, action: 'Login', detail: 'User logged in' }
    });

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error('Auth API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const { payload } = await jwtVerify(token, secret);
    return NextResponse.json({ user: payload });
  } catch (error) {
    return NextResponse.json({ user: null });
  }
}
