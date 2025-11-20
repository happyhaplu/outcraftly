// @ts-ignore: no declaration file for 'luxon' in this project
import { DateTime } from 'luxon';

export type SendWindow = {
  start: string;
  end: string;
};

export type SchedulingMode = 'immediate' | 'fixed' | 'window';

type BaseScheduleOptions = {
  mode: SchedulingMode;
  respectContactTimezone: boolean;
  timezone?: string | null;
  sendDays?: string[] | null;
  sendWindows?: SendWindow[] | null;
};

export type ImmediateScheduleOptions = BaseScheduleOptions & {
  mode: 'immediate';
};

export type FixedScheduleOptions = BaseScheduleOptions & {
  mode: 'fixed';
  sendTime: string; // HH:mm
};

export type WindowScheduleOptions = BaseScheduleOptions & {
  mode: 'window';
  sendWindowStart: string; // HH:mm
  sendWindowEnd: string; // HH:mm
};

export type SequenceScheduleOptions =
  | ImmediateScheduleOptions
  | FixedScheduleOptions
  | WindowScheduleOptions;

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
const MAX_LOOKAHEAD_DAYS = 14;

const DAY_LABELS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7
};

type ParsedWindow = {
  startMinutes: number;
  endMinutes: number;
};

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

function resolveZone(preferred: string | null | undefined, fallback: string | null | undefined): string {
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

function normaliseDays(days?: string[] | null): number[] {
  if (!Array.isArray(days)) {
    return [];
  }
  const seen = new Set<number>();
  const allowed: number[] = [];
  for (const raw of days) {
    if (typeof raw !== 'string') {
      continue;
    }
    const key = raw.trim().slice(0, 3);
    const upper = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
    const code = DAY_LABELS[upper as keyof typeof DAY_LABELS];
    if (code && !seen.has(code)) {
      seen.add(code);
      allowed.push(code);
    }
  }
  return allowed;
}

function normaliseWindows(windows?: SendWindow[] | null): ParsedWindow[] {
  if (!Array.isArray(windows)) {
    return [];
  }

  const result: ParsedWindow[] = [];
  for (const window of windows) {
    if (!window || typeof window.start !== 'string' || typeof window.end !== 'string') {
      continue;
    }
    try {
      const start = parseTimeLabel(window.start);
      const end = parseTimeLabel(window.end);
      const startMinutes = start.hour * 60 + start.minute;
      const endMinutes = end.hour * 60 + end.minute;
      if (endMinutes <= startMinutes) {
        continue;
      }
      result.push({ startMinutes, endMinutes });
    } catch (_error) {
      // Skip invalid window definitions.
    }
  }

  result.sort((a, b) => a.startMinutes - b.startMinutes);
  return result;
}

function resolveWindowModeWindows(schedule: WindowScheduleOptions): ParsedWindow[] {
  const fromOverrides = normaliseWindows(schedule.sendWindows);
  if (fromOverrides.length > 0) {
    return fromOverrides;
  }

  if (schedule.sendWindowStart && schedule.sendWindowEnd) {
    const fallback = normaliseWindows([{ start: schedule.sendWindowStart, end: schedule.sendWindowEnd }]);
    if (fallback.length > 0) {
      return fallback;
    }
  }

  return [{ startMinutes: 9 * 60, endMinutes: 17 * 60 }];
}

function resolveImmediateWindows(schedule: ImmediateScheduleOptions): ParsedWindow[] {
  const overrides = normaliseWindows(schedule.sendWindows);
  if (overrides.length > 0) {
    return overrides;
  }
  return [{ startMinutes: 0, endMinutes: 24 * 60 }];
}

function computeFixedSchedule(
  baseUtc: DateTime,
  zone: string,
  schedule: FixedScheduleOptions,
  allowedWeekdays: number[]
): DateTime {
  const { hour, minute } = parseTimeLabel(schedule.sendTime);
  const baseLocal = baseUtc.setZone(zone);
  let candidate = baseLocal.set({ hour, minute, second: 0, millisecond: 0 });

  if (candidate <= baseLocal) {
    candidate = candidate.plus({ days: 1 });
  }

  let attempts = 0;
  while (attempts < MAX_LOOKAHEAD_DAYS) {
    if (allowedWeekdays.length === 0 || allowedWeekdays.includes(candidate.weekday)) {
      return candidate.toUTC();
    }
    candidate = candidate.plus({ days: 1 });
    attempts += 1;
  }

  return candidate.toUTC();
}

function computeWindowModeSchedule(
  baseUtc: DateTime,
  zone: string,
  schedule: WindowScheduleOptions,
  allowedWeekdays: number[],
  random: () => number
): DateTime {
  const windows = resolveWindowModeWindows(schedule);
  const baseLocal = baseUtc.setZone(zone);

  for (let dayOffset = 0; dayOffset < MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const dayStart = baseLocal.plus({ days: dayOffset }).startOf('day');
    const isSameDay = dayOffset === 0;
    if (allowedWeekdays.length > 0 && !allowedWeekdays.includes(dayStart.weekday)) {
      continue;
    }

    for (const window of windows) {
      const start = dayStart.plus({ minutes: window.startMinutes });
      const end = dayStart.plus({ minutes: window.endMinutes });
      if (end <= start) {
        continue;
      }

      const effectiveStart = isSameDay && baseLocal > start ? baseLocal : start;
      if (effectiveStart < end) {
        const durationMs = end.diff(effectiveStart, 'milliseconds').milliseconds;
        const clampRandom = Math.min(Math.max(random(), 0), 0.9999999999);
        const scheduledLocal = effectiveStart.plus({ milliseconds: durationMs * clampRandom });
        return scheduledLocal.toUTC();
      }
    }
  }

  const fallbackWindow = windows[0] ?? { startMinutes: 9 * 60, endMinutes: 17 * 60 };
  const fallbackDay = baseLocal.plus({ days: 1 }).startOf('day');
  return fallbackDay.plus({ minutes: fallbackWindow.startMinutes }).toUTC();
}

function computeImmediateSchedule(
  baseUtc: DateTime,
  zone: string,
  schedule: ImmediateScheduleOptions,
  allowedWeekdays: number[]
): DateTime {
  const windows = resolveImmediateWindows(schedule);
  const baseLocal = baseUtc.setZone(zone);

  for (let dayOffset = 0; dayOffset < MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const dayStart = baseLocal.plus({ days: dayOffset }).startOf('day');
    const isSameDay = dayOffset === 0;
    if (allowedWeekdays.length > 0 && !allowedWeekdays.includes(dayStart.weekday)) {
      continue;
    }

    for (const window of windows) {
      const start = dayStart.plus({ minutes: window.startMinutes });
      const end = dayStart.plus({ minutes: window.endMinutes });
      if (end <= start) {
        continue;
      }

      const candidate = isSameDay && baseLocal > start ? baseLocal : start;
      if (candidate < end) {
        return candidate.toUTC();
      }
    }
  }

  return baseLocal.plus({ days: 1 }).toUTC();
}

export function computeScheduledUtc(input: ScheduleComputationInput): Date {
  const { now, stepDelayHours, contactTimezone, fallbackTimezone, schedule } = input;
  const random = input.random ?? Math.random;

  const baseUtc = applyStepDelay(now, stepDelayHours);
  const fallbackZone = schedule.timezone ?? fallbackTimezone ?? DEFAULT_ZONE;
  const zone = schedule.respectContactTimezone
    ? resolveZone(contactTimezone, fallbackZone)
    : resolveZone(schedule.timezone, fallbackTimezone);

  const allowedWeekdays = normaliseDays(schedule.sendDays);

  if (schedule.mode === 'fixed') {
    const scheduled = computeFixedSchedule(baseUtc, zone, schedule, allowedWeekdays);
    return scheduled.toJSDate();
  }

  if (schedule.mode === 'window') {
    const scheduled = computeWindowModeSchedule(baseUtc, zone, schedule, allowedWeekdays, random);
    return scheduled.toJSDate();
  }

  const scheduled = computeImmediateSchedule(baseUtc, zone, schedule, allowedWeekdays);
  return scheduled.toJSDate();
}

export function formatTimeRangePreview(schedule: SequenceScheduleOptions, fallbackZone: string): string {
  const zone = resolveZone(schedule.timezone, fallbackZone);

  if (schedule.mode === 'fixed') {
    const { hour, minute } = parseTimeLabel(schedule.sendTime);
    const sample = DateTime.now().setZone(zone).set({ hour, minute, second: 0, millisecond: 0 });
    return sample.toFormat('h:mm a');
  }

  if (schedule.mode === 'window') {
    const windows = resolveWindowModeWindows(schedule);
    const first = windows[0];
    if (!first) {
      return 'Daily window';
    }
    const start = DateTime.now().setZone(zone).startOf('day').plus({ minutes: first.startMinutes });
    const end = DateTime.now().setZone(zone).startOf('day').plus({ minutes: first.endMinutes });
    return `${start.toFormat('h:mm a')} – ${end.toFormat('h:mm a')}`;
  }

  const windows = resolveImmediateWindows(schedule);
  const first = windows[0];
  if (!first || (first.startMinutes === 0 && first.endMinutes === 24 * 60)) {
    return 'Any time';
  }
  const start = DateTime.now().setZone(zone).startOf('day').plus({ minutes: first.startMinutes });
  const end = DateTime.now().setZone(zone).startOf('day').plus({ minutes: first.endMinutes });
  return `${start.toFormat('h:mm a')} – ${end.toFormat('h:mm a')}`;
}
