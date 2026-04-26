import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { db } from '../../../../lib/db';

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
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
