import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const setSequenceLifecycleStatusMock = vi.fn();
const listSequencesForTeamMock = vi.fn();

type DeleteRoute = (request: Request, context: { params?: { id?: string } }) => Promise<Response>;
let DELETE: DeleteRoute;
type ListRoute = (request: Request) => Promise<Response>;
let LIST: ListRoute;

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    setSequenceLifecycleStatus: setSequenceLifecycleStatusMock,
    listSequencesForTeam: listSequencesForTeamMock
  };
});

beforeAll(async () => {
  ({ DELETE } = await import('@/app/api/sequences/[id]/route'));
  ({ GET: LIST } = await import('@/app/api/sequences/list/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 8 });
  getTeamForUserMock.mockResolvedValue({ id: 99 });
  const deletedAt = new Date('2025-10-16T09:00:00.000Z');
  setSequenceLifecycleStatusMock.mockResolvedValue({
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Sample sequence',
    status: 'paused',
    deletedAt,
    createdAt: new Date('2025-10-10T08:00:00.000Z'),
    updatedAt: deletedAt
  });
  listSequencesForTeamMock.mockResolvedValue([]);
});

const createRawSequence = (overrides: Record<string, unknown> = {}) => ({
  id: 'seq-active',
  name: 'Sequence title',
  status: 'active',
  createdAt: new Date('2025-10-15T10:00:00.000Z'),
  updatedAt: new Date('2025-10-15T11:00:00.000Z'),
  launchAt: null,
  launchedAt: null,
  deletedAt: null,
  senderId: null,
  sender: null,
  stepCount: 0,
  stepSendSummary: [],
  sentPerStep: {},
  tracking: {
    trackOpens: true,
    trackClicks: true,
    enableUnsubscribe: true
  },
  stopCondition: 'on_reply',
  stopOnBounce: false,
  minGapMinutes: null,
  replyCount: 0,
  schedule: {
    mode: 'immediate',
    sendTime: null,
    sendWindowStart: null,
    sendWindowEnd: null,
    respectContactTimezone: true,
    fallbackTimezone: null,
    timezone: null,
    sendDays: null,
    sendWindows: null
  },
  ...overrides
});

describe('DELETE /api/sequences/:id', () => {
  it('soft deletes the sequence for the workspace', async () => {
    const response = await DELETE(new Request('http://example.com'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(200);
    expect(setSequenceLifecycleStatusMock).toHaveBeenCalledWith(99, '11111111-2222-3333-4444-555555555555', 'deleted');

    const payload = await response.json();
    expect(payload).toEqual({ ok: true });

    const lifecycleResult = await setSequenceLifecycleStatusMock.mock.results[0]?.value;
    expect(lifecycleResult).toBeDefined();
    expect(lifecycleResult).toMatchObject({
      status: 'paused',
      deletedAt: expect.any(Date)
    });
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await DELETE(new Request('http://example.com'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(401);
    expect(setSequenceLifecycleStatusMock).not.toHaveBeenCalled();
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await DELETE(new Request('http://example.com'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
    expect(setSequenceLifecycleStatusMock).not.toHaveBeenCalled();
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const response = await DELETE(new Request('http://example.com'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(400);
    expect(setSequenceLifecycleStatusMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the sequence is not found', async () => {
    setSequenceLifecycleStatusMock.mockResolvedValueOnce(null);

    const response = await DELETE(new Request('http://example.com'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(404);
    expect(setSequenceLifecycleStatusMock).toHaveBeenCalledWith(99, '11111111-2222-3333-4444-555555555555', 'deleted');
  });

  it('excludes deleted sequences from the list endpoint', async () => {
    const activeSequence = createRawSequence({ id: 'seq-kept' });
    const deletedSequence = createRawSequence({
      id: 'seq-removed',
      status: 'active',
      deletedAt: new Date('2025-10-16T09:00:00.000Z')
    });

    listSequencesForTeamMock.mockResolvedValueOnce([activeSequence, deletedSequence]);

  const response = await LIST(new Request('http://example.com/api/sequences/list'));
    expect(response.status).toBe(200);
  expect(listSequencesForTeamMock).toHaveBeenCalledWith(99, { includeDeleted: false });

    const payload = await response.json();
    const ids = payload.sequences.map((sequence: { id: string }) => sequence.id);
    expect(ids).toEqual(['seq-kept']);
    expect(payload.sequences[0].status).toBe('active');
  });
});
