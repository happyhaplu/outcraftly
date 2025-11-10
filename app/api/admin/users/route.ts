import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getAdminUsers } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const url = new URL(request.url);
  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const statusParam = url.searchParams.get('status');
  const status = statusParam === 'active' || statusParam === 'inactive' ? statusParam : undefined;

  const data = await getAdminUsers({ page: pageParam, status });

  return NextResponse.json(data);
}
