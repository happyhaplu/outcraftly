import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getContactsForTeamMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getContactsForTeam: getContactsForTeamMock
}));

type GetRoute = (request: Request) => Promise<Response>;

let GET: GetRoute;

beforeAll(async () => {
  ({ GET } = await import('@/app/api/contacts/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 3 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  getContactsForTeamMock.mockResolvedValue([
    {
      id: '11111111-2222-3333-4444-555555555555',
      firstName: 'Avery',
      lastName: 'Stone',
      email: 'avery@example.com',
      company: 'Stone Inc.',
      tags: ['Enterprise'],
      createdAt: new Date('2024-01-01T00:00:00.000Z')
    },
    {
      id: 'aaaa1111-bbbb-2222-cccc-333333333333',
      firstName: 'Elena',
      lastName: 'Diaz',
      email: 'elena@example.com',
      company: 'Diaz LLC',
      tags: null,
      createdAt: new Date('2024-02-01T00:00:00.000Z')
    }
  ]);
});

describe('GET /api/contacts', () => {
  it('returns contacts with filters applied', async () => {
    const request = new Request('http://localhost/api/contacts?search=  Avery &tag= enterprise ', {
      method: 'GET'
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(getContactsForTeamMock).toHaveBeenCalledWith(42, {
      search: 'Avery',
      tag: 'enterprise'
    });

    const payload = await response.json();
    expect(payload.contacts).toHaveLength(2);
    expect(payload.contacts?.[1]?.tags).toEqual([]);
  });

  it('requires authentication', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts', {
      method: 'GET'
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('requires a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts', {
      method: 'GET'
    });

    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});
