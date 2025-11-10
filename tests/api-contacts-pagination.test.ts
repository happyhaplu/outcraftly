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
});

describe('GET /api/contacts pagination', () => {
  it('returns paginated results with total and totalPages', async () => {
    const fakeRows = Array.from({ length: 20 }).map((_, i) => ({
      id: `id-${i + 1}`,
      firstName: `First${i + 1}`,
      lastName: `Last${i + 1}`,
      email: `user${i + 1}@example.com`,
      company: 'Co',
      tags: [],
      createdAt: new Date()
    }));

    getPaginatedContactsForTeamMock.mockResolvedValueOnce({
      data: fakeRows,
      total: 45,
      page: 2,
      totalPages: 3
    });

    const request = new Request('http://localhost/api/contacts?page=2&limit=20', { method: 'GET' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(20);
    expect(payload.total).toBe(45);
    expect(payload.page).toBe(2);
    expect(payload.totalPages).toBe(3);

  expect(getPaginatedContactsForTeamMock).toHaveBeenCalledWith(42, expect.objectContaining({ page: 2, limit: 20 }));
  });

  it('requires authentication', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/contacts?page=1', { method: 'GET' });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('rejects inactive trials', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts?page=1', { method: 'GET' });
    const response = await GET(request);
    expect(response.status).toBe(403);
  });
});
