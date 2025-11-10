import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth/session';
import { updateUserStatus } from '@/lib/db/queries';

const payloadSchema = z.object({
  status: z.enum(['active', 'inactive'])
});

export async function PATCH(request: NextRequest, context: any) {
  const { params } = context as { params: { id: string } };
  const session = await getSession();

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const userId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const refreshTrial = parsed.data.status === 'active';
  const updated = await updateUserStatus({ userId, status: parsed.data.status, refreshTrial });

  if (!updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      status: updated.status,
      trialExpiresAt: updated.trialExpiresAt
    }
  });
}
