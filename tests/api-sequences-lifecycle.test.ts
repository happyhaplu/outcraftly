import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type PostRoute = (request: Request, context: { params: { id: string } }) => Promise<Response>;

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const setSequenceLifecycleStatusMock = vi.fn();

type QueriesModule = typeof import('@/lib/db/queries');

vi.mock('@/lib/db/queries', async () => {
  const actual = (await vi.importActual<QueriesModule>('@/lib/db/queries')) as QueriesModule;
  return {
    ...actual,
    getUser: getUserMock,
    getTeamForUser: getTeamForUserMock,
    setSequenceLifecycleStatus: setSequenceLifecycleStatusMock
  };
});

let pauseRoute: PostRoute;
let resumeRoute: PostRoute;

beforeAll(async () => {
  ({ POST: pauseRoute } = await import('@/app/api/sequences/[id]/pause/route'));
  ({ POST: resumeRoute } = await import('@/app/api/sequences/[id]/resume/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  setSequenceLifecycleStatusMock.mockResolvedValue({
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Warm leads',
    status: 'paused',
    createdAt: new Date('2025-10-15T10:00:00.000Z'),
    updatedAt: new Date('2025-10-15T11:00:00.000Z')
  });
});

describe('POST /api/sequences/[id]/pause', () => {
  it('pauses a sequence for the workspace', async () => {
    const response = await pauseRoute(new Request('http://localhost', { method: 'POST' }), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(200);
    expect(setSequenceLifecycleStatusMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', 'paused');

    const payload = await response.json();
    expect(payload.sequence).toMatchObject({ status: 'paused', name: 'Warm leads' });
  });

  it('returns 404 when sequence is missing', async () => {
    setSequenceLifecycleStatusMock.mockResolvedValueOnce(null);

    const response = await pauseRoute(new Request('http://localhost', { method: 'POST' }), {
      params: { id: 'ffffffff-1111-2222-3333-444444444444' }
    });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/sequences/[id]/resume', () => {
  beforeEach(() => {
    setSequenceLifecycleStatusMock.mockResolvedValue({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Warm leads',
      status: 'active',
      createdAt: new Date('2025-10-15T10:00:00.000Z'),
      updatedAt: new Date('2025-10-15T11:05:00.000Z')
    });
  });

  it('resumes a paused sequence', async () => {
    const response = await resumeRoute(new Request('http://localhost', { method: 'POST' }), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(200);
    expect(setSequenceLifecycleStatusMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', 'active');

    const payload = await response.json();
    expect(payload.sequence).toMatchObject({ status: 'active' });
  });

  it('rejects unauthenticated requests', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const response = await resumeRoute(new Request('http://localhost', { method: 'POST' }), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(401);
  });
});
