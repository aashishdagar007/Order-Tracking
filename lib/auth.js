import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'warehouse-wms-super-secret-jwt-key-2026');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.includes(':')) {
    return password === storedHash; // backward compatibility
  }
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

export async function createSessionToken(user) {
  return await new SignJWT({
    userId: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    adminId: user.adminId || null,
    permissions: {
      canViewOrders: user.canViewOrders ?? true,
      canPickPack: user.canPickPack ?? true,
      canDispatch: user.canDispatch ?? false,
      canUpload: user.canUpload ?? false,
      canExport: user.canExport ?? false,
      canViewLogs: user.canViewLogs ?? false,
    }
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);
}

export async function getSessionUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function updateWorkerHeartbeat(userId, actionText = null) {
  try {
    if (!userId) return;
    const data = {
      lastSeen: new Date(),
    };
    if (actionText) {
      data.lastAction = actionText;
      data.lastActionAt = new Date();
    }
    await prisma.user.update({
      where: { id: userId },
      data,
    });
  } catch {}
}
