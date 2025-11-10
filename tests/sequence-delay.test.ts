import { describe, it, expect } from 'vitest';
import { computeEffectiveNextSchedule, computeNextSendAt, type StepDelayUnit } from '../lib/workers/sequence-worker';

const MINUTE_MS = 60 * 1000;

describe('computeNextSendAt', () => {
  const reference = new Date('2025-10-20T12:00:00Z');

  const makeExpectation = (
    value: number | null | undefined,
    unit: StepDelayUnit | null | undefined,
    globalMin: number,
    expectedMinutes: number,
    expectedDefaultUsed: boolean
  ) => {
    const result = computeNextSendAt(reference, value, unit, globalMin);
    expect(result.stepDelayMinutes).toBeCloseTo(expectedMinutes, 5);
    expect(result.usedDefaultGap).toBe(expectedDefaultUsed);
    expect(Math.abs(result.desiredAt.getTime() - (reference.getTime() + expectedMinutes * MINUTE_MS))).toBeLessThanOrEqual(1);
    return result;
  };

  it('falls back to the default two minute gap when no delay is provided', () => {
    const result = makeExpectation(null, null, 0, 2, true);
    expect(result.effectiveMinGapMinutes).toBeCloseTo(2, 5);
    expect(result.delayedByMs).toBeCloseTo(2 * MINUTE_MS, 5);
  });

  it('treats zero delay the same as no delay', () => {
    const result = makeExpectation(0, 'minutes', 0, 2, true);
    expect(result.effectiveMinGapMinutes).toBeCloseTo(2, 5);
  });

  it('respects a delay defined in minutes', () => {
    const result = makeExpectation(5, 'minutes', 0, 5, false);
    expect(result.effectiveMinGapMinutes).toBeCloseTo(5, 5);
  });

  it('respects a delay defined in hours', () => {
    const result = makeExpectation(2, 'hours', 0, 120, false);
    expect(result.effectiveMinGapMinutes).toBeCloseTo(120, 5);
  });

  it('respects a delay defined in days', () => {
    const result = makeExpectation(1, 'days', 0, 1440, false);
    expect(result.effectiveMinGapMinutes).toBeCloseTo(1440, 5);
  });

  it('bumps the effective gap when the global minimum is larger', () => {
    const result = makeExpectation(1, 'minutes', 10, 1, false);
    expect(result.effectiveMinGapMinutes).toBeCloseTo(10, 5);
  });
});

describe('computeEffectiveNextSchedule', () => {
  it('marks a future send as a step delay', () => {
    const now = new Date('2025-10-20T12:00:00Z');
    const stepComputation = computeNextSendAt(now, 1, 'days', 0);
    const result = computeEffectiveNextSchedule(
      stepComputation.desiredAt,
      now,
      now.getTime(),
      null,
      stepComputation.effectiveMinGapMinutes
    );

    expect(result.scheduleAt.getTime()).toBe(stepComputation.desiredAt.getTime());
    expect(result.reason).toBe('step_delay');
    expect(result.delayedByMs).toBeCloseTo(24 * 60 * MINUTE_MS, 5);
  });

  it('upgrades to a min_gap when the global interval wins', () => {
    const now = new Date('2025-10-20T12:00:00Z');
    const stepComputation = computeNextSendAt(now, 2, 'minutes', 0);
    const result = computeEffectiveNextSchedule(
      stepComputation.desiredAt,
      now,
      now.getTime(),
      null,
      5
    );

    const earliest = new Date(now.getTime() + 5 * MINUTE_MS);
    expect(result.scheduleAt.getTime()).toBe(earliest.getTime());
    expect(result.reason).toBe('min_gap');
    expect(result.delayedByMs).toBeCloseTo(5 * MINUTE_MS, 5);
  });

  it('returns an immediate schedule when desired is not in the future', () => {
    const now = new Date('2025-10-20T12:00:00Z');
    const result = computeEffectiveNextSchedule(now, now, null, null, 5);

    expect(result.scheduleAt.getTime()).toBe(now.getTime());
    expect(result.reason).toBeNull();
    expect(result.delayedByMs).toBe(0);
  });
});
