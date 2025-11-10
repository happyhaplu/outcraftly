import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const listSequencesForTeamMock = vi.fn();
const syncAllSequenceRepliesForTeamMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

type GetRoute = (request: Request) => Promise<Response>;
let GET: GetRoute;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    listSequencesForTeam: listSequencesForTeamMock,
    syncAllSequenceRepliesFromLogs: actual.syncSequenceRepliesFromLogs,
    syncAllSequenceRepliesForTeam: syncAllSequenceRepliesForTeamMock
  };
});

beforeAll(async () => {
  ({ GET } = await import('@/app/api/sequences/list/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

const buildRequest = (query = '') => new Request(`http://localhost/api/sequences/list${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  syncAllSequenceRepliesForTeamMock.mockReset();
  syncAllSequenceRepliesForTeamMock.mockResolvedValue(0);
  listSequencesForTeamMock.mockResolvedValue([
    {
      id: 'seq-1',
      name: 'Warm leads',
      status: 'active',
      createdAt: '2025-10-15T10:00:00.000Z',
      updatedAt: '2025-10-15T11:00:00.000Z',
      launchAt: null,
      launchedAt: '2025-10-15T10:05:00.000Z',
      deletedAt: null,
      senderId: 10,
      sender: {
        id: 10,
        name: 'Alice Sender',
        email: 'alice@example.com',
        status: 'verified'
      },
      stepCount: 3,
      stepSendSummary: [
        { id: 'step-1', order: 1, subject: 'Intro', sent: 14 },
        { id: 'step-2', order: 2, subject: 'Follow up', sent: 6 }
      ],
      sentPerStep: {
        'step-1': 14,
        'step-2': 6
      },
      tracking: {
        trackOpens: false,
        trackClicks: false,
        enableUnsubscribe: false
      },
      stopCondition: 'on_reply',
      stopOnBounce: false,
      minGapMinutes: 12,
      replyCount: 4,
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
      hasMissingMetadata: false
    },
    {
      id: 'seq-2',
      name: 'Cold outreach',
      status: 'draft',
      createdAt: '2025-10-16T10:00:00.000Z',
      updatedAt: '2025-10-16T11:00:00.000Z',
      launchAt: null,
      launchedAt: null,
      deletedAt: null,
      senderId: null,
      sender: null,
      stepCount: 0,
      stepSendSummary: [],
      sentPerStep: {},
      tracking: {
        trackOpens: false,
        trackClicks: false,
        enableUnsubscribe: false
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
      hasMissingMetadata: false
    },
    {
      id: 'seq-archived',
      name: 'Archived leads',
      status: 'paused',
      createdAt: '2025-09-10T08:00:00.000Z',
      updatedAt: '2025-10-01T09:30:00.000Z',
      launchAt: null,
      launchedAt: null,
      deletedAt: '2025-10-01T10:00:00.000Z',
      senderId: null,
      sender: null,
      stepCount: 0,
      stepSendSummary: [],
      sentPerStep: {},
      tracking: {
        trackOpens: false,
        trackClicks: false,
        enableUnsubscribe: false
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
      hasMissingMetadata: false
    }
  ]);
});

describe('GET /api/sequences/list', () => {
  it('returns sequences for the user workspace', async () => {
    const response = await GET(buildRequest());
    expect(response.status).toBe(200);

  expect(syncAllSequenceRepliesForTeamMock).toHaveBeenCalledWith(42);

    expect(listSequencesForTeamMock).toHaveBeenCalledWith(42, { includeDeleted: false });

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
        launchAt: null,
        launchedAt: '2025-10-15T10:05:00.000Z',
        deletedAt: null,
        stepCount: 3,
        stepSendSummary: [
          { id: 'step-1', order: 1, subject: 'Intro', sent: 14 },
          { id: 'step-2', order: 2, subject: 'Follow up', sent: 6 }
        ],
        sentPerStep: {
          'step-1': 14,
          'step-2': 6
        },
        tracking: {
          trackOpens: false,
          trackClicks: false,
          enableUnsubscribe: false
        },
        stopCondition: 'on_reply',
        stopOnBounce: false,
        minGapMinutes: 12,
        replyCount: 4,
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
        hasMissingMetadata: false
      },
      {
        id: 'seq-2',
        name: 'Cold outreach',
        status: 'draft',
        senderId: null,
        sender: null,
        createdAt: '2025-10-16T10:00:00.000Z',
        updatedAt: '2025-10-16T11:00:00.000Z',
        launchAt: null,
        launchedAt: null,
        deletedAt: null,
        stepCount: 0,
        stepSendSummary: [],
        sentPerStep: {},
        tracking: {
          trackOpens: false,
          trackClicks: false,
          enableUnsubscribe: false
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
        hasMissingMetadata: false
      }
    ]);
  });

  it('excludes soft-deleted sequences from the response payload', async () => {
    const response = await GET(buildRequest());
    const payload = await response.json();

    const ids = payload.sequences.map((sequence: { id: string }) => sequence.id);
    expect(ids).not.toContain('seq-archived');
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await GET(buildRequest());
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const response = await GET(buildRequest());
    expect(response.status).toBe(400);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await GET(buildRequest());
    expect(response.status).toBe(403);
  });
});
