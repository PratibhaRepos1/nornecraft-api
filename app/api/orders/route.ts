import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../../lib/db';

export const runtime = 'nodejs';

interface ProductPriceRow extends RowDataPacket {
  id: number;
  name: string;
  price: number;
  stock: number;
}

interface OrderItemInput {
  id: number | string;
  name?: string;
  quantity: number | string;
  price?: number | string;
}

interface OrderItemSnapshot {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface CustomerInput {
  fullName?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function generateOrderId(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const suffix = randomBytes(4).toString('hex');
  return `ord_${yyyy}_${mm}_${dd}_${suffix}`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = body as Partial<{
    customer: CustomerInput;
    items: OrderItemInput[];
    subtotal: number | string;
    shipping: number | string;
    total: number | string;
    currency: string;
  }>;

  const customer = data.customer;
  const fullName = customer?.fullName?.trim();
  const email = customer?.email?.trim().toLowerCase();
  const address = customer?.address?.trim();
  const city = customer?.city?.trim() ?? '';
  const postalCode = customer?.postalCode?.trim() ?? '';
  const country = customer?.country?.trim() ?? '';

  if (!fullName || !email || !address) {
    return NextResponse.json({ error: 'Missing customer fields' }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const rawItems = data.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json({ error: 'No items' }, { status: 400 });
  }

  const itemIds: number[] = [];
  const quantitiesById = new Map<number, number>();
  for (const item of rawItems) {
    const id = Number(item?.id);
    const qty = Number(item?.quantity);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Invalid item quantity' }, { status: 400 });
    }
    itemIds.push(id);
    quantitiesById.set(id, (quantitiesById.get(id) ?? 0) + qty);
  }

  const shipping = data.shipping === undefined || data.shipping === '' ? 0 : Number(data.shipping);
  if (Number.isNaN(shipping) || shipping < 0) {
    return NextResponse.json({ error: 'Invalid shipping' }, { status: 400 });
  }

  const clientTotal = Number(data.total);
  if (Number.isNaN(clientTotal) || clientTotal <= 0) {
    return NextResponse.json({ error: 'Invalid total' }, { status: 400 });
  }

  const currency = (data.currency?.trim() || 'NOK').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
  }

  // Re-price from the products table — never trust client-supplied prices.
  let priceRows: ProductPriceRow[];
  try {
    const placeholders = itemIds.map((_, i) => `:id${i}`).join(',');
    const params: Record<string, number> = {};
    itemIds.forEach((id, i) => {
      params[`id${i}`] = id;
    });
    const [rows] = await db.query<ProductPriceRow[]>(
      `SELECT id, name, price, stock FROM products WHERE id IN (${placeholders})`,
      params
    );
    priceRows = rows;
  } catch (err) {
    console.error('POST /api/orders: product lookup failed', err);
    return NextResponse.json({ error: 'Failed to verify items' }, { status: 500 });
  }

  const priceById = new Map(priceRows.map((r) => [r.id, r]));
  const snapshots: OrderItemSnapshot[] = [];
  let serverSubtotal = 0;

  for (const [id, qty] of quantitiesById) {
    const row = priceById.get(id);
    if (!row) {
      return NextResponse.json({ error: `Product ${id} not found` }, { status: 400 });
    }
    if (row.stock < qty) {
      return NextResponse.json(
        { error: `Product ${row.name} has insufficient stock` },
        { status: 409 }
      );
    }
    const unitPrice = round2(Number(row.price));
    const lineTotal = round2(unitPrice * qty);
    serverSubtotal = round2(serverSubtotal + lineTotal);
    snapshots.push({ id, name: row.name, quantity: qty, unitPrice, lineTotal });
  }

  const serverTotal = round2(serverSubtotal + round2(shipping));

  if (Math.abs(serverTotal - clientTotal) > 0.01) {
    return NextResponse.json(
      {
        error: 'Total mismatch — prices have changed, please refresh your cart',
        serverSubtotal,
        serverTotal,
      },
      { status: 409 }
    );
  }

  const orderId = generateOrderId();
  const customerSnapshot = { fullName, email, address, city, postalCode, country };

  try {
    await db.execute<ResultSetHeader>(
      `INSERT INTO orders
         (id, status, customer_json, items_json, subtotal, shipping, total, currency)
       VALUES
         (:id, 'pending', :customer, :items, :subtotal, :shipping, :total, :currency)`,
      {
        id: orderId,
        customer: JSON.stringify(customerSnapshot),
        items: JSON.stringify(snapshots),
        subtotal: serverSubtotal,
        shipping: round2(shipping),
        total: serverTotal,
        currency,
      }
    );
  } catch (err) {
    console.error('POST /api/orders: insert failed', err);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }

  return NextResponse.json({ orderId, status: 'pending' });
}
