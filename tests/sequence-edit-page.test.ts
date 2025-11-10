import { describe, expect, it } from 'vitest';

import { buildSequenceDetail } from '@/app/(dashboard)/sequences/[id]/edit/buildSequenceDetail';

describe('buildSequenceDetail', () => {
  it('preserves advanced step conditions when mapping sequence data', () => {
    const now = new Date('2025-10-20T10:00:00.000Z');

    const detail = buildSequenceDetail({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Demo sequence',
      status: 'active',
      senderId: 42,
      sender: {
        id: 42,
        name: 'Primary Sender',
        email: 'sender@example.com',
        status: 'verified'
      },
      createdAt: now,
      updatedAt: now,
  stopCondition: 'on_reply',
  stopOnBounce: false,
  trackOpens: true,
  trackClicks: true,
  enableUnsubscribe: true,
  scheduleMode: null,
  scheduleSendTime: null,
  scheduleWindowStart: null,
  scheduleWindowEnd: null,
  scheduleRespectTimezone: true,
  scheduleFallbackTimezone: null,
  scheduleTimezone: null,
  scheduleSendDays: null,
  scheduleSendWindows: null,
  minGapMinutes: 8,
      steps: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          subject: 'Check in',
          body: 'Hello {{firstName}}',
          delayHours: 24,
          order: 1,
          skipIfReplied: true,
          skipIfBounced: true,
          delayIfReplied: 12
        }
      ]
    } as any);

    expect(detail.steps[0]).toMatchObject({
      skipIfReplied: true,
      skipIfBounced: true,
      delayIfReplied: 12
    });
  });
});
