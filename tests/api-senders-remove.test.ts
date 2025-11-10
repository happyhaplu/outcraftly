import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSenderForTeamMock = vi.fn();
const deleteSenderMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getSenderForTeam: getSenderForTeamMock,
    deleteSender: deleteSenderMock
  };
});

let DELETE_HANDLER: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ DELETE: DELETE_HANDLER } = await import('@/app/api/senders/remove/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 10 });
  getSenderForTeamMock.mockResolvedValue({
    id: 42,
    teamId: 10,
    status: 'active'
  });
  deleteSenderMock.mockResolvedValue(undefined);
});

describe('DELETE /api/senders/remove', () => {
  it('removes a sender and returns success', async () => {
    const response = await DELETE_HANDLER(
      new Request('http://localhost/api/senders/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.message).toContain('removed');
    expect(deleteSenderMock).toHaveBeenCalledWith(10, 42);
  });

  it('returns 404 when sender does not exist', async () => {
    getSenderForTeamMock.mockResolvedValueOnce(null);

    const response = await DELETE_HANDLER(
      new Request('http://localhost/api/senders/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 999 })
      })
    );

    expect(response.status).toBe(404);
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await DELETE_HANDLER(
      new Request('http://localhost/api/senders/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await DELETE_HANDLER(
      new Request('http://localhost/api/senders/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
  });
});
