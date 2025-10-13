import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSenderForTeamMock = vi.fn();
const updateSenderStatusMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getSenderForTeam: getSenderForTeamMock,
  updateSenderStatus: updateSenderStatusMock
}));

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/senders/disable/route'));
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
  updateSenderStatusMock.mockResolvedValue({
    id: 42,
    status: 'disabled'
  });
});

describe('POST /api/senders/disable', () => {
  it('disables an active sender', async () => {
    const response = await POST(
      new Request('http://localhost/api/senders/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.sender.status).toBe('disabled');
    expect(updateSenderStatusMock).toHaveBeenCalledWith(10, 42, 'disabled');
  });

  it('re-enables a disabled sender', async () => {
    getSenderForTeamMock.mockResolvedValueOnce({
      id: 42,
      teamId: 10,
      status: 'disabled'
    });
    updateSenderStatusMock.mockResolvedValueOnce({
      id: 42,
      status: 'active'
    });

    const response = await POST(
      new Request('http://localhost/api/senders/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.sender.status).toBe('active');
    expect(updateSenderStatusMock).toHaveBeenCalledWith(10, 42, 'active');
  });

  it('returns 404 when sender is not found', async () => {
    getSenderForTeamMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/senders/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 999 })
      })
    );

    expect(response.status).toBe(404);
  });
});
