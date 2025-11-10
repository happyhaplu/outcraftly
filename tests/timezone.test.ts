import { describe, expect, it } from 'vitest';

import { computeScheduledUtc, formatTimeRangePreview } from '@/lib/timezone';

describe('computeScheduledUtc', () => {
  it('schedules fixed mode on the next allowed send day in the target timezone', () => {
    const result = computeScheduledUtc({
      now: new Date('2025-10-19T22:00:00Z'),
      stepDelayHours: 0,
      contactTimezone: 'America/Los_Angeles',
      fallbackTimezone: 'UTC',
      schedule: {
        mode: 'fixed',
        sendTime: '09:30',
        respectContactTimezone: false,
        timezone: 'America/New_York',
        sendDays: ['Mon', 'Wed'],
        sendWindows: null
      }
    });

    expect(result.toISOString()).toBe('2025-10-20T13:30:00.000Z');
  });

  it('samples within configured windows when respecting the contact timezone', () => {
    const result = computeScheduledUtc({
      now: new Date('2025-10-20T18:00:00Z'),
      stepDelayHours: 0,
      contactTimezone: 'America/New_York',
      fallbackTimezone: 'UTC',
      schedule: {
        mode: 'window',
        sendWindowStart: '09:00',
        sendWindowEnd: '17:00',
        respectContactTimezone: true,
        timezone: null,
        sendDays: ['Tue'],
        sendWindows: [
          { start: '10:30', end: '12:00' },
          { start: '14:00', end: '15:00' }
        ]
      },
      random: () => 0
    });

    expect(result.toISOString()).toBe('2025-10-21T14:30:00.000Z');
  });

  it('rolls forward for immediate mode respecting send days and windows', () => {
    const result = computeScheduledUtc({
      now: new Date('2025-10-19T12:00:00Z'),
      stepDelayHours: 0,
      contactTimezone: 'America/New_York',
      fallbackTimezone: 'UTC',
      schedule: {
        mode: 'immediate',
        respectContactTimezone: true,
        timezone: null,
        sendDays: ['Mon'],
        sendWindows: [{ start: '09:00', end: '17:00' }]
      }
    });

    expect(result.toISOString()).toBe('2025-10-20T13:00:00.000Z');
  });
});

describe('formatTimeRangePreview', () => {
  it('formats the first window range using the resolved timezone', () => {
    const preview = formatTimeRangePreview(
      {
        mode: 'window',
        sendWindowStart: '09:00',
        sendWindowEnd: '17:00',
        respectContactTimezone: true,
        timezone: 'America/Los_Angeles',
        sendWindows: [{ start: '08:30', end: '11:00' }]
      },
      'UTC'
    );

    expect(preview).toMatch(/AM/);
  });
});
