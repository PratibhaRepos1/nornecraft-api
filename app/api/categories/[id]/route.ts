import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../../../lib/db';
import { isAdmin } from '../../../../lib/admin-auth';
import { slugify } from '../route';

interface CategoryRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MysqlError extends Error {
  code?: string;
  errno?: number;
}

function isDuplicateKey(err: unknown): boolean {
  const e = err as MysqlError;
  return e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = parseId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  try {
    const [rows] = await db.query<CategoryRow[]>(
      `SELECT id, name, slug, description, created_at, updated_at
       FROM categories WHERE id = :id LIMIT 1`,
      { id: numericId }
    );

    const category = rows[0];
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    return NextResponse.json(category);
  } catch (err) {
    console.error(`GET /api/categories/${id} failed:`, err);
    return NextResponse.json({ error: 'Failed to load category' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    console.warn('PUT /api/categories/[id] denied:', auth.reason);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const numericId = parseId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
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

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query<CategoryRow[]>(
      'SELECT id, name FROM categories WHERE id = :id LIMIT 1',
      { id: numericId }
    );
    const existing = existingRows[0];
    if (!existing) {
      await conn.rollback();
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    await conn.execute<ResultSetHeader>(
      `UPDATE categories
         SET name = :name,
             slug = :slug,
             description = :description
       WHERE id = :id`,
      { id: numericId, name, slug, description }
    );

    // Keep products.category text in sync when the category is renamed —
    // products.category is a denormalized string, not a foreign key.
    if (existing.name !== name) {
      await conn.execute<ResultSetHeader>(
        'UPDATE products SET category = :newName WHERE category = :oldName',
        { newName: name, oldName: existing.name }
      );
    }

    await conn.commit();
    return NextResponse.json({ id: numericId, name, slug, description });
  } catch (err) {
    await conn.rollback();
    if (isDuplicateKey(err)) {
      return NextResponse.json(
        { error: 'A category with that name or slug already exists' },
        { status: 409 }
      );
    }
    console.error(`PUT /api/categories/${id} failed:`, err);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    console.warn('DELETE /api/categories/[id] denied:', auth.reason);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const numericId = parseId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  try {
    const [result] = await db.execute<ResultSetHeader>(
      'DELETE FROM categories WHERE id = :id',
      { id: numericId }
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json({ id: numericId, deleted: true });
  } catch (err) {
    console.error(`DELETE /api/categories/${id} failed:`, err);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
