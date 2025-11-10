import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth/session';
import { updatePlanById } from '@/lib/db/queries';

type PlanRouteParams = { id?: string | string[] };
type PlanRouteContext = { params: Promise<PlanRouteParams> };

const nonNegativeInt = z.coerce.number().int().min(0);

const payloadSchema = z
  .object({
    maxEmailsPerMonth: nonNegativeInt.optional(),
    maxProspects: nonNegativeInt.optional(),
    maxCredits: nonNegativeInt.optional(),
    isTrial: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one property must be provided.'
  });

export async function PATCH(request: NextRequest, context: PlanRouteContext) {
  const session = await getSession();

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const resolvedParams = await context.params;
  const planIdParam = Array.isArray(resolvedParams.id)
    ? resolvedParams.id[0]
    : resolvedParams.id;
  const planId = Number.parseInt(String(planIdParam ?? ''), 10);

  if (!Number.isFinite(planId)) {
    return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 });
  }

  if (planId < 0) {
    return NextResponse.json(
      { error: 'Fallback plans cannot be modified while the database is unavailable.' },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const payload = parsed.data;

  let updated;
  try {
    updated = await updatePlanById(planId, payload);
  } catch (error) {
    console.error('[plans/update] Failed to update plan', error);
    return NextResponse.json({ error: 'Unable to update plan' }, { status: 503 });
  }

  if (!updated) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  return NextResponse.json({
    plan: {
      id: updated.id,
      name: updated.name,
      maxEmailsPerMonth: updated.maxEmailsPerMonth,
      maxProspects: updated.maxProspects,
      maxCredits: updated.maxCredits,
      isActive: updated.isActive,
      isTrial: updated.isTrial,
      sortOrder: updated.sortOrder,
      limits: updated.limits,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    }
  });
}
