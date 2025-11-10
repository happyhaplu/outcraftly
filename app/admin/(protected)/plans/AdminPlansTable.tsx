'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type AdminPlan = {
  id: number;
  name: string;
  maxEmailsPerMonth: number;
  maxProspects: number;
  maxCredits: number;
  isActive: boolean;
  isTrial: boolean;
  sortOrder: number;
  limits: {
    prospects: number;
    emailsPerMonth: number;
    credits: number;
  };
};

type Props = {
  plans: AdminPlan[];
};

type EditablePlan = AdminPlan;

const numberFormatter = new Intl.NumberFormat('en-US');

function serializePlan(plan: AdminPlan) {
  return { ...plan };
}

export function AdminPlansTable({ plans }: Props) {
  const [planState, setPlanState] = useState<EditablePlan[]>(() => plans.map(serializePlan));
  const [baselineState, setBaselineState] = useState<EditablePlan[]>(() => plans.map(serializePlan));
  const [pendingPlanId, setPendingPlanId] = useState<number | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const { toast } = useToast();

  const baselineMap = useMemo(() => new Map(baselineState.map((plan) => [plan.id, plan])), [baselineState]);

  const updatePlan = (planId: number, updates: Partial<EditablePlan>) => {
    setPlanState((prev) =>
      prev.map((plan) => (plan.id === planId ? { ...plan, ...updates } : plan))
    );
  };

  const updateBaseline = (planId: number, updates: Partial<EditablePlan>) => {
    setBaselineState((prev) =>
      prev.map((plan) => (plan.id === planId ? { ...plan, ...updates } : plan))
    );
  };

  const getChangedFields = (plan: EditablePlan, baseline: EditablePlan | undefined) => {
    if (!baseline) {
      return ['maxProspects', 'maxEmailsPerMonth', 'maxCredits'] as const;
    }

    const changed: Array<'maxProspects' | 'maxEmailsPerMonth' | 'maxCredits'> = [];

    if (plan.maxProspects !== baseline.maxProspects) {
      changed.push('maxProspects');
    }
    if (plan.maxEmailsPerMonth !== baseline.maxEmailsPerMonth) {
      changed.push('maxEmailsPerMonth');
    }
    if (plan.maxCredits !== baseline.maxCredits) {
      changed.push('maxCredits');
    }

    return changed;
  };

  const handleNumericChange = (
    planId: number,
    field: 'maxProspects' | 'maxEmailsPerMonth' | 'maxCredits',
    value: string
  ) => {
    const parsed = Number(value);

    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }

    updatePlan(planId, { [field]: parsed } as Partial<EditablePlan>);
  };

  const requestPlanUpdate = async (planId: number, payload: Partial<EditablePlan>) => {
    const response = await fetch(`/api/admin/plans/${planId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Unable to update plan.' }));
      throw new Error(data.error ?? 'Unable to update plan.');
    }

    const data = await response.json();
    return data.plan as AdminPlan;
  };

  const handleSave = (planId: number) => {
    if (planId < 0) {
      toast({
        title: 'Read-only plan data',
        description: 'Plan settings are read-only until the database is available.',
        variant: 'destructive'
      });
      return;
    }

    const currentPlan = planState.find((plan) => plan.id === planId);
    const baselinePlan = baselineMap.get(planId);

    if (!currentPlan) {
      return;
    }

    const changedFields = getChangedFields(currentPlan, baselinePlan);

    if (changedFields.length === 0) {
      toast({
        title: 'No changes detected',
        description: 'Update the limits before saving.'
      });
      return;
    }

    const payload: Partial<EditablePlan> = {};
    for (const field of changedFields) {
      payload[field] = currentPlan[field];
    }

    startTransition(() => {
      setPendingPlanId(planId);

      requestPlanUpdate(planId, payload)
        .then((updatedPlan) => {
          setPlanState((prev) => prev.map((plan) => (plan.id === planId ? updatedPlan : plan)));
          updateBaseline(planId, updatedPlan);
          toast({
            title: `${updatedPlan.name} limits updated`,
            description: 'The plan limits have been saved successfully.'
          });
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Unable to update plan.';
          toast({ title: 'Update failed', description: message, variant: 'destructive' });
        })
        .finally(() => {
          setPendingPlanId(null);
        });
    });
  };

  const togglePlanActive = (planId: number, shouldActivate: boolean) => {
    if (planId < 0) {
      toast({
        title: 'Read-only plan data',
        description: 'Plan status cannot change until the database is available.',
        variant: 'destructive'
      });
      return;
    }

    startTransition(async () => {
      setPendingPlanId(planId);

      try {
        const response = await fetch(
          `/api/admin/plans/${planId}/${shouldActivate ? 'reactivate' : 'deactivate'}`,
          { method: 'POST' }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: 'Plan status update failed.' }));
          throw new Error(data.error ?? 'Plan status update failed.');
        }

        const data = await response.json();
        const updatedPlan = data.plan as AdminPlan;
        setPlanState((prev) => prev.map((plan) => (plan.id === planId ? updatedPlan : plan)));
        updateBaseline(planId, updatedPlan);
        toast({
          title: shouldActivate ? 'Plan reactivated' : 'Plan deactivated',
          description: `${updatedPlan.name} is now ${shouldActivate ? 'active' : 'inactive'}.`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Plan status update failed.';
        toast({ title: 'Update failed', description: message, variant: 'destructive' });
      } finally {
        setPendingPlanId(null);
      }
    });
  };

  const getPlanStatusBadge = (plan: EditablePlan) => {
    if (!plan.isActive) {
      return <Badge variant="destructive">Inactive</Badge>;
    }

    if (plan.isTrial) {
      return <Badge variant="secondary">Trial</Badge>;
    }

    return null;
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[840px] w-full divide-y divide-border/60">
        <thead className="bg-muted/60">
          <tr className="text-left text-sm font-semibold text-muted-foreground">
            <th className="px-6 py-3">Plan</th>
            <th className="px-6 py-3">Prospects</th>
            <th className="px-6 py-3">Emails / Month</th>
            <th className="px-6 py-3">AI Credits</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 text-sm">
          {planState.map((plan) => {
            const baseline = baselineMap.get(plan.id);
            const changedFields = getChangedFields(plan, baseline);
            const hasPending = pendingPlanId === plan.id && isTransitionPending;
            const isFallbackPlan = plan.id < 0;
            const prospectsChanged = changedFields.includes('maxProspects');
            const emailsChanged = changedFields.includes('maxEmailsPerMonth');
            const creditsChanged = changedFields.includes('maxCredits');
            const formattedProspects = numberFormatter.format(plan.maxProspects);
            const formattedEmails = numberFormatter.format(plan.maxEmailsPerMonth);
            const formattedCredits = numberFormatter.format(plan.maxCredits);

            return (
              <tr key={plan.id} className="text-foreground">
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{plan.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {getPlanStatusBadge(plan)}
                      {plan.isTrial && <span>Default trial limits</span>}
                      {!plan.isActive && <span>Not assignable</span>}
                      {isFallbackPlan && <span>Database unavailable</span>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={plan.maxProspects}
                    disabled={isFallbackPlan}
                    onChange={(event) =>
                      handleNumericChange(plan.id, 'maxProspects', event.target.value)
                    }
                    className={cn(
                      'w-32 transition',
                      prospectsChanged && 'border-primary/70 ring-2 ring-primary/40'
                    )}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{formattedProspects} prospects</p>
                </td>
                <td className="px-6 py-4">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={plan.maxEmailsPerMonth}
                    disabled={isFallbackPlan}
                    onChange={(event) =>
                      handleNumericChange(plan.id, 'maxEmailsPerMonth', event.target.value)
                    }
                    className={cn(
                      'w-36 transition',
                      emailsChanged && 'border-primary/70 ring-2 ring-primary/40'
                    )}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{formattedEmails} emails</p>
                </td>
                <td className="px-6 py-4">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={plan.maxCredits}
                    disabled={isFallbackPlan}
                    onChange={(event) =>
                      handleNumericChange(plan.id, 'maxCredits', event.target.value)
                    }
                    className={cn(
                      'w-32 transition',
                      creditsChanged && 'border-primary/70 ring-2 ring-primary/40'
                    )}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{formattedCredits} credits</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {plan.isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                    {plan.isTrial && <Badge variant="secondary">Trial</Badge>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSave(plan.id)}
                      disabled={isFallbackPlan || changedFields.length === 0 || hasPending}
                    >
                      {hasPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      variant={plan.isActive ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => togglePlanActive(plan.id, !plan.isActive)}
                      disabled={isFallbackPlan || hasPending}
                    >
                      {plan.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
