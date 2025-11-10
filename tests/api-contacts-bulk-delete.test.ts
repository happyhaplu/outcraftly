import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const bulkDeleteContactsMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    bulkDeleteContacts: bulkDeleteContactsMock
  };
});

type DeleteRoute = (request: Request) => Promise<Response>;

let DELETE: DeleteRoute;

beforeAll(async () => {
  ({ DELETE } = await import('@/app/api/contacts/bulk-delete/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 9 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  bulkDeleteContactsMock.mockResolvedValue(2);
});

describe('DELETE /api/contacts/bulk-delete', () => {
  it('removes multiple contacts and returns summary', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [
          '11111111-2222-3333-4444-555555555555',
          '66666666-7777-8888-9999-000000000000'
        ]
      })
    });

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(bulkDeleteContactsMock).toHaveBeenCalledWith(42, [
      '11111111-2222-3333-4444-555555555555',
      '66666666-7777-8888-9999-000000000000'
    ]);

    const payload = await response.json();
    expect(payload.removed).toBe(2);
    expect(payload.message).toBe('2 contacts deleted');
  });

  it('enforces at least one id', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Validation failed');
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555']
      })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(401);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555']
      })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555']
      })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('Invalid JSON payload');
  });
});
