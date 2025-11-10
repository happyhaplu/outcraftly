import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/sequences/status/[id]/route';

const {
  getActiveUserMock,
  getTeamForUserMock,
  getSequenceStatusForTeamMock,
  syncSequenceRepliesFromLogsMock
} = vi.hoisted(() => ({
  getActiveUserMock: vi.fn(),
  getTeamForUserMock: vi.fn(),
  getSequenceStatusForTeamMock: vi.fn(),
  syncSequenceRepliesFromLogsMock: vi.fn(async () => 0)
}));

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getSequenceStatusForTeam: getSequenceStatusForTeamMock,
    syncSequenceRepliesFromLogs: syncSequenceRepliesFromLogsMock
  };
});

import { aggregateSequenceRows } from '@/lib/db/aggregator';
import type { RawSequenceRow } from '@/lib/db/aggregator';

const buildSequenceRow = (overrides: Partial<RawSequenceRow> = {}): RawSequenceRow => ({
  sequenceId: 'seq-default',
  id: 'status-default',
  contactId: 'contact-default',
  status: 'pending',
  lastUpdated: null,
  scheduledAt: null,
  sentAt: null,
  attempts: 0,
  replyAt: null,
  bounceAt: null,
  skippedAt: null,
  lastThrottleAt: null,
  stepOrder: null,
  stepSubject: null,
  stepId: null,
  firstName: 'Test',
  lastName: 'Contact',
  email: 'test@example.com',
  company: null,
  timezone: 'UTC',
  scheduleMode: null,
  scheduleSendTime: null,
  scheduleWindowStart: null,
  scheduleWindowEnd: null,
  scheduleRespectTimezone: true,
  scheduleFallbackTimezone: null,
  scheduleTimezone: null,
  scheduleSendDays: null,
  scheduleSendWindows: null,
  manualTriggeredAt: null,
  manualSentAt: null,
  hasReplyLog: false,
  ...overrides
});

describe('GET /api/sequences/status/[id]', () => {
  beforeAll(async () => {
    ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
  });

  beforeEach(() => {
    vi.resetAllMocks();
    getActiveUserMock.mockReset();
    getTeamForUserMock.mockReset();
    getSequenceStatusForTeamMock.mockReset();
    syncSequenceRepliesFromLogsMock.mockReset();
    syncSequenceRepliesFromLogsMock.mockResolvedValue(0);
  });

  it('returns aggregated status payload', async () => {
    getActiveUserMock.mockResolvedValue({ id: 123 } as any);
    getTeamForUserMock.mockResolvedValue({ id: 456 } as any);
    getSequenceStatusForTeamMock.mockResolvedValue({
      sequence: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Warm leads',
        status: 'paused',
        launchAt: null,
        launchedAt: new Date('2025-01-01T00:00:30Z'),
        senderId: 10,
        sender: {
          id: 10,
          name: 'Alice Sender',
          email: 'alice@example.com',
          status: 'verified'
        },
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:01:00Z'),
        minGapMinutes: 10,
        deletedAt: null
      },
      summary: {
        total: 2,
        pending: 1,
        sent: 0,
        replied: 1,
        replyCount: 1,
        bounced: 0,
        failed: 0,
        skipped: 0,
        lastActivity: new Date('2025-01-01T00:01:00Z')
      },
      contacts: [
        {
          id: 'status-1',
          contactId: 'contact-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          company: 'Computing Ltd',
          timezone: 'America/New_York',
          status: 'pending',
          lastUpdated: new Date('2025-01-01T00:00:00Z'),
          stepOrder: 1,
          stepSubject: 'Intro',
          stepId: 'step-1',
          scheduledAt: new Date('2025-01-01T00:00:00Z'),
          sentAt: null,
          attempts: 0,
          replyAt: null,
          bounceAt: null,
          skippedAt: null,
          lastThrottleAt: null,
          scheduleMode: 'fixed',
          scheduleSendTime: '09:00',
          scheduleWindowStart: null,
          scheduleWindowEnd: null,
          scheduleRespectTimezone: true,
          scheduleFallbackTimezone: 'America/New_York',
          scheduleTimezone: 'America/New_York',
          scheduleSendDays: ['Mon', 'Tue'],
          scheduleSendWindows: [
            { start: '09:00', end: '11:00' },
            { start: '14:00', end: '16:00' }
          ],
          manualTriggeredAt: null,
          manualSentAt: null
        },
        {
          id: 'status-2',
          contactId: 'contact-2',
          firstName: 'Grace',
          lastName: 'Hopper',
          email: 'grace@example.com',
          company: 'Compilers Inc',
          timezone: null,
          status: 'replied',
          lastUpdated: new Date('2025-01-01T00:01:00Z'),
          stepOrder: 2,
          stepSubject: 'Follow-up',
          stepId: 'step-2',
          scheduledAt: new Date('2025-01-01T00:00:30Z'),
          sentAt: new Date('2025-01-01T00:00:45Z'),
          attempts: 1,
          replyAt: new Date('2025-01-01T00:01:00Z'),
          bounceAt: null,
          skippedAt: null,
          lastThrottleAt: null,
          scheduleMode: 'window',
          scheduleSendTime: null,
          scheduleWindowStart: '13:00',
          scheduleWindowEnd: '15:00',
          scheduleRespectTimezone: false,
          scheduleFallbackTimezone: 'UTC',
          scheduleTimezone: null,
          scheduleSendDays: null,
          scheduleSendWindows: null,
          manualTriggeredAt: null,
          manualSentAt: null
        }
      ],
      steps: [
        { stepId: 'step-1', order: 1, subject: 'Intro', pending: 1, sent: 3, replied: 0, bounced: 0, failed: 0, skipped: 0 },
        { stepId: 'step-2', order: 2, subject: 'Follow-up', pending: 0, sent: 1, replied: 1, bounced: 0, failed: 0, skipped: 0 }
      ],
      sentPerStep: {
        'step-1': 3,
        'step-2': 1
      },
      worker: {
        queueSize: 3,
        lastRunAt: new Date('2025-01-01T00:02:00Z'),
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      }
    });

    const response = await GET(new Request('http://example.com'), {
      params: { id: '00000000-0000-0000-0000-000000000001' }
    });
    expect(response.status).toBe(200);

    expect(syncSequenceRepliesFromLogsMock).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');

    const payload = await response.json();
    expect(payload.summary).toMatchObject({
      total: 2,
      pending: 1,
      replyCount: 1,
      replied: 1,
      skipped: 0
    });
    expect(payload.summary.lastActivity).toBe('2025-01-01T00:01:00.000Z');
    expect(payload.summaryKeys).toEqual([
      'total',
      'pending',
      'sent',
      'replied',
      'replyCount',
      'bounced',
      'failed',
      'skipped',
      'lastActivity'
    ]);
    expect(payload.meta).toMatchObject({
      payloadHasReplyCount: true,
      aggregatedReplyCount: 1,
      repliedCount: 1
    });
    expect(payload.sequence).toMatchObject({ status: 'paused', name: 'Warm leads' });
    expect(payload.contacts).toHaveLength(2);
    expect(payload.contacts[1]).toMatchObject({ status: 'replied', replyAt: '2025-01-01T00:01:00.000Z' });
    expect(payload.steps).toHaveLength(2);
    expect(payload.sentPerStep).toEqual({ 'step-1': 3, 'step-2': 1 });
    expect(payload.worker.queueSize).toBe(3);
  });

  it('surfaces reply metadata when reply events exist', async () => {
    getActiveUserMock.mockResolvedValue({ id: 789 } as any);
    getTeamForUserMock.mockResolvedValue({ id: 987 } as any);

    const replyAt = new Date('2025-02-01T12:00:00Z');
    const repliedRow: RawSequenceRow = {
      sequenceId: 'seq-reply-rich',
      id: 'status-replied-1',
      contactId: 'contact-replied-1',
      status: 'replied',
      lastUpdated: replyAt,
      scheduledAt: new Date('2025-02-01T11:45:00Z'),
      sentAt: new Date('2025-02-01T11:50:00Z'),
      attempts: 1,
      replyAt,
      bounceAt: null,
      skippedAt: null,
      lastThrottleAt: null,
      stepOrder: 1,
      stepSubject: 'Intro',
      stepId: 'step-replied-1',
      firstName: 'Reply',
      lastName: 'Tester',
      email: 'reply@test.dev',
      company: 'Replay Ltd',
      timezone: 'UTC',
      scheduleMode: 'fixed',
      scheduleSendTime: '09:00',
      scheduleWindowStart: null,
      scheduleWindowEnd: null,
      scheduleRespectTimezone: true,
      scheduleFallbackTimezone: 'UTC',
      scheduleTimezone: 'UTC',
      scheduleSendDays: ['Mon'],
      scheduleSendWindows: [{ start: '09:00', end: '11:00' }],
      manualTriggeredAt: null,
      manualSentAt: null,
      hasReplyLog: true
    };

    const aggregated = aggregateSequenceRows([repliedRow], {
      sequenceId: repliedRow.sequenceId,
      steps: [{ id: 'step-replied-1', order: 1, subject: 'Intro' }],
      sentPerStep: { 'step-replied-1': 1 }
    });

    getSequenceStatusForTeamMock.mockResolvedValue({
      sequence: {
        id: '99999999-aaaa-bbbb-cccc-dddddddddddd',
        name: 'Reply rich sequence',
        status: 'active',
        launchAt: null,
        launchedAt: null,
        senderId: null,
        sender: null,
        createdAt: new Date('2025-02-01T11:00:00Z'),
        updatedAt: replyAt,
        minGapMinutes: null,
        deletedAt: null
      },
      summary: aggregated.summary,
      contacts: aggregated.contacts,
      steps: aggregated.steps,
      sentPerStep: aggregated.sentPerStep,
      uniqueReplyContacts: aggregated.uniqueReplyContacts,
      uniqueReplyCount: aggregated.uniqueReplyCount,
      worker: {
        queueSize: 0,
        lastRunAt: null,
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      }
    });

    const response = await GET(new Request('http://example.com'), {
      params: { id: '99999999-aaaa-bbbb-cccc-dddddddddddd' }
    });

    expect(response.status).toBe(200);
    expect(syncSequenceRepliesFromLogsMock).toHaveBeenCalledWith('99999999-aaaa-bbbb-cccc-dddddddddddd');
    const payload = await response.json();

    expect(payload.summary.replyCount).toBe(1);
    expect(payload.summary.replied).toBe(1);
    expect(payload.summary.lastActivity).toBe('2025-02-01T12:00:00.000Z');
    expect(payload.meta.uniqueReplyContacts).toEqual(['contact-replied-1']);
    expect(payload.meta.uniqueReplyCount).toBe(1);
    expect(payload.steps[0].replied).toBe(1);
    expect(payload.contacts[0]).toMatchObject({ replyAt: '2025-02-01T12:00:00.000Z' });
  });

  it('surfaces reply metrics even when steps are undefined', async () => {
    getActiveUserMock.mockResolvedValue({ id: 567 } as any);
    getTeamForUserMock.mockResolvedValue({ id: 765 } as any);

    const replyAt = new Date('2025-03-01T08:30:00Z');
    const rows: RawSequenceRow[] = [
      {
        sequenceId: 'seq-no-step',
        id: 'status-no-step-1',
        contactId: 'contact-no-step-1',
        status: 'replied',
        lastUpdated: replyAt,
        scheduledAt: new Date('2025-03-01T08:00:00Z'),
        sentAt: new Date('2025-03-01T08:10:00Z'),
        attempts: 1,
        replyAt,
        bounceAt: null,
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: null,
        stepSubject: null,
        stepId: null,
        firstName: 'No',
        lastName: 'Step',
        email: 'nostep@example.com',
        company: 'Fallback LLC',
        timezone: 'UTC',
        scheduleMode: 'fixed',
        scheduleSendTime: '08:00',
        scheduleWindowStart: null,
        scheduleWindowEnd: null,
        scheduleRespectTimezone: true,
        scheduleFallbackTimezone: 'UTC',
        scheduleTimezone: 'UTC',
        scheduleSendDays: ['Mon'],
        scheduleSendWindows: [{ start: '08:00', end: '10:00' }],
        manualTriggeredAt: null,
        manualSentAt: null,
        hasReplyLog: false
      }
    ];

  const aggregated = aggregateSequenceRows(rows, { sequenceId: rows[0]?.sequenceId });

    getSequenceStatusForTeamMock.mockResolvedValue({
      sequence: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Step-less sequence',
        status: 'active',
        launchAt: null,
        launchedAt: null,
        senderId: null,
        sender: null,
        createdAt: new Date('2025-03-01T07:55:00Z'),
        updatedAt: replyAt,
        minGapMinutes: null,
        deletedAt: null
      },
      summary: aggregated.summary,
      contacts: aggregated.contacts,
      steps: aggregated.steps,
      sentPerStep: aggregated.sentPerStep,
      uniqueReplyContacts: aggregated.uniqueReplyContacts,
      uniqueReplyCount: aggregated.uniqueReplyCount,
      worker: {
        queueSize: 0,
        lastRunAt: null,
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      }
    });

    const response = await GET(new Request('http://example.com'), {
      params: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }
    });

    expect(response.status).toBe(200);
    expect(syncSequenceRepliesFromLogsMock).toHaveBeenCalledWith('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const payload = await response.json();

    expect(payload.summary.replyCount).toBeGreaterThan(0);
    expect(payload.summary.replied).toBe(1);
    expect(payload.summary.lastActivity).toBe(replyAt.toISOString());
    expect(payload.meta.uniqueReplyContacts).toEqual(['contact-no-step-1']);
    expect(payload.meta.uniqueReplyCount).toBe(1);
    expect(payload.steps[0]).toMatchObject({ stepId: null, replied: 1 });
  });

  it('exposes replyCount when replies are inferred from delivery logs', async () => {
    getActiveUserMock.mockResolvedValue({ id: 321 } as any);
    getTeamForUserMock.mockResolvedValue({ id: 654 } as any);

    const baseRow: RawSequenceRow = {
      sequenceId: 'seq-reply-inferred',
      id: 'status-reply-1',
      contactId: 'contact-reply-1',
      status: 'sent',
      lastUpdated: new Date('2025-01-01T00:03:00Z'),
      scheduledAt: new Date('2025-01-01T00:00:00Z'),
      sentAt: new Date('2025-01-01T00:01:00Z'),
      attempts: 1,
      replyAt: null,
      bounceAt: null,
      skippedAt: null,
      lastThrottleAt: null,
      stepOrder: 1,
      stepSubject: 'Intro',
      stepId: 'step-reply-1',
      firstName: 'Reply',
      lastName: 'Candidate',
      email: 'reply@example.com',
      company: 'Acme',
      timezone: 'UTC',
      scheduleMode: 'fixed',
      scheduleSendTime: '09:00',
      scheduleWindowStart: null,
      scheduleWindowEnd: null,
      scheduleRespectTimezone: true,
      scheduleFallbackTimezone: 'UTC',
      scheduleTimezone: 'UTC',
      scheduleSendDays: ['Mon'],
      scheduleSendWindows: [{ start: '09:00', end: '11:00' }],
      manualTriggeredAt: null,
      manualSentAt: null,
      hasReplyLog: true
    };

    const aggregated = aggregateSequenceRows([baseRow], {
      sequenceId: baseRow.sequenceId,
      steps: [{ id: 'step-reply-1', order: 1, subject: 'Intro' }],
      sentPerStep: { 'step-reply-1': 1 }
    });

    expect(aggregated.summary.replyCount).toBe(1);
    expect(aggregated.summary.replied).toBe(0);

    getSequenceStatusForTeamMock.mockResolvedValue({
      sequence: {
        id: '11111111-2222-3333-4444-555555555555',
        name: 'Reply sequence',
        status: 'active',
        launchAt: null,
        launchedAt: null,
        senderId: null,
        sender: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:03:00Z'),
        minGapMinutes: null,
        deletedAt: null
      },
      summary: aggregated.summary,
      contacts: aggregated.contacts,
      steps: aggregated.steps,
      sentPerStep: aggregated.sentPerStep,
      uniqueReplyContacts: aggregated.uniqueReplyContacts,
      uniqueReplyCount: aggregated.uniqueReplyCount,
      worker: {
        queueSize: 0,
        lastRunAt: null,
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      }
    });

    const response = await GET(new Request('http://example.com'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(200);
    expect(syncSequenceRepliesFromLogsMock).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555');
    const payload = await response.json();

    expect(payload.summary.replied).toBe(0);
    expect(payload.summary.replyCount).toBe(1);
    expect(payload.meta).toMatchObject({
      payloadHasReplyCount: true,
      aggregatedReplyCount: 1,
      repliedCount: 0
    });
  });

  it('ignores reply state from other sequences when rows are mixed', () => {
    const currentReplyAt = new Date('2025-04-01T09:00:00Z');
    const otherReplyAt = new Date('2024-12-20T12:00:00Z');

    const rows: RawSequenceRow[] = [
      buildSequenceRow({
        sequenceId: 'seq-current',
        id: 'status-current',
        contactId: 'contact-current',
        status: 'replied',
        lastUpdated: currentReplyAt,
        replyAt: currentReplyAt,
        hasReplyLog: true
      }),
      buildSequenceRow({
        sequenceId: 'seq-archived',
        id: 'status-archived',
        contactId: 'contact-archived',
        status: 'replied',
        lastUpdated: otherReplyAt,
        replyAt: otherReplyAt,
        hasReplyLog: true
      })
    ];

    const aggregated = aggregateSequenceRows(rows, { sequenceId: 'seq-current' });

    expect(aggregated.summary.total).toBe(1);
    expect(aggregated.summary.replied).toBe(1);
    expect(aggregated.summary.replyCount).toBe(1);
    expect(aggregated.contacts).toHaveLength(1);
    expect(aggregated.uniqueReplyContacts).toEqual(['contact-current']);
  });

  it('reports reply count diagnostics when replyCount is zero', async () => {
    getActiveUserMock.mockResolvedValue({ id: 432 } as any);
    getTeamForUserMock.mockResolvedValue({ id: 765 } as any);
    getSequenceStatusForTeamMock.mockResolvedValue({
      sequence: {
        id: '22222222-3333-4444-5555-666666666666',
        name: 'No replies yet',
        status: 'active',
        launchAt: null,
        launchedAt: null,
        senderId: null,
        sender: null,
        createdAt: new Date('2025-01-02T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:05:00Z'),
        minGapMinutes: null,
        deletedAt: null
      },
      summary: {
        total: 5,
        pending: 5,
        sent: 0,
        replied: 0,
        replyCount: 0,
        bounced: 0,
        failed: 0,
        skipped: 0,
        lastActivity: null
      },
      contacts: [],
      steps: [],
      sentPerStep: {},
      uniqueReplyContacts: [],
      uniqueReplyCount: 0,
      worker: {
        queueSize: 0,
        lastRunAt: null,
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      }
    });

    const response = await GET(new Request('http://example.com'), {
      params: { id: '22222222-3333-4444-5555-666666666666' }
    });

    expect(response.status).toBe(200);
    expect(syncSequenceRepliesFromLogsMock).toHaveBeenCalledWith('22222222-3333-4444-5555-666666666666');
    const payload = await response.json();
    expect(payload.summary.replyCount).toBe(0);
    expect(payload.meta).toMatchObject({
      payloadHasReplyCount: true,
      aggregatedReplyCount: 0,
      repliedCount: 0
    });
    expect(payload.summary.lastActivity).toBeNull();
    expect(payload.summaryKeys).toEqual([
      'total',
      'pending',
      'sent',
      'replied',
      'replyCount',
      'bounced',
      'failed',
      'skipped',
      'lastActivity'
    ]);
  });

  it('returns 401 when user missing', async () => {
    getActiveUserMock.mockRejectedValue(new UnauthorizedErrorRef());

    const response = await GET(new Request('http://example.com'), {
      params: { id: '00000000-0000-0000-0000-000000000001' }
    });
    expect(response.status).toBe(401);
  });

  it('returns 403 when trial expired', async () => {
    getActiveUserMock.mockRejectedValue(new InactiveTrialErrorRef());

    const response = await GET(new Request('http://example.com'), {
      params: { id: '00000000-0000-0000-0000-000000000001' }
    });
    expect(response.status).toBe(403);
  });
});
