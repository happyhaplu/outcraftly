import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth/session';
import { resolvePrimaryTeamIdForUser, setTeamPaymentStatus } from '@/lib/db/queries';

const payloadSchema = z
  .object({
    teamId: z.number().int().positive().optional(),
    userId: z.number().int().positive().optional()
  })
  .refine((data) => typeof data.teamId === 'number' || typeof data.userId === 'number', {
    message: 'teamId or userId is required'
  });

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'Invalid payload';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { teamId: payloadTeamId, userId } = parsed.data;
  let teamId = payloadTeamId ?? null;

  if (!teamId && typeof userId === 'number') {
    teamId = await resolvePrimaryTeamIdForUser(userId);
    if (!teamId) {
      return NextResponse.json({ error: 'Team not found for user' }, { status: 404 });
    }
  }

  if (!teamId) {
    return NextResponse.json({ error: 'Unable to resolve team' }, { status: 400 });
  }

  try {
    const updated = await setTeamPaymentStatus(teamId, 'paid');
    if (!updated) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    return NextResponse.json({
      team: {
        id: updated.id,
        paymentStatus: updated.paymentStatus,
        subscriptionStatus: updated.subscriptionStatus,
        planName: updated.planName
      }
    });
  } catch (err: any) {
    // If the DB is missing the new column, show a helpful message to operators
    if (err?.message && err.message.includes('payment_status')) {
      return NextResponse.json(
        { error: 'Database schema missing billing column. Run migrations: pnpm db:migrate' },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
