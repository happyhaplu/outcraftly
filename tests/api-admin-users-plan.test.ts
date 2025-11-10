import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAN_USAGE_LIMITS } from '@/lib/config/plans';

const getSessionMock = vi.fn();
const updateUserPlanMock = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getSession: getSessionMock
}));

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    updateUserPlan: updateUserPlanMock
  };
});

let patchHandler: typeof import('@/app/api/admin/users/[id]/plan/route').PATCH;

beforeAll(async () => {
  ({ PATCH: patchHandler } = await import('@/app/api/admin/users/[id]/plan/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ user: { role: 'admin' } });
  updateUserPlanMock.mockResolvedValue({
    user: {
      id: 42,
      email: 'owner@example.com',
      plan: 'Pro'
    },
    plan: {
      id: 3,
      name: 'Pro',
      isActive: true,
      isTrial: false,
      limits: DEFAULT_PLAN_USAGE_LIMITS['Pro']
    }
  });
});

describe('PATCH /api/admin/users/:id/plan', () => {
  it('updates a user plan when requested by an admin', async () => {
    const request = new Request('http://localhost/api/admin/users/42/plan', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'Pro' })
    });

  const response = await patchHandler(request as any, { params: { id: '42' } });

    expect(response.status).toBe(200);
    expect(updateUserPlanMock).toHaveBeenCalledWith({ userId: 42, plan: 'Pro' });

    const payload = await response.json();
  expect(payload.user.plan).toBe('Pro');
  expect(payload.user.limits).toEqual(DEFAULT_PLAN_USAGE_LIMITS['Pro']);
  });

  it('rejects requests from non-admin users', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { role: 'user' } });

    const request = new Request('http://localhost/api/admin/users/42/plan', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'Pro' })
    });

  const response = await patchHandler(request as any, { params: { id: '42' } });

    expect(response.status).toBe(403);
    expect(updateUserPlanMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid payloads', async () => {
    const request = new Request('http://localhost/api/admin/users/42/plan', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'Invalid-plan' })
    });

  const response = await patchHandler(request as any, { params: { id: '42' } });

    expect(response.status).toBe(400);
    expect(updateUserPlanMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the user cannot be found', async () => {
    updateUserPlanMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/admin/users/99/plan', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'Starter' })
    });

  const response = await patchHandler(request as any, { params: { id: '99' } });

    expect(response.status).toBe(404);
  });
});
