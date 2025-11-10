import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SequenceInboundEvent } from '@/lib/db/queries';

type MockSequenceRow = { id: string };

const dbSelectMock = vi.fn();
let mockSequenceRows: MockSequenceRow[] = [{ id: 'mock-sequence' }];

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: (...args: unknown[]) =>
      dbSelectMock(...args) ?? {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(mockSequenceRows)
          })
        })
      }
  }
}));

const recordSequenceEventsMock = vi.fn();
const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSequenceStatusForTeamMock = vi.fn();
const listSequenceRepliesForTeamMock = vi.fn();
const listSequenceBouncesForTeamMock = vi.fn();
const listSequenceDeliveryLogsForTeamMock = vi.fn();

let realRecordSequenceEvents: typeof import('@/lib/db/queries').recordSequenceEvents;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  realRecordSequenceEvents = actual.recordSequenceEvents;

  return {
    ...actual,
    recordSequenceEvents: (...args: Parameters<typeof actual.recordSequenceEvents>) => recordSequenceEventsMock(...args),
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getSequenceStatusForTeam: getSequenceStatusForTeamMock,
    listSequenceRepliesForTeam: listSequenceRepliesForTeamMock,
    listSequenceBouncesForTeam: listSequenceBouncesForTeamMock,
    listSequenceDeliveryLogsForTeam: listSequenceDeliveryLogsForTeamMock
  };
});

let POST: (request: Request) => Promise<Response>;
let GET_STATUS: (request: Request, context: { params: { id: string } }) => Promise<Response>;
let GET_REPLIES: (request: Request, context: { params: { id: string } }) => Promise<Response>;
let GET_LOGS: (request: Request, context: { params: { id: string } }) => Promise<Response>;

const ORIGINAL_SECRET = process.env.SEQUENCE_EVENTS_SECRET;

describe('POST /api/sequences/events', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    dbSelectMock.mockReset();
    dbSelectMock.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockSequenceRows)
        })
      })
    }));
    mockSequenceRows = [{ id: 'mock-sequence' }];
    recordSequenceEventsMock.mockReset();
    getActiveUserMock.mockReset();
    getTeamForUserMock.mockReset();
    getSequenceStatusForTeamMock.mockReset();
    listSequenceRepliesForTeamMock.mockReset();
    listSequenceBouncesForTeamMock.mockReset();
  listSequenceDeliveryLogsForTeamMock.mockReset();

    process.env.SEQUENCE_EVENTS_SECRET = 'test-secret';
    ({ POST } = await import('@/app/api/sequences/events/route'));
  });

  afterEach(() => {
    process.env.SEQUENCE_EVENTS_SECRET = ORIGINAL_SECRET;
  });

  it('fails with 500 when the secret is not configured', async () => {
    vi.resetModules();
    process.env.SEQUENCE_EVENTS_SECRET = '';
    ({ POST } = await import('@/app/api/sequences/events/route'));

    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify({ type: 'reply', messageId: 'msg-1' })
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(recordSequenceEventsMock).not.toHaveBeenCalled();
  });

  it('rejects requests without a valid bearer token', async () => {
    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      body: JSON.stringify({ type: 'reply', messageId: 'msg-1' })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(recordSequenceEventsMock).not.toHaveBeenCalled();
  });

  it('returns validation errors when the payload is invalid', async () => {
    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify({ type: 'reply', messageId: '' })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(recordSequenceEventsMock).not.toHaveBeenCalled();
  });

  it('processes events and returns their outcome', async () => {
    recordSequenceEventsMock.mockResolvedValueOnce([
      { type: 'reply', status: 'processed', contactId: 'contact-1', sequenceId: 'sequence-1' }
    ]);

    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify({
        events: [
          {
            type: 'reply',
            messageId: 'msg-1',
            contactId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            sequenceId: '11111111-2222-3333-4444-555555555555',
            occurredAt: '2025-10-17T10:00:00.000Z',
            payload: { snippet: 'Thanks for reaching out!' }
          }
        ]
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(recordSequenceEventsMock).toHaveBeenCalledTimes(1);

    const [[events]] = recordSequenceEventsMock.mock.calls;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'reply',
      messageId: 'msg-1',
      contactId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sequenceId: '11111111-2222-3333-4444-555555555555'
    });

    const payload = await response.json();
    expect(payload.processed).toEqual([
      { type: 'reply', status: 'processed', contactId: 'contact-1', sequenceId: 'sequence-1' }
    ]);
  });

  it('ingests a reply event end-to-end and surfaces it via status and replies APIs', async () => {
    const sequenceId = '11111111-2222-3333-4444-555555555555';
    const contactId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const statusId = 'status-1';
    const occurredAt = new Date('2025-10-20T12:00:00.000Z');

    const contactStatusRow = {
      id: statusId,
      contactId,
      sequenceId,
      status: 'sent',
      stepId: 'step-1',
      scheduledAt: new Date('2025-10-20T11:00:00.000Z'),
      replyAt: null as Date | null,
      bounceAt: null as Date | null,
      manualTriggeredAt: null as Date | null,
      manualSentAt: null as Date | null,
      stopCondition: 'on_reply' as const,
      stopOnBounce: false,
      lastUpdated: new Date('2025-10-20T11:00:00.000Z')
    };

    const deliveryLogStore: Array<Record<string, unknown>> = [];

    const fakeClient = {
      transaction: async (callback: (tx: any) => Promise<any>) => {
        const tx = {
          insert: () => ({
            values: async (value: Record<string, unknown>) => {
              deliveryLogStore.push({ ...value });
              return [];
            }
          }),
          update: () => ({
            set: (data: Record<string, unknown>) => ({
              where: async () => {
                Object.assign(contactStatusRow, data);
                return [];
              }
            })
          })
        };

        return callback(tx);
      }
    };

    const resolveTarget = vi.fn(async (event: SequenceInboundEvent) => {
      if (event.contactId === contactId && event.sequenceId === sequenceId) {
        return {
          contactId,
          sequenceId,
          statusId,
          currentStatus: contactStatusRow.status as 'pending' | 'sent' | 'replied' | 'bounced' | 'failed' | 'skipped',
          currentStepId: contactStatusRow.stepId,
          lastSentStepId: contactStatusRow.stepId,
          replyAt: contactStatusRow.replyAt,
          bounceAt: contactStatusRow.bounceAt,
          matchedMessageId: event.messageId ?? null
        };
      }
      return null;
    });

    recordSequenceEventsMock.mockImplementation(async (events: SequenceInboundEvent[]) =>
      realRecordSequenceEvents(events, { client: fakeClient, resolveTarget })
    );

    const computeSummary = () => ({
      total: 1,
      pending: contactStatusRow.status === 'pending' ? 1 : 0,
      sent: contactStatusRow.status === 'sent' ? 1 : 0,
      replied: contactStatusRow.status === 'replied' || contactStatusRow.replyAt ? 1 : 0,
      replyCount: contactStatusRow.status === 'replied' || contactStatusRow.replyAt ? 1 : 0,
      bounced: contactStatusRow.status === 'bounced' ? 1 : 0,
      failed: contactStatusRow.status === 'failed' ? 1 : 0,
      skipped: contactStatusRow.status === 'skipped' ? 1 : 0,
      lastActivity: contactStatusRow.lastUpdated
    });

    const makeContactPayload = () => ({
      id: statusId,
      contactId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      company: 'Analytical Engines',
      timezone: 'UTC',
      status: contactStatusRow.status,
      lastUpdated: contactStatusRow.lastUpdated,
      stepOrder: 1,
      stepSubject: 'Intro email',
      stepId: contactStatusRow.stepId,
      scheduledAt: contactStatusRow.scheduledAt,
      sentAt: new Date('2025-10-20T11:30:00.000Z'),
      attempts: 1,
      replyAt: contactStatusRow.replyAt,
      bounceAt: contactStatusRow.bounceAt,
      skippedAt: null,
      lastThrottleAt: null,
      scheduleMode: 'immediate',
      scheduleSendTime: null,
      scheduleWindowStart: null,
      scheduleWindowEnd: null,
      scheduleRespectTimezone: true,
      scheduleFallbackTimezone: null,
      scheduleTimezone: null,
      scheduleSendDays: null,
      scheduleSendWindows: null,
      manualTriggeredAt: contactStatusRow.manualTriggeredAt,
      manualSentAt: contactStatusRow.manualSentAt
    });

    const sequenceMeta = {
      id: sequenceId,
      name: 'Warm leads',
      status: 'active' as const,
      senderId: 10,
      sender: {
        id: 10,
        name: 'Primary sender',
        email: 'sender@example.com',
        status: 'verified'
      },
      createdAt: new Date('2025-10-19T12:00:00.000Z'),
      updatedAt: contactStatusRow.lastUpdated,
      launchAt: null,
      launchedAt: new Date('2025-10-19T15:00:00.000Z'),
      minGapMinutes: 5,
      deletedAt: null
    };

    getSequenceStatusForTeamMock.mockImplementation(async () => ({
      sequence: sequenceMeta,
      summary: computeSummary(),
      contacts: [makeContactPayload()],
      steps: [
        {
          stepId: 'step-1',
          order: 1,
          subject: 'Intro email',
          pending: contactStatusRow.status === 'pending' ? 1 : 0,
          sent: contactStatusRow.status === 'sent' ? 1 : 0,
          replied: contactStatusRow.status === 'replied' ? 1 : 0,
          bounced: contactStatusRow.status === 'bounced' ? 1 : 0,
          failed: contactStatusRow.status === 'failed' ? 1 : 0,
          skipped: contactStatusRow.status === 'skipped' ? 1 : 0
        }
      ],
      sentPerStep: contactStatusRow.status === 'replied' ? { 'step-1': 1 } : { 'step-1': 0 },
      worker: {
        queueSize: 0,
        lastRunAt: null,
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      }
    }));

    listSequenceRepliesForTeamMock.mockImplementation(async () =>
      deliveryLogStore
        .filter((log) => log.type === 'reply')
        .map((log) => ({
          id: String(log.statusId ?? 'log-1'),
          contactId,
          sequenceId,
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          company: 'Analytical Engines',
          subject: (log.payload as Record<string, unknown>)?.subject ?? null,
          snippet: (log.payload as Record<string, unknown>)?.snippet ?? null,
          occurredAt: (log.createdAt as Date) ?? occurredAt,
          messageId: (log.messageId as string) ?? null,
          stepSubject: 'Intro email'
        }))
    );

    listSequenceDeliveryLogsForTeamMock.mockImplementation(async (_teamId, _sequenceId, filterOptions) => {
      const typeFilter = filterOptions.type ?? null;
      const statusFilter = filterOptions.status ?? 'all';

      const rows = deliveryLogStore.filter((log) => {
        if (typeFilter) {
          return log.type === typeFilter;
        }
        if (statusFilter === 'all') {
          return true;
        }
        if (statusFilter === 'replied') {
          return log.status === 'replied' || log.type === 'reply';
        }
        if (statusFilter === 'bounced') {
          return log.type === 'bounce';
        }
        return log.status === statusFilter;
      });

      const logs = rows.map((log, index) => ({
        id: String(log.statusId ?? `log-${index}`),
        status: (log.status as string) ?? 'sent',
        type: (log.type as string) ?? 'send',
        attempts: Number(log.attempts ?? 0),
        createdAt: (log.createdAt as Date) ?? occurredAt,
        messageId: (log.messageId as string) ?? null,
        errorMessage: (log.errorMessage as string) ?? null,
        skipReason: null,
        rescheduledFor: null,
        delayReason: null,
        delayMs: null,
        minIntervalMinutes: null,
        contact: {
          id: contactId,
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com'
        },
        step: {
          id: 'step-1',
          order: 1,
          subject: 'Intro email'
        }
      }));

      return { logs, total: logs.length };
    });

    listSequenceBouncesForTeamMock.mockResolvedValue([]);
    getActiveUserMock.mockResolvedValue({ id: 1 });
    getTeamForUserMock.mockResolvedValue({ id: 42 });

    mockSequenceRows = [{ id: sequenceId }];

  ({ GET: GET_STATUS } = await import('@/app/api/sequences/status/[id]/route'));
  ({ GET: GET_REPLIES } = await import('@/app/api/sequences/replies/[id]/route'));
  ({ GET: GET_LOGS } = await import('@/app/api/sequences/logs/[id]/route'));

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const eventPayload = {
      type: 'reply',
      messageId: 'message-1',
      contactId,
      sequenceId,
      occurredAt: occurredAt,
      payload: {
        subject: 'Re: Hello',
        snippet: 'Thanks for reaching out!'
      }
    } satisfies SequenceInboundEvent;

    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify(eventPayload)
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(recordSequenceEventsMock).toHaveBeenCalledTimes(1);

    const processed = await response.json();
    expect(processed.processed).toEqual([
      {
        type: 'reply',
        status: 'processed',
        contactId,
        sequenceId
      }
    ]);

    expect(contactStatusRow.replyAt).not.toBeNull();
    expect(contactStatusRow.status).toBe('replied');

    expect(consoleWarnSpy).not.toHaveBeenCalled();

    expect(deliveryLogStore.some((entry) => entry.type === 'reply' && entry.status === 'replied')).toBe(true);
    const replyLog = deliveryLogStore.find((entry) => entry.type === 'reply');
    expect(replyLog?.payload).toMatchObject({
      subject: 'Re: Hello',
      snippet: 'Thanks for reaching out!'
    });

    const statusResponse = await GET_STATUS(new Request('http://localhost/api/sequences/status'), {
      params: { id: sequenceId }
    });
    expect(statusResponse.status).toBe(200);
    const statusPayload = await statusResponse.json();
    expect(statusPayload.summary.replied).toBe(1);
  expect(statusPayload.summary.replyCount).toBe(1);
    expect(statusPayload.sequence?.hasMissingMetadata).toBe(false);

    const repliesResponse = await GET_REPLIES(new Request('http://localhost/api/sequences/replies'), {
      params: { id: sequenceId }
    });
    expect(repliesResponse.status).toBe(200);
    const repliesPayload = await repliesResponse.json();
    expect(repliesPayload.replies).toHaveLength(1);
    expect(repliesPayload.replies[0]).toMatchObject({
      contactId,
      subject: 'Re: Hello',
      snippet: 'Thanks for reaching out!'
    });

    const logsResponse = await GET_LOGS(
      new Request(
        `http://localhost/api/sequences/logs/${sequenceId}?status=replied&page=1&pageSize=20`
      ),
      { params: { id: sequenceId } }
    );
    expect(logsResponse.status).toBe(200);
    const logsPayload = await logsResponse.json();
    expect(listSequenceDeliveryLogsForTeamMock).toHaveBeenCalledWith(
      42,
      sequenceId,
      expect.objectContaining({ type: 'reply', page: 1, pageSize: 20 })
    );
    expect(logsPayload.logs).toHaveLength(1);
    expect(logsPayload.logs[0]).toMatchObject({
      status: 'replied',
      type: 'reply',
      contact: {
        id: contactId,
        email: 'ada@example.com'
      }
    });

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('returns reply delivery logs when filtering with status=replied', async () => {
    const sequenceId = '33333333-2222-1111-0000-aaaaaaaaaaaa';
    const contactId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    const occurredAt = new Date('2025-10-22T09:30:00.000Z');

    mockSequenceRows = [{ id: sequenceId }];

    listSequenceDeliveryLogsForTeamMock.mockResolvedValueOnce({
      logs: [
        {
          id: 'log-1',
          status: 'replied',
          type: 'reply',
          attempts: 0,
          createdAt: occurredAt,
          messageId: 'msg-1',
          errorMessage: null,
          skipReason: null,
          rescheduledFor: null,
          delayReason: null,
          delayMs: null,
          minIntervalMinutes: null,
          contact: {
            id: contactId,
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com'
          },
          step: null
        }
      ],
      total: 1
    });

    recordSequenceEventsMock.mockResolvedValueOnce([
      { type: 'reply', status: 'processed', contactId, sequenceId }
    ]);
    getActiveUserMock.mockResolvedValue({ id: 10 });
    getTeamForUserMock.mockResolvedValue({ id: 77 });

    const postRequest = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify({
        type: 'reply',
        messageId: 'msg-1',
        contactId,
        sequenceId,
        occurredAt: occurredAt.toISOString()
      })
    });

    const postResponse = await POST(postRequest);
    expect(postResponse.status).toBe(200);

    ({ GET: GET_LOGS } = await import('@/app/api/sequences/logs/[id]/route'));

    const logsResponse = await GET_LOGS(
      new Request(
        `http://localhost/api/sequences/logs/${sequenceId}?status=replied&page=1&pageSize=20`
      ),
      { params: { id: sequenceId } }
    );

    expect(logsResponse.status).toBe(200);
    expect(listSequenceDeliveryLogsForTeamMock).toHaveBeenLastCalledWith(
      77,
      sequenceId,
      expect.objectContaining({ type: 'reply', page: 1, pageSize: 20 })
    );

    const payload = await logsResponse.json();
    expect(Array.isArray(payload.logs)).toBe(true);
    expect(payload.logs.length).toBeGreaterThan(0);
    expect(payload.logs[0]).toMatchObject({ status: 'replied', type: 'reply' });
  });
});
