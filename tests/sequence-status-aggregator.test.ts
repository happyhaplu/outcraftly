import { describe, expect, it } from 'vitest';

import { aggregateSequenceRows } from '@/lib/db/aggregator';
import type { SequenceDeliveryStatus } from '@/lib/db/schema';

type Row = Parameters<typeof aggregateSequenceRows>[0][number];

describe('aggregateSequenceRows', () => {
  it('computes summary and step breakdown for assorted statuses', () => {
    const base = new Date('2025-01-01T00:00:00.000Z');
    const rows: Row[] = [
      {
        id: 'status-1',
        contactId: 'contact-1',
        status: 'pending',
        lastUpdated: base,
        scheduledAt: base,
        sentAt: null,
        attempts: 0,
        replyAt: null,
        bounceAt: null,
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: 1,
        stepSubject: 'Intro email',
        stepId: 'step-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        company: 'Computing Ltd',
        timezone: 'America/Los_Angeles',
        scheduleMode: 'fixed',
        scheduleSendTime: '09:00',
        scheduleWindowStart: null,
        scheduleWindowEnd: null,
        scheduleRespectTimezone: true,
        scheduleFallbackTimezone: 'UTC',
        scheduleTimezone: 'America/Los_Angeles',
        scheduleSendDays: ['Mon', 'Wed'],
        scheduleSendWindows: [{ start: '09:00', end: '11:00' }],
        manualTriggeredAt: null,
        manualSentAt: null
      },
      {
        id: 'status-2',
        contactId: 'contact-2',
        status: 'sent',
        lastUpdated: new Date(base.getTime() + 60_000),
        scheduledAt: base,
        sentAt: new Date(base.getTime() + 60_000),
        attempts: 1,
        replyAt: null,
        bounceAt: null,
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: 1,
        stepSubject: 'Intro email',
        stepId: 'step-1',
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        company: 'Compilers Inc',
        timezone: null,
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
        manualSentAt: null
      },
      {
        id: 'status-3',
        contactId: 'contact-3',
        status: 'replied',
        lastUpdated: new Date(base.getTime() + 120_000),
        scheduledAt: base,
        sentAt: new Date(base.getTime() + 90_000),
        attempts: 1,
        replyAt: new Date(base.getTime() + 120_000),
        bounceAt: null,
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: 2,
        stepSubject: 'Follow-up',
        stepId: 'step-2',
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan@example.com',
        company: 'Enigma',
        timezone: 'Europe/London',
        scheduleMode: 'window',
        scheduleSendTime: null,
        scheduleWindowStart: '10:00',
        scheduleWindowEnd: '14:00',
        scheduleRespectTimezone: true,
        scheduleFallbackTimezone: 'UTC',
        scheduleTimezone: 'Europe/London',
        scheduleSendDays: ['Tue', 'Thu'],
        scheduleSendWindows: [
          { start: '10:00', end: '12:00' },
          { start: '12:00', end: '14:00' }
        ],
        manualTriggeredAt: null,
        manualSentAt: null
      },
      {
        id: 'status-4',
        contactId: 'contact-4',
        status: 'bounced',
        lastUpdated: new Date(base.getTime() + 180_000),
        scheduledAt: base,
        sentAt: new Date(base.getTime() + 150_000),
        attempts: 1,
        replyAt: null,
        bounceAt: new Date(base.getTime() + 180_000),
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: 2,
        stepSubject: 'Follow-up',
        stepId: 'step-2',
        firstName: 'Katherine',
        lastName: 'Johnson',
        email: 'kj@example.com',
        company: 'NASA',
        timezone: 'America/New_York',
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
        manualSentAt: null
      },
      {
        id: 'status-5',
        contactId: 'contact-5',
        status: 'failed',
        lastUpdated: new Date(base.getTime() + 240_000),
        scheduledAt: base,
        sentAt: null,
        attempts: 3,
        replyAt: null,
        bounceAt: null,
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: null,
        stepSubject: null,
        stepId: null,
        firstName: 'Tim',
        lastName: 'Berners-Lee',
        email: 'tbl@example.com',
        company: 'W3C',
        timezone: null,
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
        manualSentAt: null
      },
      {
        id: 'status-6',
        contactId: 'contact-6',
        status: 'skipped' as SequenceDeliveryStatus,
        lastUpdated: new Date(base.getTime() + 300_000),
        scheduledAt: base,
        sentAt: null,
        attempts: 0,
        replyAt: null,
        bounceAt: null,
        skippedAt: new Date(base.getTime() + 300_000),
        lastThrottleAt: null,
        stepOrder: 3,
        stepSubject: 'Final touch',
        stepId: 'step-3',
        firstName: 'Margaret',
        lastName: 'Hamilton',
        email: 'margaret@example.com',
        company: 'MIT',
        timezone: 'America/New_York',
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
        manualSentAt: null
      }
    ];

    const stepDefinitions = [
      { id: 'step-1', order: 1, subject: 'Intro email' },
      { id: 'step-2', order: 2, subject: 'Follow-up' },
      { id: 'step-3', order: 3, subject: 'Final touch' }
    ];

    const result = aggregateSequenceRows(rows, {
      steps: stepDefinitions,
      sentPerStep: {
        'step-1': 4,
        'step-2': 2
      }
    });

    expect(result.summary).toMatchObject({
      total: 6,
      pending: 1,
      sent: 1,
      replied: 1,
      replyCount: 1,
      bounced: 1,
      failed: 1,
      skipped: 1
    });
    expect(result.summary.lastActivity?.toISOString()).toBe(new Date(base.getTime() + 300_000).toISOString());

    expect(result.steps).toHaveLength(4);
    const step1 = result.steps.find((step) => step.stepId === 'step-1');
    expect(step1).toMatchObject({ pending: 1, sent: 4, replied: 0, bounced: 0, failed: 0, skipped: 0 });

    const step2 = result.steps.find((step) => step.stepId === 'step-2');
    expect(step2).toMatchObject({ pending: 0, sent: 2, replied: 1, bounced: 1, failed: 0, skipped: 0 });

    const noStep = result.steps.find((step) => step.stepId === null);
    expect(noStep).toMatchObject({ failed: 1 });

    expect(result.contacts.map((c) => c.id)).toContain('status-3');
    expect(result.sentPerStep).toMatchObject({ 'step-1': 4, 'step-2': 2 });
  });

  it('honours sent-per-step data even when no contacts are currently on that step', () => {
    const result = aggregateSequenceRows([], {
      steps: [{ id: 'step-1', order: 1, subject: 'Intro' }],
      sentPerStep: { 'step-1': 2 }
    });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ stepId: 'step-1', sent: 2, pending: 0 });
    expect(result.sentPerStep).toEqual({ 'step-1': 2 });
  });

  it('deduplicates replyCount by contact id, including reply logs', () => {
    const base = new Date('2025-01-01T00:00:00.000Z');
    const rows: Row[] = [
      {
        id: 'status-1',
        contactId: 'contact-1',
        status: 'replied',
        lastUpdated: base,
        scheduledAt: base,
        sentAt: base,
        attempts: 1,
        replyAt: base,
        bounceAt: null,
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: 1,
        stepSubject: 'Intro email',
        stepId: 'step-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        company: 'Computing Ltd',
        timezone: 'America/Los_Angeles',
        scheduleMode: 'fixed',
        scheduleSendTime: '09:00',
        scheduleWindowStart: null,
        scheduleWindowEnd: null,
        scheduleRespectTimezone: true,
        scheduleFallbackTimezone: 'UTC',
        scheduleTimezone: 'America/Los_Angeles',
        scheduleSendDays: ['Mon'],
        scheduleSendWindows: [{ start: '09:00', end: '11:00' }],
        manualTriggeredAt: null,
        manualSentAt: null,
        hasReplyLog: true
      },
      {
        id: 'status-2',
        contactId: 'contact-1',
        status: 'sent',
        lastUpdated: new Date(base.getTime() + 60_000),
        scheduledAt: base,
        sentAt: new Date(base.getTime() + 60_000),
        attempts: 1,
        replyAt: null,
        bounceAt: null,
        skippedAt: null,
        lastThrottleAt: null,
        stepOrder: 2,
        stepSubject: 'Follow-up',
        stepId: 'step-2',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        company: 'Computing Ltd',
        timezone: 'America/Los_Angeles',
        scheduleMode: 'fixed',
        scheduleSendTime: '10:00',
        scheduleWindowStart: null,
        scheduleWindowEnd: null,
        scheduleRespectTimezone: true,
        scheduleFallbackTimezone: 'UTC',
        scheduleTimezone: 'America/Los_Angeles',
        scheduleSendDays: ['Tue'],
        scheduleSendWindows: [{ start: '10:00', end: '12:00' }],
        manualTriggeredAt: null,
        manualSentAt: null,
        hasReplyLog: true
      }
    ];

    const result = aggregateSequenceRows(rows, {
      sentPerStep: {}
    });

  expect(result.summary.replied).toBe(1);
  expect(result.summary.replyCount).toBe(1);
  });
});
