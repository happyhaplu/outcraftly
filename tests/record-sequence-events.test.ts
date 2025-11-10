import { describe, expect, it, beforeEach, vi } from 'vitest';

import { recordSequenceEvents, type SequenceInboundEvent } from '@/lib/db/queries';

function createClientHarness() {
  const inserts: any[] = [];
  const updates: any[] = [];
  const whereCalls: any[] = [];

  const client = {
    transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
      const tx = {
        insert: vi.fn(() => ({
          values: (payload: any) => {
            inserts.push(payload);
            return Promise.resolve();
          }
        })),
        update: vi.fn(() => ({
          set: (data: any) => {
            updates.push(data);
            return {
              where: (condition: unknown) => {
                whereCalls.push(condition);
                return Promise.resolve();
              }
            };
          }
        }))
      };

      return callback(tx);
    })
  };

  return { client: client as any, inserts, updates, whereCalls };
}

const baseTarget = {
  contactId: 'contact-1',
  sequenceId: 'sequence-1',
  statusId: 'status-1',
  currentStatus: 'pending' as const,
  currentStepId: 'step-1',
  lastSentStepId: 'step-1',
  replyAt: null,
  bounceAt: null
};

describe('recordSequenceEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a reply and stores enriched payload metadata', async () => {
    const occurredAt = new Date('2025-10-01T08:00:00.000Z');
    const { client, inserts, updates } = createClientHarness();

    const resolveTarget = vi.fn(async () => ({
      ...baseTarget,
      matchedMessageId: 'message-1'
    }));

    const events: SequenceInboundEvent[] = [
      {
        type: 'reply',
        messageId: 'message-1',
        contactId: baseTarget.contactId,
        sequenceId: baseTarget.sequenceId,
        occurredAt,
        payload: { subject: 'Re: Hello', snippet: 'Great to hear from you!' }
      }
    ];

    const results = await recordSequenceEvents(events, { client, resolveTarget });

    expect(resolveTarget).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        type: 'reply',
        status: 'processed',
        contactId: baseTarget.contactId,
        sequenceId: baseTarget.sequenceId
      }
    ]);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      contactId: baseTarget.contactId,
      sequenceId: baseTarget.sequenceId,
      statusId: baseTarget.statusId,
      stepId: baseTarget.lastSentStepId,
      status: 'replied',
      type: 'reply',
      messageId: 'message-1',
      createdAt: occurredAt
    });
    expect(inserts[0].payload).toMatchObject({
      raw: { subject: 'Re: Hello', snippet: 'Great to hear from you!' },
      subject: 'Re: Hello',
      snippet: 'Great to hear from you!',
      matchedMessageId: 'message-1',
      incomingMessageId: 'message-1'
    });
    expect(Array.isArray(inserts[0].payload.candidates)).toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      replyAt: occurredAt,
      lastUpdated: occurredAt,
      status: 'replied',
      stepId: null,
      scheduledAt: null
    });
  });

  it('records a bounce and updates bounce metadata', async () => {
    const occurredAt = new Date('2025-10-03T08:00:00.000Z');
    const { client, inserts, updates } = createClientHarness();

    const resolveTarget = vi.fn(async () => ({ ...baseTarget }));

    const events: SequenceInboundEvent[] = [
      {
        type: 'bounce',
        messageId: 'message-3',
        contactId: baseTarget.contactId,
        sequenceId: baseTarget.sequenceId,
        occurredAt,
        payload: { reason: 'hard_bounce' }
      }
    ];

    const results = await recordSequenceEvents(events, { client, resolveTarget });

    expect(results).toEqual([
      {
        type: 'bounce',
        status: 'processed',
        contactId: baseTarget.contactId,
        sequenceId: baseTarget.sequenceId
      }
    ]);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      status: 'failed',
      type: 'bounce'
    });
    expect(inserts[0].payload).toMatchObject({
      raw: { reason: 'hard_bounce' },
      subject: null,
      snippet: null
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      bounceAt: occurredAt,
      status: 'bounced',
      stepId: null,
      scheduledAt: null
    });
  });

  it('skips events when no target can be resolved', async () => {
    const { client, inserts, updates } = createClientHarness();

    const resolveTarget = vi.fn(async () => null);

    const events: SequenceInboundEvent[] = [
      {
        type: 'reply',
        messageId: 'unknown',
        contactId: null,
        sequenceId: null,
        occurredAt: null,
        payload: null
      }
    ];

    const results = await recordSequenceEvents(events, { client, resolveTarget });

    expect(results).toEqual([
      {
        type: 'reply',
        status: 'skipped',
        reason: 'target_not_found'
      }
    ]);

    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
