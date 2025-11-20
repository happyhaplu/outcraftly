import type {
  SequenceSchedulePreferences,
  SequenceSentPerStep,
  SequenceStepSendSummary,
  SequenceSummary,
  SequenceTrackingSettings
} from '@/app/(dashboard)/sequences/types';

const _VALID_STOP_CONDITIONS = ['manual', 'on_reply', 'on_reply_or_bounce'] as const;
const _VALID_STATUS = ['draft', 'active', 'paused'] as const;

type StopConditionValue = (typeof _VALID_STOP_CONDITIONS)[number];

type RawSequenceSender = {
  id?: number | string;
  name?: unknown;
  email?: unknown;
  status?: unknown;
} | null;

type RawSequenceSchedule = {
  mode?: unknown;
  sendTime?: unknown;
  sendWindowStart?: unknown;
  sendWindowEnd?: unknown;
  respectContactTimezone?: unknown;
  fallbackTimezone?: unknown;
  timezone?: unknown;
  sendDays?: unknown;
  sendWindows?: unknown;
} | null;

type RawSequence = Record<string, unknown> & {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  launchAt?: unknown;
  launchedAt?: unknown;
  senderId?: unknown;
  sender?: RawSequenceSender;
  stepCount?: unknown;
  tracking?: Partial<SequenceTrackingSettings> | null;
  trackOpens?: unknown;
  trackClicks?: unknown;
  enableUnsubscribe?: unknown;
  schedule?: RawSequenceSchedule;
  scheduleMode?: unknown;
  scheduleSendTime?: unknown;
  scheduleWindowStart?: unknown;
  scheduleWindowEnd?: unknown;
  scheduleRespectTimezone?: unknown;
  scheduleFallbackTimezone?: unknown;
  scheduleTimezone?: unknown;
  scheduleSendDays?: unknown;
  scheduleSendWindows?: unknown;
  stopCondition?: unknown;
  stopOnBounce?: unknown;
  minGapMinutes?: unknown;
  replyCount?: unknown;
  reply_count?: unknown;
  sentPerStep?: unknown;
  sent_per_step?: unknown;
  stepSendSummary?: unknown;
  step_send_summary?: unknown;
  steps?: unknown;
  deletedAt?: unknown;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
};

const sanitizeSentPerStepMap = (raw: unknown, onAnomaly: () => void): SequenceSentPerStep => {
  const result: SequenceSentPerStep = {};
  if (!raw || typeof raw !== 'object') {
    return result;
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      onAnomaly();
      continue;
    }

    if (isFiniteNumber(value) && value >= 0) {
      result[key] = value;
    } else if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        result[key] = parsed;
      } else {
        onAnomaly();
      }
    } else {
      onAnomaly();
    }
  }

  return result;
};

const sanitizeStepSummaries = (raw: unknown, onAnomaly: () => void): SequenceStepSendSummary[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const summaries: SequenceStepSendSummary[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      onAnomaly();
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const idValue = typeof candidate.id === 'string' && candidate.id.trim().length > 0
      ? candidate.id
      : typeof candidate.stepId === 'string' && candidate.stepId.trim().length > 0
        ? candidate.stepId
        : null;

    if (!idValue || seen.has(idValue)) {
      onAnomaly();
      continue;
    }

    const rawOrder = candidate.order ?? candidate.stepOrder;
    const order = isFiniteNumber(rawOrder) ? rawOrder : null;
    if (rawOrder != null && order == null) {
      onAnomaly();
    }

    const subjectValue = candidate.subject ?? candidate.stepSubject;
    const subject = typeof subjectValue === 'string' ? subjectValue : null;
    if (subjectValue != null && subject == null) {
      onAnomaly();
    }

    const rawSent = candidate.sent ?? candidate.count ?? candidate.sentCount;
    let sent = 0;
    if (rawSent == null) {
      sent = 0;
    } else if (isFiniteNumber(rawSent) && rawSent >= 0) {
      sent = rawSent;
    } else if (typeof rawSent === 'string') {
      const parsed = Number(rawSent);
      if (Number.isFinite(parsed) && parsed >= 0) {
        sent = parsed;
      } else {
        onAnomaly();
      }
    } else {
      onAnomaly();
    }

    summaries.push({
      id: idValue,
      order,
      subject,
      sent
    });
    seen.add(idValue);
  }

  return summaries;
};

const compareStepSummaries = (a: SequenceStepSendSummary, b: SequenceStepSendSummary) => {
  const orderA = a.order ?? Number.POSITIVE_INFINITY;
  const orderB = b.order ?? Number.POSITIVE_INFINITY;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return a.id.localeCompare(b.id);
};

const normalizeLifecycleStatus = (status: unknown, onAnomaly: () => void): SequenceSummary['status'] => {
  if (status === 'paused' || status === 'draft' || status === 'active') {
    return status;
  }
  onAnomaly();
  return 'active';
};

const normalizeStopCondition = (value: unknown, onAnomaly: () => void): StopConditionValue => {
  if (value === 'manual' || value === 'on_reply' || value === 'on_reply_or_bounce') {
    return value;
  }
  if (value != null) {
    onAnomaly();
  }
  return 'on_reply';
};

const normalizeSchedule = (raw: RawSequence, onAnomaly: () => void): SequenceSchedulePreferences => {
  const baseMode = (raw.schedule && (raw.schedule as RawSequenceSchedule)?.mode) ?? raw.scheduleMode;
  const mode = baseMode === 'fixed' || baseMode === 'window' ? baseMode : 'immediate';
  if (baseMode != null && baseMode !== mode) {
    onAnomaly();
  }

  const schedule: SequenceSchedulePreferences = {
    mode,
    sendTime: mode === 'fixed'
      ? (typeof ((raw.schedule as RawSequenceSchedule)?.sendTime ?? raw.scheduleSendTime) === 'string'
        ? ((raw.schedule as RawSequenceSchedule)?.sendTime ?? raw.scheduleSendTime) as string
        : null)
      : null,
    sendWindowStart: mode === 'window'
      ? (typeof ((raw.schedule as RawSequenceSchedule)?.sendWindowStart ?? raw.scheduleWindowStart) === 'string'
        ? ((raw.schedule as RawSequenceSchedule)?.sendWindowStart ?? raw.scheduleWindowStart) as string
        : null)
      : null,
    sendWindowEnd: mode === 'window'
      ? (typeof ((raw.schedule as RawSequenceSchedule)?.sendWindowEnd ?? raw.scheduleWindowEnd) === 'string'
        ? ((raw.schedule as RawSequenceSchedule)?.sendWindowEnd ?? raw.scheduleWindowEnd) as string
        : null)
      : null,
    respectContactTimezone: ((raw.schedule as RawSequenceSchedule)?.respectContactTimezone ?? raw.scheduleRespectTimezone) !== false,
    fallbackTimezone: typeof ((raw.schedule as RawSequenceSchedule)?.fallbackTimezone ?? raw.scheduleFallbackTimezone) === 'string'
      ? (((raw.schedule as RawSequenceSchedule)?.fallbackTimezone ?? raw.scheduleFallbackTimezone) as string)
      : null,
    timezone: typeof ((raw.schedule as RawSequenceSchedule)?.timezone ?? raw.scheduleTimezone) === 'string'
      ? (((raw.schedule as RawSequenceSchedule)?.timezone ?? raw.scheduleTimezone) as string)
      : null
  };

  const sendDaysCandidate = (raw.schedule as RawSequenceSchedule)?.sendDays ?? raw.scheduleSendDays;
  if (Array.isArray(sendDaysCandidate)) {
    schedule.sendDays = sendDaysCandidate
      .map((day) => (typeof day === 'string' ? day.trim() : ''))
      .filter((day) => day.length > 0);
  } else {
    schedule.sendDays = null;
  }

  const sendWindowsCandidate = (raw.schedule as RawSequenceSchedule)?.sendWindows ?? raw.scheduleSendWindows;
  if (Array.isArray(sendWindowsCandidate)) {
    const windows = sendWindowsCandidate
      .map((window) => {
        if (!window || typeof window !== 'object') {
          onAnomaly();
          return null;
        }

        const candidate = window as { start?: unknown; end?: unknown };
        const start = typeof candidate.start === 'string' ? candidate.start.trim() : '';
        const end = typeof candidate.end === 'string' ? candidate.end.trim() : '';
        if (!start || !end) {
          onAnomaly();
          return null;
        }
        return { start, end };
      })
      .filter((value): value is { start: string; end: string } => value !== null);
    schedule.sendWindows = windows.length > 0 ? windows : null;
  } else {
    schedule.sendWindows = null;
  }

  return schedule;
};

const normalizeTracking = (raw: RawSequence): SequenceTrackingSettings => {
  const tracking = raw.tracking ?? {};
  return {
    trackOpens: (tracking?.trackOpens ?? raw.trackOpens) !== false,
    trackClicks: (tracking?.trackClicks ?? raw.trackClicks) !== false,
    enableUnsubscribe: (tracking?.enableUnsubscribe ?? raw.enableUnsubscribe) !== false
  };
};

const normalizeSender = (sender: RawSequenceSender, onAnomaly: () => void) => {
  if (!sender || typeof sender !== 'object') {
    return null;
  }

  const idValue = (sender as { id?: number | string }).id;
  const id = typeof idValue === 'number' && Number.isFinite(idValue)
    ? idValue
    : typeof idValue === 'string' && idValue.trim().length > 0
      ? Number(idValue)
      : null;

  if (id == null) {
    onAnomaly();
    return null;
  }

  const name = typeof sender.name === 'string' && sender.name.trim().length > 0 ? sender.name : 'Unknown sender';
  const email = typeof sender.email === 'string' ? sender.email : '';
  const status = typeof sender.status === 'string' ? sender.status : 'inactive';

  return { id, name, email, status };
};

const mergeStepSummaries = (base: SequenceStepSendSummary[], sentPerStep: SequenceSentPerStep): SequenceStepSendSummary[] => {
  const merged: SequenceStepSendSummary[] = [];
  const seen = new Map<string, SequenceStepSendSummary>();

  for (const entry of base) {
    if (!entry || typeof entry.id !== 'string' || entry.id.trim().length === 0) {
      continue;
    }
    const sanitized: SequenceStepSendSummary = {
      id: entry.id,
      order: typeof entry.order === 'number' && Number.isFinite(entry.order) ? entry.order : null,
      subject: typeof entry.subject === 'string' ? entry.subject : null,
      sent: isFiniteNumber(entry.sent) && entry.sent >= 0 ? entry.sent : 0
    };
    seen.set(sanitized.id, sanitized);
    merged.push(sanitized);
  }

  for (const fallback of normalizeSentPerStep(sentPerStep)) {
    const existing = seen.get(fallback.id);
    if (existing) {
      existing.sent = fallback.sent;
      continue;
    }
    merged.push(fallback);
    seen.set(fallback.id, fallback);
  }

  return merged.sort(compareStepSummaries);
};

export const normalizeSentPerStep = (sentPerStep: Record<string, number>): SequenceStepSendSummary[] =>
  Object.entries(sentPerStep)
    .filter(([key, value]) => typeof key === 'string' && key.trim().length > 0 && isFiniteNumber(value) && value >= 0)
    .map(([id, count]) => ({ id, order: null, subject: null, sent: count }))
    .sort((a, b) => a.id.localeCompare(b.id));

export const normalizeStepSendSummary = (sequence: SequenceSummary): SequenceStepSendSummary[] =>
  mergeStepSummaries(sequence.stepSendSummary, sequence.sentPerStep);

export const mapSequenceSummary = (rawSequence: RawSequence): SequenceSummary => {
  let hasMissingMetadata = false;
  const markAnomaly = () => {
    hasMissingMetadata = true;
  };

  const idCandidate = rawSequence.id;
  const id = isNonEmptyString(idCandidate) ? idCandidate : String(idCandidate ?? '');
  if (!id) {
    markAnomaly();
  }

  const nameCandidate = rawSequence.name;
  const name = isNonEmptyString(nameCandidate) ? nameCandidate : 'Untitled sequence';
  if (!isNonEmptyString(nameCandidate)) {
    markAnomaly();
  }

  const status = normalizeLifecycleStatus(rawSequence.status, markAnomaly);

  const createdAt = toIsoString(rawSequence.createdAt);
  if (!createdAt) {
    markAnomaly();
  }

  const updatedAt = toIsoString(rawSequence.updatedAt);
  if (!updatedAt) {
    markAnomaly();
  }

  const launchAt = toIsoString(rawSequence.launchAt);
  const launchedAt = toIsoString(rawSequence.launchedAt);
  const deletedAt = toIsoString(rawSequence.deletedAt);

  const senderIdCandidate = rawSequence.senderId;
  const senderId = isFiniteNumber(senderIdCandidate) ? senderIdCandidate : null;
  if (senderIdCandidate != null && senderId == null) {
    markAnomaly();
  }

  const sender = normalizeSender(rawSequence.sender ?? null, markAnomaly);

  const stepCountCandidate = rawSequence.stepCount;
  const stepCount = isFiniteNumber(stepCountCandidate) ? stepCountCandidate : Number(stepCountCandidate);
  const normalizedStepCount = Number.isFinite(stepCount) ? Number(stepCount) : 0;
  if (!Number.isFinite(stepCount)) {
    markAnomaly();
  }

  const tracking = normalizeTracking(rawSequence);
  const schedule = normalizeSchedule(rawSequence, markAnomaly);
  const stopCondition = normalizeStopCondition(rawSequence.stopCondition, markAnomaly);
  const stopOnBounce = Boolean(rawSequence.stopOnBounce);

  const minGapCandidate = rawSequence.minGapMinutes;
  let minGapMinutes: number | null = null;
  if (minGapCandidate == null) {
    minGapMinutes = null;
  } else if (isFiniteNumber(minGapCandidate)) {
    minGapMinutes = Math.max(0, Math.trunc(minGapCandidate));
  } else if (typeof minGapCandidate === 'string') {
    const parsed = Number(minGapCandidate);
    if (Number.isFinite(parsed)) {
      minGapMinutes = Math.max(0, Math.trunc(parsed));
    } else {
      markAnomaly();
      minGapMinutes = null;
    }
  } else {
    markAnomaly();
    minGapMinutes = null;
  }

  const rawReplyCount = (rawSequence.replyCount ?? rawSequence.reply_count) as unknown;
  // replyCount intentionally stays null when upstream metrics are unavailable; callers rely on
  // hasMissingMetadata to detect this state rather than assuming a zero baseline.
  let replyCount: number | null = null;
  if (rawReplyCount == null) {
    hasMissingMetadata = true;
    replyCount = null;
  } else if (isFiniteNumber(rawReplyCount) && rawReplyCount >= 0) {
    replyCount = Math.round(rawReplyCount);
  } else if (typeof rawReplyCount === 'string') {
    const parsed = Number(rawReplyCount);
    if (Number.isFinite(parsed) && parsed >= 0) {
      replyCount = Math.round(parsed);
    } else {
      markAnomaly();
      replyCount = null;
    }
  } else {
    markAnomaly();
    replyCount = null;
  }

  const sentPerStep = sanitizeSentPerStepMap(rawSequence.sentPerStep ?? rawSequence.sent_per_step, markAnomaly);
  const baseStepSummaries = sanitizeStepSummaries(
    rawSequence.stepSendSummary ?? rawSequence.step_send_summary ?? rawSequence.steps,
    markAnomaly
  );

  const summary: SequenceSummary = {
    id,
    name,
    status,
    createdAt,
    updatedAt,
    launchAt,
    launchedAt,
    deletedAt,
    senderId,
    sender,
    stepCount: normalizedStepCount,
    tracking,
    schedule,
    stopCondition,
    stopOnBounce,
    minGapMinutes,
    replyCount,
    sentPerStep,
    stepSendSummary: baseStepSummaries,
    hasMissingMetadata: false
  };

  summary.stepSendSummary = normalizeStepSendSummary(summary);
  summary.hasMissingMetadata = hasMissingMetadata;

  return summary;
};

export type { RawSequence };
