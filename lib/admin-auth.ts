import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

const ADMIN_IPS = (process.env.ADMIN_IP_ALLOWLIST ?? '171.101.163.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME ?? '').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseBasicAuth(
  header: string | null
): { username: string; password: string } | null {
  if (!header) return null;
  const match = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf-8');
  } catch {
    return null;
  }
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return {
    username: decoded.slice(0, idx),
    password: decoded.slice(idx + 1),
  };
}

export interface AdminAuthResult {
  allowed: boolean;
  reason: string;
}

export function isAdmin(request: NextRequest): AdminAuthResult {
  // Username/password check first — survives IP changes (router reboots, mobile data, VPN)
  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    const creds = parseBasicAuth(request.headers.get('authorization'));
    if (creds) {
      const userOk = safeEqual(creds.username, ADMIN_USERNAME);
      const passOk = safeEqual(creds.password, ADMIN_PASSWORD);
      if (userOk && passOk) {
        return { allowed: true, reason: 'basic-auth' };
      }
      return { allowed: false, reason: 'bad-credentials' };
    }
  }

  // IP allowlist fallback
  const ip = getClientIp(request);
  if (!ip) {
    return { allowed: false, reason: 'no-client-ip' };
  }
  if (ADMIN_IPS.includes(ip)) {
    return { allowed: true, reason: `ip:${ip}` };
  }
  return { allowed: false, reason: `ip-not-allowed:${ip}` };
}

export function adminUsername(): string {
  return ADMIN_USERNAME;
}
