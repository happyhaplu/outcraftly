import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();
const setTeamPaymentStatusMock = vi.fn();
const resolvePrimaryTeamIdForUserMock = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getSession: getSessionMock
}));

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    setTeamPaymentStatus: setTeamPaymentStatusMock,
    resolvePrimaryTeamIdForUser: resolvePrimaryTeamIdForUserMock
  };
});

let postHandler: typeof import('@/app/api/admin/payments/markPaid/route').POST;

beforeAll(async () => {
  ({ POST: postHandler } = await import('@/app/api/admin/payments/markPaid/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ user: { role: 'admin' } });
  resolvePrimaryTeamIdForUserMock.mockResolvedValue(undefined);
});

describe('POST /api/admin/payments/markPaid', () => {
  it('marks a team as paid when teamId is provided', async () => {
    setTeamPaymentStatusMock.mockResolvedValue({
      id: 42,
      paymentStatus: 'paid',
      subscriptionStatus: 'canceled',
      planName: 'Starter'
    });

    const request = new Request('http://localhost/api/admin/payments/markPaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: 42 })
    });

    const response = await postHandler(request as any);

    expect(response.status).toBe(200);
    expect(setTeamPaymentStatusMock).toHaveBeenCalledWith(42, 'paid');
    const payload = await response.json();
    expect(payload.team).toEqual({
      id: 42,
      paymentStatus: 'paid',
      subscriptionStatus: 'canceled',
      planName: 'Starter'
    });
  });

  it('resolves team from userId when no teamId is provided', async () => {
    resolvePrimaryTeamIdForUserMock.mockResolvedValueOnce(7);
    setTeamPaymentStatusMock.mockResolvedValue({
      id: 7,
      paymentStatus: 'paid',
      subscriptionStatus: 'trialing',
      planName: 'Pro'
    });

    const request = new Request('http://localhost/api/admin/payments/markPaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 55 })
    });

    const response = await postHandler(request as any);

    expect(response.status).toBe(200);
    expect(resolvePrimaryTeamIdForUserMock).toHaveBeenCalledWith(55);
    expect(setTeamPaymentStatusMock).toHaveBeenCalledWith(7, 'paid');
  });

  it('rejects requests without identifiers', async () => {
    const request = new Request('http://localhost/api/admin/payments/markPaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const response = await postHandler(request as any);

    expect(response.status).toBe(400);
    expect(setTeamPaymentStatusMock).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { role: 'user' } });

    const request = new Request('http://localhost/api/admin/payments/markPaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: 1 })
    });

    const response = await postHandler(request as any);

    expect(response.status).toBe(403);
    expect(setTeamPaymentStatusMock).not.toHaveBeenCalled();
  });

  it('returns 404 when no team can be found for a user', async () => {
    resolvePrimaryTeamIdForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/admin/payments/markPaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 999 })
    });

    const response = await postHandler(request as any);

    expect(response.status).toBe(404);
    expect(setTeamPaymentStatusMock).not.toHaveBeenCalled();
  });
});
