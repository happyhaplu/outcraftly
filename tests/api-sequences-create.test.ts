import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSenderForTeamMock = vi.fn();
const createSequenceMock = vi.fn();
const enrollContactsInSequenceMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

type PostRoute = (request: Request) => Promise<Response>;
let POST: PostRoute;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getSenderForTeam: getSenderForTeamMock,
    createSequence: createSequenceMock,
    enrollContactsInSequence: enrollContactsInSequenceMock
  };
});

beforeAll(async () => {
  ({ POST } = await import('@/app/api/sequences/create/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  getSenderForTeamMock.mockResolvedValue({
    id: 9,
    name: 'Primary Sender',
    email: 'sender@example.com',
    status: 'verified'
  });
  createSequenceMock.mockResolvedValue({
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Warm leads',
    status: 'draft',
    senderId: 9,
    trackOpens: true,
    trackClicks: true,
    enableUnsubscribe: true,
    stopCondition: 'on_reply',
    stopOnBounce: false,
    minGapMinutes: null,
    scheduleMode: null,
    scheduleSendTime: null,
    scheduleWindowStart: null,
    scheduleWindowEnd: null,
    scheduleRespectTimezone: true,
  scheduleFallbackTimezone: null,
  scheduleTimezone: null,
  scheduleSendDays: null,
  scheduleSendWindows: null,
    sender: {
      id: 9,
      name: 'Primary Sender',
      email: 'sender@example.com',
      status: 'verified'
    },
    createdAt: '2025-10-15T10:00:00.000Z',
    updatedAt: '2025-10-15T10:00:00.000Z',
    steps: [
      {
        id: 'step-1',
        subject: 'Hey there',
        body: 'Hi {{firstName}}',
        delayHours: 0,
        order: 1,
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      }
    ]
  });
  enrollContactsInSequenceMock.mockResolvedValue({ enrolled: 0, skipped: 0 });
});

describe('POST /api/sequences/create', () => {
  it('creates a sequence with trimmed inputs and sequential order', async () => {
    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '  Warm leads  ',
        senderId: 9,
        steps: [
          {
            order: 2,
            subject: '  Follow up   ',
            body: 'Checking in',
            delay: 48
          },
          {
            order: 1,
            subject: ' Intro ',
            body: 'Hello there',
            delay: 0
          }
        ]
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(getSenderForTeamMock).toHaveBeenCalledWith(42, 9);

    expect(createSequenceMock).toHaveBeenCalledWith(42, 7, {
      name: 'Warm leads',
      senderId: 9,
      launchAt: null,
      steps: [
        {
          subject: 'Intro',
          body: 'Hello there',
          delay: 0,
          order: 1,
          skipIfReplied: false,
          skipIfBounced: false,
          delayIfReplied: null
        },
        {
          subject: 'Follow up',
          body: 'Checking in',
          delay: 48,
          order: 2,
          skipIfReplied: false,
          skipIfBounced: false,
          delayIfReplied: null
        }
      ],
      tracking: {
        trackOpens: true,
        trackClicks: true,
        enableUnsubscribe: true
      },
      stopCondition: 'on_reply',
      stopOnBounce: false,
      minGapMinutes: null,
      schedule: {
        mode: 'immediate',
        sendTime: null,
        sendWindowStart: null,
        sendWindowEnd: null,
        respectContactTimezone: true,
        fallbackTimezone: null,
        timezone: null,
        sendDays: [],
        sendWindows: []
      }
    });

    const payload = await response.json();
    expect(payload.sequence).toMatchObject({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Warm leads',
      status: 'draft',
      senderId: 9,
      launchAt: null,
      launchedAt: null,
      sender: {
        id: 9,
        name: 'Primary Sender',
        email: 'sender@example.com',
        status: 'verified'
      }
    });
    expect(payload.sequence.tracking).toEqual({
      trackOpens: true,
      trackClicks: true,
      enableUnsubscribe: true
    });
    expect(payload.sequence.schedule).toEqual({
      mode: 'immediate',
      sendTime: null,
      sendWindowStart: null,
      sendWindowEnd: null,
      respectContactTimezone: true,
      fallbackTimezone: null,
      timezone: null,
      sendDays: null,
      sendWindows: null
    });
    expect(payload.sequence.stopCondition).toBe('on_reply');
    expect(payload.sequence.stopOnBounce).toBe(false);
  expect(payload.sequence.minGapMinutes).toBeNull();
    expect(payload.enrollment).toBeNull();
    expect(enrollContactsInSequenceMock).not.toHaveBeenCalled();
    expect(payload.sequence.steps[0]).toMatchObject({
      skipIfReplied: false,
      skipIfBounced: false,
      delayIfReplied: null
    });
  });

  it('returns validation errors when payload is invalid', async () => {
    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', steps: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Validation failed');
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', steps: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', steps: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', steps: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
