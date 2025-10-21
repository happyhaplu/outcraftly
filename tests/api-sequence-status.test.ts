import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/sequences/status/[id]/route';

vi.mock('@/lib/db/queries', () => ({
  getUser: vi.fn(),
  getTeamForUser: vi.fn(),
  getSequenceStatusForTeam: vi.fn()
}));

import { getUser, getTeamForUser, getSequenceStatusForTeam } from '@/lib/db/queries';

describe('GET /api/sequences/status/[id]', () => {
  const mockedGetUser = vi.mocked(getUser);
  const mockedGetTeamForUser = vi.mocked(getTeamForUser);
  const mockedGetSequenceStatusForTeam = vi.mocked(getSequenceStatusForTeam);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns aggregated status payload', async () => {
    mockedGetUser.mockResolvedValue({ id: 123 } as any);
    mockedGetTeamForUser.mockResolvedValue({ id: 456 } as any);
    mockedGetSequenceStatusForTeam.mockResolvedValue({
      sequence: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Warm leads',
        status: 'paused',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:01:00Z')
      },
      summary: {
        total: 2,
        pending: 1,
        sent: 0,
        replied: 1,
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
          scheduleMode: 'fixed',
          scheduleSendTime: '09:00',
          scheduleWindowStart: null,
          scheduleWindowEnd: null,
          scheduleRespectTimezone: true,
          scheduleFallbackTimezone: 'America/New_York'
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
          scheduleMode: 'window',
          scheduleSendTime: null,
          scheduleWindowStart: '13:00',
          scheduleWindowEnd: '15:00',
          scheduleRespectTimezone: false,
          scheduleFallbackTimezone: 'UTC'
        }
      ],
      steps: [
        { stepId: 'step-1', order: 1, subject: 'Intro', pending: 1, sent: 0, replied: 0, bounced: 0, failed: 0, skipped: 0 },
        { stepId: 'step-2', order: 2, subject: 'Follow-up', pending: 0, sent: 0, replied: 1, bounced: 0, failed: 0, skipped: 0 }
      ],
      worker: {
        queueSize: 3,
        lastRunAt: new Date('2025-01-01T00:02:00Z'),
        lastFailureAt: null,
        lastError: null
      }
    });

    const response = await GET(new Request('http://example.com'), {
      params: { id: '00000000-0000-0000-0000-000000000001' }
    });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.summary).toMatchObject({
      total: 2,
      pending: 1,
      replied: 1,
      skipped: 0
    });
    expect(payload.sequence).toMatchObject({ status: 'paused', name: 'Warm leads' });
    expect(payload.contacts).toHaveLength(2);
    expect(payload.contacts[1]).toMatchObject({ status: 'replied', replyAt: '2025-01-01T00:01:00.000Z' });
    expect(payload.steps).toHaveLength(2);
    expect(payload.worker.queueSize).toBe(3);
  });

  it('returns 401 when user missing', async () => {
    mockedGetUser.mockResolvedValue(null);

    const response = await GET(new Request('http://example.com'), {
      params: { id: '00000000-0000-0000-0000-000000000001' }
    });
    expect(response.status).toBe(401);
  });
});
