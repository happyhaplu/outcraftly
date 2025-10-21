import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const listSequencesForTeamMock = vi.fn();

type GetRoute = () => Promise<Response>;
let GET: GetRoute;

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  listSequencesForTeam: listSequencesForTeamMock
}));

beforeAll(async () => {
  ({ GET } = await import('@/app/api/sequences/list/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  listSequencesForTeamMock.mockResolvedValue([
    {
      id: 'seq-1',
      name: 'Warm leads',
      status: 'active',
      createdAt: '2025-10-15T10:00:00.000Z',
      updatedAt: '2025-10-15T11:00:00.000Z',
      senderId: 10,
      sender: {
        id: 10,
        name: 'Alice Sender',
        email: 'alice@example.com',
        status: 'verified'
      },
      stepCount: 3
    },
    {
      id: 'seq-2',
      name: 'Cold outreach',
      status: 'paused',
      createdAt: '2025-10-16T10:00:00.000Z',
      updatedAt: '2025-10-16T11:00:00.000Z',
      senderId: null,
      sender: null,
      stepCount: null
    }
  ]);
});

describe('GET /api/sequences/list', () => {
  it('returns sequences for the user workspace', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    expect(listSequencesForTeamMock).toHaveBeenCalledWith(42);

    const payload = await response.json();
    expect(payload.sequences).toEqual([
      {
        id: 'seq-1',
        name: 'Warm leads',
        status: 'active',
        senderId: 10,
        sender: {
          id: 10,
          name: 'Alice Sender',
          email: 'alice@example.com',
          status: 'verified'
        },
        createdAt: '2025-10-15T10:00:00.000Z',
        updatedAt: '2025-10-15T11:00:00.000Z',
        stepCount: 3
      },
      {
        id: 'seq-2',
        name: 'Cold outreach',
        status: 'paused',
        senderId: null,
        sender: null,
        createdAt: '2025-10-16T10:00:00.000Z',
        updatedAt: '2025-10-16T11:00:00.000Z',
        stepCount: 0
      }
    ]);
  });

  it('rejects unauthenticated requests', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const response = await GET();
    expect(response.status).toBe(400);
  });
});
