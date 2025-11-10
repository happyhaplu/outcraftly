import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { getPlans } from '@/lib/db/queries';

export async function GET() {
  const session = await getSession();

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const plans = await getPlans();

  return NextResponse.json({
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      maxEmailsPerMonth: plan.maxEmailsPerMonth,
      maxProspects: plan.maxProspects,
      maxCredits: plan.maxCredits,
      isActive: plan.isActive,
      isTrial: plan.isTrial,
      sortOrder: plan.sortOrder,
      limits: plan.limits,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString()
    }))
  });
}
