import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { setPlanActiveStatus } from '@/lib/db/queries';

type PlanRouteParams = { id?: string | string[] };
type PlanRouteContext = { params: Promise<PlanRouteParams> };

export async function POST(
  _request: NextRequest,
  context: PlanRouteContext
) {
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

  let updated;
  try {
    updated = await setPlanActiveStatus(planId, false);
  } catch (error) {
    console.error('[plans/deactivate] Failed to deactivate plan', error);
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
