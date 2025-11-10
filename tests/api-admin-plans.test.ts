import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAN_USAGE_LIMITS } from '@/lib/config/plans';

const getSessionMock = vi.fn();
const updatePlanByIdMock = vi.fn();
const setPlanActiveStatusMock = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getSession: getSessionMock
}));

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    updatePlanById: updatePlanByIdMock,
    setPlanActiveStatus: setPlanActiveStatusMock
  };
});

let patchHandler: typeof import('@/app/api/admin/plans/[id]/route').PATCH;
let deactivateHandler: typeof import('@/app/api/admin/plans/[id]/deactivate/route').POST;
let reactivateHandler: typeof import('@/app/api/admin/plans/[id]/reactivate/route').POST;

const starterPlanSummary = {
  id: 1,
  name: 'Starter',
  maxEmailsPerMonth: 3000,
  maxProspects: 500,
  maxCredits: 120,
  isActive: true,
  isTrial: false,
  sortOrder: 1,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-02T00:00:00.000Z'),
  limits: {
    ...DEFAULT_PLAN_USAGE_LIMITS.Starter,
    emailsPerMonth: 3000,
    credits: 120
  }
};

beforeAll(async () => {
  ({ PATCH: patchHandler } = await import('@/app/api/admin/plans/[id]/route'));
  ({ POST: deactivateHandler } = await import('@/app/api/admin/plans/[id]/deactivate/route'));
  ({ POST: reactivateHandler } = await import('@/app/api/admin/plans/[id]/reactivate/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ user: { role: 'admin' } });
});

describe('PATCH /api/admin/plans/:id', () => {
  it('updates plan limits and coerces numeric payloads', async () => {
    updatePlanByIdMock.mockResolvedValueOnce(starterPlanSummary);

    const request = new Request('http://localhost/api/admin/plans/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxEmailsPerMonth: '3000' })
    });

  const response = await patchHandler(request as any, { params: Promise.resolve({ id: '1' }) });

    expect(response.status).toBe(200);
    expect(updatePlanByIdMock).toHaveBeenCalledWith(1, {
      maxEmailsPerMonth: 3000
    });

    const payload = await response.json();
    expect(payload.plan.maxEmailsPerMonth).toBe(3000);
    expect(payload.plan.limits.emailsPerMonth).toBe(3000);
  });

  it('rejects synthetic plan identifiers', async () => {
    const request = new Request('http://localhost/api/admin/plans/-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxProspects: 100 })
    });

  const response = await patchHandler(request as any, { params: Promise.resolve({ id: '-1' }) });

    expect(response.status).toBe(400);
    expect(updatePlanByIdMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the plan cannot be found', async () => {
    updatePlanByIdMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/admin/plans/99', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxProspects: 700 })
    });

  const response = await patchHandler(request as any, { params: Promise.resolve({ id: '99' }) });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/admin/plans/:id/deactivate', () => {
  it('marks a plan inactive', async () => {
    setPlanActiveStatusMock.mockResolvedValueOnce({
      ...starterPlanSummary,
      isActive: false
    });

    const request = new Request('http://localhost/api/admin/plans/1/deactivate', {
      method: 'POST'
    });

  const response = await deactivateHandler(request as any, { params: Promise.resolve({ id: '1' }) });

    expect(response.status).toBe(200);
    expect(setPlanActiveStatusMock).toHaveBeenCalledWith(1, false);

    const payload = await response.json();
    expect(payload.plan.isActive).toBe(false);
  });
});

describe('POST /api/admin/plans/:id/reactivate', () => {
  it('marks a plan active', async () => {
    setPlanActiveStatusMock.mockResolvedValueOnce(starterPlanSummary);

    const request = new Request('http://localhost/api/admin/plans/1/reactivate', {
      method: 'POST'
    });

  const response = await reactivateHandler(request as any, { params: Promise.resolve({ id: '1' }) });

    expect(response.status).toBe(200);
    expect(setPlanActiveStatusMock).toHaveBeenCalledWith(1, true);

    const payload = await response.json();
    expect(payload.plan.isActive).toBe(true);
  });
});
