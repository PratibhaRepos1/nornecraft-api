import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { Client as FtpClient } from 'basic-ftp';
import { isAdmin } from '../../../lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png'] as const;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function sanitizeFilename(rawName: string): { filename: string; ext: string } | null {
  const base = rawName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;

  const ext = base.slice(dot + 1).toLowerCase();
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return null;

  const stem = base
    .slice(0, dot)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!stem) return null;
  return { filename: `${stem}.${ext}`, ext };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    console.warn('POST /api/upload denied:', auth.reason);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error('POST /api/upload: invalid multipart body', err);
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(fileEntry.type)) {
    return NextResponse.json(
      { error: 'Only JPEG and PNG images are allowed' },
      { status: 415 }
    );
  }

  if (fileEntry.size === 0) {
    return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
  }
  if (fileEntry.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit` },
      { status: 413 }
    );
  }

  const sanitized = sanitizeFilename(fileEntry.name);
  if (!sanitized) {
    return NextResponse.json(
      { error: 'Filename must end with .jpg, .jpeg or .png' },
      { status: 400 }
    );
  }

  let host: string;
  let user: string;
  let password: string;
  try {
    host = requiredEnv('FTP_HOST');
    user = requiredEnv('FTP_USER');
    password = requiredEnv('FTP_PASSWORD');
  } catch (err) {
    console.error('POST /api/upload: FTP env not configured', err);
    return NextResponse.json(
      { error: 'Upload destination not configured' },
      { status: 500 }
    );
  }

  const port = process.env.FTP_PORT ? Number(process.env.FTP_PORT) : 21;
  const secure = process.env.FTP_SECURE === 'true';
  const remoteDir = (process.env.FTP_REMOTE_DIR ?? '/public_html/products').replace(/\/+$/, '');

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const client = new FtpClient(30_000);

  try {
    await client.access({ host, port, user, password, secure });
    await client.ensureDir(remoteDir);
    await client.uploadFrom(Readable.from(buffer), sanitized.filename);
  } catch (err) {
    console.error('POST /api/upload: FTP transfer failed', err);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 502 });
  } finally {
    client.close();
  }

  return NextResponse.json({ filename: sanitized.filename }, { status: 201 });
}
