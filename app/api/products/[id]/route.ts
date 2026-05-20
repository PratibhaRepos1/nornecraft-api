import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../../../lib/db';
import { isAdmin } from '../../../../lib/admin-auth';

interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  price: number;
  category: string;
  image: string | null;
  description: string | null;
  stock: number;
  rating: number;
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
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  try {
    const [rows] = await db.query<ProductRow[]>(
      `SELECT id, name, price, category, image, description, stock, rating
       FROM products WHERE id = :id LIMIT 1`,
      { id: numericId }
    );

    const product = rows[0];
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...product,
      price: Number(product.price),
      rating: Number(product.rating),
    });
  } catch (err) {
    console.error(`GET /api/products/${id} failed:`, err);
    return NextResponse.json({ error: 'Failed to load product' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    console.warn('PUT /api/products/[id] denied:', auth.reason);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const numericId = parseId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = body as Partial<{
    name: string;
    price: number | string;
    category: string;
    image: string;
    description: string;
    stock: number | string;
    rating: number | string;
  }>;

  const name = data.name?.trim();
  const category = data.category?.trim();
  const price = data.price === undefined || data.price === '' ? NaN : Number(data.price);
  const stock = data.stock === undefined || data.stock === '' ? 0 : Number(data.stock);
  const rating = data.rating === undefined || data.rating === '' ? 0 : Number(data.rating);
  const image = data.image?.trim() ?? '';
  const description = data.description?.trim() ?? '';

  if (!name || !category || Number.isNaN(price) || price < 0) {
    return NextResponse.json(
      { error: 'name, category and a non-negative price are required' },
      { status: 400 }
    );
  }
  if (Number.isNaN(stock) || stock < 0) {
    return NextResponse.json({ error: 'stock must be a non-negative number' }, { status: 400 });
  }
  if (Number.isNaN(rating) || rating < 0 || rating > 5) {
    return NextResponse.json({ error: 'rating must be between 0 and 5' }, { status: 400 });
  }

  try {
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE products
         SET name = :name,
             price = :price,
             category = :category,
             image = :image,
             description = :description,
             stock = :stock,
             rating = :rating
       WHERE id = :id`,
      { id: numericId, name, price, category, image, description, stock, rating }
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: numericId,
      name,
      price,
      category,
      image,
      description,
      stock,
      rating,
    });
  } catch (err) {
    console.error(`PUT /api/products/${id} failed:`, err);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    console.warn('DELETE /api/products/[id] denied:', auth.reason);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const numericId = parseId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  try {
    const [result] = await db.execute<ResultSetHeader>(
      'DELETE FROM products WHERE id = :id',
      { id: numericId }
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ id: numericId, deleted: true });
  } catch (err) {
    console.error(`DELETE /api/products/${id} failed:`, err);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
