import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSequenceWithStepsMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

type GetRoute = (request: Request, context: { params: { id: string } }) => Promise<Response>;
let GET: GetRoute;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getSequenceWithSteps: getSequenceWithStepsMock
  };
});

beforeAll(async () => {
  ({ GET } = await import('@/app/api/sequences/get/[id]/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  getSequenceWithStepsMock.mockResolvedValue({
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Warm leads',
    status: 'active',
    createdAt: '2025-10-15T10:00:00.000Z',
    updatedAt: '2025-10-15T11:00:00.000Z',
    steps: [
      {
        id: 'step-1',
        subject: 'Hey there',
        body: 'Hi {{firstName}}',
        delayHours: 24,
        order: 1,
        skipIfReplied: true,
        skipIfBounced: false,
        delayIfReplied: 24
      }
    ]
  });
});

describe('GET /api/sequences/get/:id', () => {
  it('returns a sequence for the workspace', async () => {
    const response = await GET(new Request('http://localhost/api/sequences/get/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(200);
    expect(getSequenceWithStepsMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555');

    const payload = await response.json();
  expect(payload.sequence).toMatchObject({ id: '11111111-2222-3333-4444-555555555555', name: 'Warm leads', status: 'active' });
    expect(payload.sequence.steps[0]).toMatchObject({
      skipIfReplied: true,
      skipIfBounced: false,
      delayIfReplied: 24
    });
  });

  it('validates the identifier format', async () => {
    const response = await GET(new Request('http://localhost/api/sequences/get/invalid'), {
      params: { id: ' ' }
    });

    expect(response.status).toBe(400);
    expect(getSequenceWithStepsMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the sequence is missing', async () => {
    getSequenceWithStepsMock.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost/api/sequences/get/missing'), {
      params: { id: 'aa1c0916-2222-4b54-8888-555555555555' }
    });

    expect(response.status).toBe(404);
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await GET(new Request('http://localhost/api/sequences/get/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost/api/sequences/get/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(400);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await GET(new Request('http://localhost/api/sequences/get/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(403);
  });
});
