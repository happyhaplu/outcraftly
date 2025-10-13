import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSenderForTeamMock = vi.fn();
const deleteSenderMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getSenderForTeam: getSenderForTeamMock,
  deleteSender: deleteSenderMock
}));

let DELETE_HANDLER: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ DELETE: DELETE_HANDLER } = await import('@/app/api/senders/remove/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 1 });
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
});
