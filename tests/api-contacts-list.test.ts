import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getPaginatedContactsForTeamMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
  getPaginatedContactsForTeam: getPaginatedContactsForTeamMock
  };
});

type GetRoute = (request: Request) => Promise<Response>;

let GET: GetRoute;

beforeAll(async () => {
  ({ GET } = await import('@/app/api/contacts/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 3 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  getPaginatedContactsForTeamMock.mockResolvedValue({
    data: [
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
    ],
    total: 2,
    page: 1,
    totalPages: 1
  });
});

describe('GET /api/contacts', () => {
  it('returns contacts with filters applied', async () => {
    const request = new Request('http://localhost/api/contacts?search=  Avery &tag= enterprise ', {
      method: 'GET'
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(getPaginatedContactsForTeamMock).toHaveBeenCalledWith(42, {
      search: 'Avery',
      tag: 'enterprise',
      page: 1,
      limit: 20
    });

    const payload = await response.json();
    expect(payload.data).toHaveLength(2);
    expect(payload.data?.[1]?.tags).toEqual([]);
  });

  it('requires authentication', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

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

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts', {
      method: 'GET'
    });

    const response = await GET(request);
    expect(response.status).toBe(403);
  });
});
