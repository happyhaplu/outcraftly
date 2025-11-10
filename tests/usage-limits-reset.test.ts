import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAN_USAGE_LIMITS } from '@/lib/config/plans';
import { getTeamUsageSummary } from '@/lib/db/queries';

type SelectQueue = Array<Array<Record<string, any>>>;

function createMockClient(selectQueue: SelectQueue) {
  const select = vi.fn(() => {
    const result = selectQueue.shift() ?? [];
    const builder: any = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      groupBy: () => builder,
      orderBy: () => builder,
      offset: () => builder,
      where: () => {
        const promise: any = Promise.resolve(result);
        promise.limit = () => Promise.resolve(result);
        return promise;
      },
      limit: () => Promise.resolve(result),
      then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject)
    };
    return builder;
  });

  const insertCalls: Array<Record<string, any>> = [];
  const insertMock = vi.fn(() => ({
      values: (value: Record<string, any>) => {
        insertCalls.push(value);
        return {
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined)
        };
      }
    }));

  const update = vi.fn(() => ({
    set: () => ({
      where: () => Promise.resolve([])
    })
  }));

  return { select, insert: insertMock, update, insertCalls };
}

describe('usage limits monthly reset', () => {
  it('creates a fresh monthly usage record when none exists', async () => {
    const selectQueue: SelectQueue = [
      // resolveTeamPlan -> teams.planName
      [{ planName: 'Starter' }],
      // resolveTeamPlan -> plans lookup
      [
        {
          id: 1,
          name: 'Starter',
          maxEmailsPerMonth: DEFAULT_PLAN_USAGE_LIMITS.Starter.emailsPerMonth,
          maxProspects: DEFAULT_PLAN_USAGE_LIMITS.Starter.prospects,
          maxCredits: DEFAULT_PLAN_USAGE_LIMITS.Starter.credits,
          isActive: true,
          isTrial: true,
          sortOrder: 0,
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T00:00:00Z')
        }
      ],
      // getOrCreateTeamMonthlyUsage initial lookup (no row yet)
      [],
  // getProspectCount aggregate result (may run before post-insert fetch)
  [{ value: 12 }],
  // getOrCreateTeamMonthlyUsage fetch after insert
  [{ id: 1, prospectsUsed: 0, emailsSent: 0, creditsUsed: 0 }]
    ];

    const client = createMockClient(selectQueue);
    const now = new Date('2025-10-28T12:00:00Z');

    const summary = await getTeamUsageSummary(99, now, client as any);

    expect(client.insert).toHaveBeenCalledTimes(1);
    expect(client.insertCalls[0]).toMatchObject({
      teamId: 99,
      monthStart: '2025-10-01',
      emailsSent: 0,
      prospectsUsed: 0
    });

    expect(summary.emails.used).toBe(0);
  expect(summary.emails.limit).toBe(DEFAULT_PLAN_USAGE_LIMITS.Starter.emailsPerMonth);
    expect(summary.prospects.used).toBe(12);
  });
});
