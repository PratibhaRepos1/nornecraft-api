import { NextRequest, NextResponse } from 'next/server';
import { adminUsername, isAdmin } from '../../../lib/admin-auth';

export async function GET(request: NextRequest) {
  const auth = isAdmin(request);
  if (!auth.allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, username: adminUsername() });
}
