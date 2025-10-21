// @ts-ignore: no declaration file for 'luxon' in this project
import { DateTime } from 'luxon';

export type SchedulingMode = 'fixed' | 'window';

export type FixedScheduleOptions = {
  mode: 'fixed';
  sendTime: string; // HH:mm
  respectContactTimezone: boolean;
};

export type WindowScheduleOptions = {
  mode: 'window';
  sendWindowStart: string; // HH:mm
  sendWindowEnd: string; // HH:mm
  respectContactTimezone: boolean;
};

export type SequenceScheduleOptions = FixedScheduleOptions | WindowScheduleOptions;

export type ScheduleComputationInput = {
  now: Date;
  stepDelayHours: number;
  contactTimezone?: string | null;
  fallbackTimezone: string;
  schedule: SequenceScheduleOptions;
  random?: () => number;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_ZONE = 'UTC';

function isValidTimezone(zone: string | null | undefined): zone is string {
  if (!zone) {
    return false;
  }

  const dt = DateTime.now().setZone(zone, { keepLocalTime: true });
  return dt.isValid;
}

export function parseTimeLabel(value: string): { hour: number; minute: number } {
  const trimmed = value.trim();
  const match = TIME_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid time value: ${value}`);
  }
  const hour = Number.parseInt(match[1]!, 10);
  const minute = Number.parseInt(match[2]!, 10);
  return { hour, minute };
}

function resolveZone(preferred: string | null | undefined, fallback: string): string {
  if (isValidTimezone(preferred)) {
    return preferred;
  }
  if (isValidTimezone(fallback)) {
    return fallback;
  }
  return DEFAULT_ZONE;
}

function applyStepDelay(now: Date, stepDelayHours: number): DateTime {
  return DateTime.fromJSDate(now, { zone: 'utc' }).plus({ hours: stepDelayHours });
}

function computeFixedSchedule(
  base: DateTime,
  zone: string,
  sendTime: string
): DateTime {
  const { hour, minute } = parseTimeLabel(sendTime);
  let target = base.setZone(zone).set({ hour, minute, second: 0, millisecond: 0 });

  if (target < base.setZone(zone)) {
    target = target.plus({ days: 1 });
  }

  return target.toUTC();
}

function computeWindowSchedule(
  base: DateTime,
  zone: string,
  sendWindowStart: string,
  sendWindowEnd: string,
  random: () => number
): DateTime {
  const { hour: startHour, minute: startMinute } = parseTimeLabel(sendWindowStart);
  const { hour: endHour, minute: endMinute } = parseTimeLabel(sendWindowEnd);

  let start = base.setZone(zone).set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  let end = base.setZone(zone).set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

  if (end <= start) {
    // window wraps or invalid; treat as next-day end
    end = end.plus({ days: 1 });
    if (end <= start) {
      throw new Error('End of window must be after start time');
    }
  }

  const localBase = base.setZone(zone);

  if (localBase > end) {
    const diffDays = Math.ceil(localBase.diff(end, 'days').days);
    start = start.plus({ days: diffDays });
    end = end.plus({ days: diffDays });
  } else if (localBase > start && localBase < end) {
    start = localBase;
  } else if (localBase > start && localBase >= end) {
    start = start.plus({ days: 1 });
    end = end.plus({ days: 1 });
  }

  const windowDuration = end.diff(start, 'milliseconds').milliseconds;
  if (windowDuration <= 0) {
    throw new Error('Scheduling window duration must be positive');
  }

  const clampRandom = Math.min(Math.max(random(), 0), 0.9999999999);
  const scheduledLocal = start.plus({ milliseconds: windowDuration * clampRandom });
  return scheduledLocal.toUTC();
}

export function computeScheduledUtc(input: ScheduleComputationInput): Date {
  const { now, stepDelayHours, contactTimezone, fallbackTimezone, schedule } = input;
  const random = input.random ?? Math.random;

  const base = applyStepDelay(now, stepDelayHours);
  const zone = schedule.respectContactTimezone
    ? resolveZone(contactTimezone, fallbackTimezone)
    : resolveZone(null, fallbackTimezone);

  if (schedule.mode === 'fixed') {
    const scheduled = computeFixedSchedule(base, zone, schedule.sendTime);
    return scheduled.toJSDate();
  }

  const scheduled = computeWindowSchedule(base, zone, schedule.sendWindowStart, schedule.sendWindowEnd, random);
  return scheduled.toJSDate();
}

export function formatTimeRangePreview(schedule: SequenceScheduleOptions, zone: string): string {
  const validZone = resolveZone(zone, DEFAULT_ZONE);
  if (schedule.mode === 'fixed') {
    const { hour, minute } = parseTimeLabel(schedule.sendTime);
    const sample = DateTime.now().setZone(validZone).set({ hour, minute });
    return sample.toFormat('h:mm a');
  }

  const start = DateTime.now().setZone(validZone).set(parseTimeLabel(schedule.sendWindowStart));
  const end = DateTime.now().setZone(validZone).set(parseTimeLabel(schedule.sendWindowEnd));
  const startLabel = start.toFormat('h:mm a');
  const endLabel = end.toFormat('h:mm a');
  return `${startLabel} – ${endLabel}`;
}
