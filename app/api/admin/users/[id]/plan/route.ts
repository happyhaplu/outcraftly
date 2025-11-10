import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth/session';
import { InvalidPlanAssignmentError, updateUserPlan } from '@/lib/db/queries';
import { USER_PLAN_VALUES } from '@/lib/config/plans';

const payloadSchema = z.object({
  plan: z.enum(USER_PLAN_VALUES)
});

export async function PATCH(request: NextRequest, context: any) {
  const maybeParams = context?.params;
  const resolvedParams = (typeof maybeParams?.then === 'function'
    ? await maybeParams
    : maybeParams) as { id?: string | string[] } | undefined;
  const userIdParam = Array.isArray(resolvedParams?.id)
    ? resolvedParams?.id[0]
    : resolvedParams?.id;
  const session = await getSession();

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const userId = Number.parseInt(String(userIdParam ?? ''), 10);
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

  try {
    const result = await updateUserPlan({ userId, plan: parsed.data.plan });

    if (!result) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const planMeta = result.plan ?? null;

    return NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        plan: result.user.plan,
        limits: planMeta?.limits ?? null,
        planIsActive: planMeta?.isActive ?? null,
        planIsTrial: planMeta?.isTrial ?? null
      }
    });
  } catch (error) {
    if (error instanceof InvalidPlanAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}
