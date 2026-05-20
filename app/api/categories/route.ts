import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../../lib/db';
import { isAdmin } from '../../../lib/admin-auth';

interface CategoryRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

interface MysqlError extends Error {
  code?: string;
  errno?: number;
}

function isDuplicateKey(err: unknown): boolean {
  const e = err as MysqlError;
  return e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;
}

export async function GET() {
  try {
    const [rows] = await db.query<CategoryRow[]>(
      `SELECT id, name, slug, description, created_at, updated_at
       FROM categories
       ORDER BY name ASC`
    );

    return NextResponse.json({
      categories: rows,
      total: rows.length,
    });
  } catch (err) {
    console.error('GET /api/categories failed:', err);
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    console.warn('POST /api/categories denied:', auth.reason);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = body as Partial<{
    name: string;
    slug: string;
    description: string;
  }>;

  const name = data.name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.length > 120) {
    return NextResponse.json({ error: 'name must be 120 characters or fewer' }, { status: 400 });
  }

  const providedSlug = data.slug?.trim();
  const slug = providedSlug ? slugify(providedSlug) : slugify(name);
  if (!slug) {
    return NextResponse.json({ error: 'slug could not be derived from name' }, { status: 400 });
  }

  const description = data.description?.trim() || null;

  try {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO categories (name, slug, description)
       VALUES (:name, :slug, :description)`,
      { name, slug, description }
    );

    return NextResponse.json(
      { id: result.insertId, name, slug, description },
      { status: 201 }
    );
  } catch (err) {
    if (isDuplicateKey(err)) {
      return NextResponse.json(
        { error: 'A category with that name or slug already exists' },
        { status: 409 }
      );
    }
    console.error('POST /api/categories failed:', err);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
