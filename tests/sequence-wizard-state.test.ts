import { describe, expect, it } from 'vitest';

import type { SequenceWizardSchedule, SequenceWizardState } from '@/app/(dashboard)/sequences/types';
import { buildCreatePayloadFromWizardState } from '@/app/(dashboard)/sequences/wizard/use-sequence-wizard-state';

const makeBaseSchedule = (overrides: Partial<SequenceWizardSchedule> = {}): SequenceWizardSchedule => ({
  mode: 'immediate',
  sendTime: null,
  sendWindowStart: null,
  sendWindowEnd: null,
  respectContactTimezone: true,
  fallbackTimezone: null,
  timezone: null,
  sendDays: [],
  sendWindows: [],
  launchAt: null,
  ...overrides
});

const makeBaseState = (overrides: Partial<SequenceWizardState> = {}): SequenceWizardState => ({
  name: 'Demo sequence',
  steps: [
    {
      internalId: 'step-1',
      subject: 'Hello',
      body: 'Body content',
      delayValue: 0,
      delayUnit: 'hours',
      order: 1,
      skipIfReplied: false,
      skipIfBounced: false,
      delayIfReplied: null
    },
    {
      internalId: 'step-2',
      subject: 'Follow up',
      body: 'Second touch',
      delayValue: 2,
      delayUnit: 'days',
      order: 2,
      skipIfReplied: true,
      skipIfBounced: true,
      delayIfReplied: 12
    }
  ],
  senderId: 42,
  launchAt: null,
  tracking: {
    trackOpens: true,
    trackClicks: false,
    enableUnsubscribe: true
  },
  schedule: makeBaseSchedule(),
  stopCondition: 'on_reply',
  stopOnBounce: false,
  minGapMinutes: null,
  contactIds: ['contact-1', 'contact-2'],
  ...overrides
});

describe('buildCreatePayloadFromWizardState', () => {
  it('builds an immediate schedule payload', () => {
    const state = makeBaseState();
    const payload = buildCreatePayloadFromWizardState(state);

    expect(payload.name).toBe(state.name);
    expect(payload.senderId).toBe(state.senderId);
    expect(payload.launchAt).toBe(state.launchAt);
    expect(payload.schedule.mode).toBe('immediate');
    expect(payload.schedule.sendTime).toBeNull();
    expect(payload.schedule.sendWindowStart).toBeNull();
    expect(payload.schedule.sendWindowEnd).toBeNull();
    expect(payload.schedule.sendDays).toEqual([]);
    expect(payload.schedule.sendWindows).toEqual([]);
    expect(payload.contacts).toEqual(state.contactIds);

    expect(payload.steps).toHaveLength(2);
    expect(payload.steps[0]).toMatchObject({ delay: 0, order: 1 });
    expect(payload.steps[1]).toMatchObject({ delay: 48, order: 2, skipIfReplied: true, skipIfBounced: true, delayIfReplied: 12 });
  });

  it('includes daily send time for fixed schedules', () => {
    const schedule = makeBaseSchedule({ mode: 'fixed', sendTime: '09:30' });
    const state = makeBaseState({ schedule });
    const payload = buildCreatePayloadFromWizardState(state);

    expect(payload.schedule.mode).toBe('fixed');
    expect(payload.schedule.sendTime).toBe('09:30');
    expect(payload.schedule.sendWindowStart).toBeNull();
    expect(payload.schedule.sendWindowEnd).toBeNull();
    expect(payload.schedule.sendDays).toEqual([]);
    expect(payload.schedule.sendWindows).toEqual([]);
  });

  it('includes window range for window schedules', () => {
    const schedule = makeBaseSchedule({
      mode: 'window',
      sendWindowStart: '08:00',
      sendWindowEnd: '12:00',
      respectContactTimezone: false,
      fallbackTimezone: 'America/New_York'
    });
    const state = makeBaseState({ schedule });
    const payload = buildCreatePayloadFromWizardState(state);

    expect(payload.schedule.mode).toBe('window');
    expect(payload.schedule.sendTime).toBeNull();
    expect(payload.schedule.sendWindowStart).toBe('08:00');
    expect(payload.schedule.sendWindowEnd).toBe('12:00');
    expect(payload.schedule.respectContactTimezone).toBe(false);
    expect(payload.schedule.fallbackTimezone).toBe('America/New_York');
    expect(payload.schedule.sendDays).toEqual([]);
    expect(payload.schedule.sendWindows).toEqual([]);
  });

  it('normalises minimum send interval', () => {
    const state = makeBaseState({ minGapMinutes: 7.8 });
    const payload = buildCreatePayloadFromWizardState(state);
    expect(payload.minGapMinutes).toBe(7);

    const withNull = makeBaseState({ minGapMinutes: null });
    const payloadNull = buildCreatePayloadFromWizardState(withNull);
    expect(payloadNull.minGapMinutes).toBeNull();
  });
});
