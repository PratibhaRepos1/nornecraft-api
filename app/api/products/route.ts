import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../../lib/db';
import { isAdmin } from '../../../lib/admin-auth';

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category');
  const sort = searchParams.get('sort');
  const search = searchParams.get('search');

  const where: string[] = [];
  const params: Record<string, string> = {};

  if (category) {
    where.push('LOWER(category) = LOWER(:category)');
    params.category = category;
  }

  if (search) {
    where.push('(LOWER(name) LIKE :term OR LOWER(description) LIKE :term)');
    params.term = `%${search.toLowerCase()}%`;
  }

  let orderBy = 'id ASC';
  if (sort === 'price_asc') orderBy = 'price ASC';
  else if (sort === 'price_desc') orderBy = 'price DESC';
  else if (sort === 'rating') orderBy = 'rating DESC';
  else if (sort === 'name') orderBy = 'name ASC';

  const sql = `SELECT id, name, price, category, image, description, stock, rating
               FROM products
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${orderBy}`;

  try {
    const [rows] = await db.query<ProductRow[]>(sql, params);
    const [catRows] = await db.query<RowDataPacket[]>(
      'SELECT DISTINCT category FROM products ORDER BY category'
    );

    return NextResponse.json({
      products: rows.map((r) => ({ ...r, price: Number(r.price), rating: Number(r.rating) })),
      total: rows.length,
      categories: catRows.map((r) => r.category as string),
    });
  } catch (err) {
    console.error('GET /api/products failed:', err);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    console.warn('POST /api/products denied:', auth.reason);
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
      `INSERT INTO products (name, price, category, image, description, stock, rating)
       VALUES (:name, :price, :category, :image, :description, :stock, :rating)`,
      { name, price, category, image, description, stock, rating }
    );

    return NextResponse.json(
      {
        id: result.insertId,
        name,
        price,
        category,
        image,
        description,
        stock,
        rating,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/products failed:', err);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
