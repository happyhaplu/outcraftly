import { getPlans } from '@/lib/db/queries';
import { AdminPlansTable } from './AdminPlansTable';

export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  const plans = await getPlans();

  const clientPlans = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    maxEmailsPerMonth: plan.maxEmailsPerMonth,
    maxProspects: plan.maxProspects,
    maxCredits: plan.maxCredits,
    isActive: plan.isActive,
    isTrial: plan.isTrial,
    sortOrder: plan.sortOrder,
    limits: plan.limits
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Plan Management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Adjust usage limits, mark plans as active or inactive, and manage trial access.
        </p>
      </div>

      <AdminPlansTable plans={clientPlans} />
    </div>
  );
}
