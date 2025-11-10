'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { UsageMetricsCell } from '@/app/admin/users/UsageMetricsCell';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AdminUserSummary, AdminUserListResult } from '@/lib/db/queries';

type Props = {
  users: AdminUserSummary[];
  pagination: AdminUserListResult['pagination'];
  statusFilter: 'all' | 'active' | 'inactive';
  plans: Array<{
    id: number;
    name: string;
    isActive: boolean;
    isTrial: boolean;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

function buildPageHref(page: number, statusFilter: Props['statusFilter']) {
  const params = new URLSearchParams();
  if (statusFilter !== 'all') {
    params.set('status', statusFilter);
  }
  if (page > 1) {
    params.set('page', String(page));
  }
  const query = params.toString();
  return query.length > 0 ? `/admin/users?${query}` : '/admin/users';
}

export function AdminUsersTable({ users, pagination, statusFilter, plans }: Props) {
  const [userRows, setUserRows] = useState<AdminUserSummary[]>(() => users);
  const { page, totalPages } = pagination;
  const hasUsers = userRows.length > 0;
  const router = useRouter();
  const { toast } = useToast();
  const [statusMutatingUserId, setStatusMutatingUserId] = useState<number | null>(null);
  const [statusPending, startStatusTransition] = useTransition();
  const [planMutatingUserId, setPlanMutatingUserId] = useState<number | null>(null);
  const [planPending, startPlanTransition] = useTransition();
  const planFallbackName = plans[0]?.name ?? 'Starter';

  useEffect(() => {
    setUserRows(users);
  }, [users]);

  const handleToggleStatus = (user: AdminUserSummary) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    setStatusMutatingUserId(user.id);

    startStatusTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${user.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus })
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const errorMessage = body?.error ?? 'Failed to update user status.';
          throw new Error(errorMessage);
        }

        toast({
          title: `User ${nextStatus === 'active' ? 'activated' : 'deactivated'}`,
          description:
            nextStatus === 'active'
              ? 'The user has been reactivated and their trial window refreshed.'
              : 'The user is now inactive and cannot access core features.'
        });

        router.refresh();
      } catch (error) {
        toast({
          title: 'Unable to update status',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'destructive'
        });
      } finally {
        setStatusMutatingUserId(null);
      }
    });
  };

  const handlePlanChange = (
    event: ChangeEvent<HTMLSelectElement>,
    user: AdminUserSummary
  ) => {
    const nextPlan = event.target.value;
    const currentPlan = user.plan ?? planFallbackName;

    if (!nextPlan || nextPlan === currentPlan) {
      return;
    }

    if (!plans.some((plan) => plan.name === nextPlan)) {
      toast({
        title: 'Unknown plan',
        description: 'Select one of the available plans before saving.',
        variant: 'destructive'
      });
      event.target.value = currentPlan;
      return;
    }

    const previousPlan = currentPlan;
    const selectElement = event.target;

    setPlanMutatingUserId(user.id);

    startPlanTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${user.id}/plan`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: nextPlan })
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const errorMessage = body?.error ?? 'Failed to update user plan.';
          throw new Error(errorMessage);
        }

        toast({
          title: 'Plan updated',
          description: `${user.email} is now on the ${nextPlan} plan.`
        });

        router.refresh();
      } catch (error) {
        selectElement.value = previousPlan;
        toast({
          title: 'Unable to update plan',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'destructive'
        });
      } finally {
        setPlanMutatingUserId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full divide-y divide-border/60">
            <thead className="bg-muted/60">
              <tr className="text-left text-sm font-semibold text-muted-foreground">
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Signup Date</th>
                <th className="px-6 py-3">Trial Status</th>
                <th className="px-6 py-3">Plan</th>
                <th className="px-6 py-3">Prospects Usage</th>
                <th className="px-6 py-3">Emails This Month</th>
                <th className="px-6 py-3">Account Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {!hasUsers && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No users match the selected filters yet.
                  </td>
                </tr>
              )}
            {userRows.map((user) => {
              const usageEmptyLabel = user.teamId ? 'No usage recorded' : 'No workspace assigned';
              const currentPlanName = user.plan ?? planFallbackName;
              const currentPlanOption = plans.find((plan) => plan.name === currentPlanName) ?? null;
              const selectOptions = currentPlanOption
                ? plans
                : [
                    {
                      id: -1,
                      name: currentPlanName,
                      isActive: false,
                      isTrial: false
                    },
                    ...plans
                  ];

              return (
                <tr key={user.id} className="text-sm text-foreground">
                  <td className="px-6 py-4 font-medium">
                    <div className="flex flex-col gap-1">
                      <span>{user.email}</span>
                      <span className="text-xs text-muted-foreground">
                        User ID {user.id}
                        {user.teamId ? ` · Team ${user.teamId}` : ' · No team assigned'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="flex flex-col gap-1 text-sm">
                      <span>{dateFormatter.format(user.signupDate)}</span>
                      {user.trialStatus === 'Trial Active' && user.trialExpiresAt && (
                        <span className="text-xs text-muted-foreground">
                          Trial ends {dateFormatter.format(user.trialExpiresAt)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <Badge
                      variant={
                        user.trialStatus === 'Trial Active'
                          ? 'default'
                          : user.trialStatus === 'Trial Expired'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {user.trialStatus}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <select
                        defaultValue={currentPlanName}
                        className="w-48 rounded-md border border-border/60 bg-background px-2 py-1 text-sm"
                        onChange={(event) => handlePlanChange(event, user)}
                        disabled={planPending && planMutatingUserId === user.id}
                        aria-label={`Change plan for ${user.email}`}
                      >
                        {selectOptions.map((plan) => {
                          const isCurrent = plan.name === currentPlanName;
                          const labelParts = [plan.name];
                          if (plan.isTrial) {
                            labelParts.push('(Trial)');
                          }
                          if (!plan.isActive) {
                            labelParts.push('(Inactive)');
                          }

                          return (
                            <option
                              key={`${plan.id}-${plan.name}`}
                              value={plan.name}
                              disabled={!plan.isActive && !isCurrent}
                            >
                              {labelParts.join(' ')}
                            </option>
                          );
                        })}
                      </select>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {planPending && planMutatingUserId === user.id && <span>Saving...</span>}
                        {currentPlanOption && !currentPlanOption.isActive && (
                          <span className="text-destructive">
                            Plan inactive. Assign a new plan.
                          </span>
                        )}
                        {currentPlanOption?.isTrial && (
                          <span>Trial usage limits currently apply.</span>
                        )}
                        {!currentPlanOption && (
                          <span className="text-destructive">
                            Legacy plan. Update to an active plan.
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <UsageMetricsCell
                      metric={
                        user.usage
                          ? {
                              used: user.usage.prospectsUsed,
                              limit: user.usage.prospectsLimit,
                              helper: 'Workspace contacts'
                            }
                          : null
                      }
                      emptyLabel={usageEmptyLabel}
                    />
                  </td>
                  <td className="px-6 py-4 align-top">
                    <UsageMetricsCell
                      metric={
                        user.usage
                          ? {
                              used: user.usage.emailsUsed,
                              limit: user.usage.emailsLimit,
                              helper: 'Monthly send limit',
                              cycleStart: user.usage.emailsMonthStart
                            }
                          : null
                      }
                      emptyLabel={usageEmptyLabel}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Badge
                      variant={user.status === 'active' ? 'default' : 'outline'}
                      className={cn('font-semibold', user.status !== 'active' && 'text-foreground')}
                    >
                      {user.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Button
                      variant={user.status === 'active' ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => handleToggleStatus(user)}
                      disabled={statusPending && statusMutatingUserId === user.id}
                    >
                      {statusPending && statusMutatingUserId === user.id
                        ? 'Updating...'
                        : user.status === 'active'
                          ? 'Deactivate'
                          : 'Activate'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {hasUsers && totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {page <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={buildPageHref(Math.max(1, page - 1), statusFilter)}>Previous</Link>
              </Button>
            )}
            {page >= totalPages ? (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={buildPageHref(Math.min(totalPages, page + 1), statusFilter)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
