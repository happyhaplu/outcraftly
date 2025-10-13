import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSendersForTeamMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getSendersForTeam: getSendersForTeamMock
}));

let GET: () => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import('@/app/api/senders/stats/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 10 });
  getSendersForTeamMock.mockResolvedValue([
    {
      id: 1,
      name: 'Sales',
      email: 'sales@example.com',
      status: 'verified',
      bounceRate: 1.2,
      quotaUsed: 320,
      quotaLimit: 1000
    }
  ]);
});

describe('GET /api/senders/stats', () => {
  it('returns sender stats for workspace', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.senders).toHaveLength(1);
    expect(payload.senders[0]).toMatchObject({
      id: 1,
      bounceRate: 1.2,
      quotaUsed: 320,
      quotaLimit: 1000
    });
  });

  it('returns unauthorized when user missing', async () => {
    getUserMock.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
