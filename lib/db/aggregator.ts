import type { SequenceDeliveryStatus } from './schema';

export type RawSequenceRow = {
  id: string;
  sequenceId: string;
  contactId: string;
  status: SequenceDeliveryStatus | null;
  lastUpdated: Date | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  attempts: number | null;
  replyAt: Date | null;
  bounceAt: Date | null;
  skippedAt: Date | null;
  lastThrottleAt: Date | null;
  stepOrder: number | null;
  stepSubject: string | null;
  stepId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  timezone: string | null;
  scheduleMode: 'fixed' | 'window' | null;
  scheduleSendTime: string | null;
  scheduleWindowStart: string | null;
  scheduleWindowEnd: string | null;
  scheduleRespectTimezone: boolean | null;
  scheduleFallbackTimezone: string | null;
  scheduleTimezone: string | null;
  scheduleSendDays: string[] | null;
  scheduleSendWindows: Array<{ start: string; end: string }> | null;
  manualTriggeredAt: Date | null;
  manualSentAt: Date | null;
  hasReplyLog?: boolean;
};

export type SequenceStatusSummary = {
  total: number;
  pending: number;
  sent: number;
  replied: number;
  replyCount: number;
  bounced: number;
  failed: number;
  skipped: number;
  lastActivity: Date | null;
};

export type StepSummary = {
  stepId: string | null;
  order: number | null;
  subject: string | null;
  pending: number;
  sent: number;
  replied: number;
  bounced: number;
  failed: number;
  skipped: number;
};

export type SequenceStepDefinition = {
  id: string;
  order: number | null;
  subject: string | null;
};

export type AggregateSequenceOptions = {
  steps?: SequenceStepDefinition[];
  sentPerStep?: Record<string, number>;
  sequenceId?: string | null;
};

const NO_STEP_KEY = '__no_step__';

function createEmptyStepSummary(stepId: string | null, order: number | null, subject: string | null): StepSummary {
  return {
    stepId,
    order,
    subject,
    pending: 0,
    sent: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    skipped: 0
  };
}

export function aggregateSequenceRows(rows: RawSequenceRow[], options: AggregateSequenceOptions = {}) {
  const shouldDebug = process.env.NODE_ENV !== 'production';

  const explicitSequenceId = typeof options.sequenceId === 'string' && options.sequenceId.length > 0 ? options.sequenceId : null;
  const inferredSequenceId = !explicitSequenceId && rows.length > 0 ? rows[0]?.sequenceId ?? null : null;
  const targetSequenceId = explicitSequenceId ?? inferredSequenceId;
  const scopedRows =
    targetSequenceId == null
      ? rows
      : rows.filter((row) => typeof row.sequenceId === 'string' && row.sequenceId === targetSequenceId);

  if (shouldDebug) {
    try {
      console.groupCollapsed?.('[SequenceAggregator] inputs', {
        rowCount: rows.length,
        scopedRowCount: scopedRows.length,
        sentPerStepKeys: Object.keys(options.sentPerStep ?? {}),
        stepDefinitions: (options.steps ?? []).map((step) => step.id),
        sequenceIdFilter: targetSequenceId,
        filteredOut: rows.length - scopedRows.length
      });
      const replyFlagged = scopedRows.filter((row) => row.status === 'replied' || row.replyAt || row.hasReplyLog);
      console.log?.('[SequenceAggregator] reply-marked sample', replyFlagged.slice(0, 3).map((row) => ({
        id: row.id,
        contactId: row.contactId,
        status: row.status,
        replyAt: row.replyAt,
        hasReplyLog: Boolean(row.hasReplyLog)
      })));
      console.groupEnd?.();
    } catch (error) {
      console.warn?.('[SequenceAggregator] failed to log inputs', error);
    }
  }
  const normalizedSentCounts = new Map<string, number>();
  if (options.sentPerStep) {
    for (const [stepId, value] of Object.entries(options.sentPerStep)) {
      if (typeof stepId === 'string' && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        normalizedSentCounts.set(stepId, value);
      }
    }
  }

  const summary: SequenceStatusSummary = {
    total: scopedRows.length,
    pending: 0,
    sent: 0,
    replied: 0,
    replyCount: 0,
    bounced: 0,
    failed: 0,
    skipped: 0,
    lastActivity: null
  };

  const uniqueReplyContacts = new Set<string>();

  const getReplyContactKey = (row: RawSequenceRow) => {
    if (typeof row.contactId === 'string' && row.contactId.length > 0) {
      return row.contactId;
    }
    return row.id;
  };

  for (const row of scopedRows) {
    if (row.status === 'pending') summary.pending += 1;
    else if (row.status === 'sent') summary.sent += 1;
    else if (row.status === 'failed') summary.failed += 1;

    const hasReplyLog = Boolean(row.hasReplyLog);
    const isReplied = row.status === 'replied' || row.replyAt != null;
    const isBounced = row.status === 'bounced' || row.bounceAt != null;
    const isSkipped = row.status === 'skipped' || row.skippedAt != null;

    if (isReplied) summary.replied += 1;
    if (isReplied || hasReplyLog) {
      uniqueReplyContacts.add(getReplyContactKey(row));
    }
    if (isBounced) summary.bounced += 1;
    if (isSkipped) summary.skipped += 1;

    const activityCandidates: Array<Date | null | undefined> = [
      row.replyAt,
      row.sentAt,
      row.manualSentAt,
      row.manualTriggeredAt,
      row.bounceAt,
      row.skippedAt,
      row.lastUpdated
    ];

    for (const candidate of activityCandidates) {
      if (!candidate) {
        continue;
      }
      if (!summary.lastActivity || candidate > summary.lastActivity) {
        summary.lastActivity = candidate;
      }
    }
  }

  const uniqueReplyContactsList = Array.from(uniqueReplyContacts);
  summary.replyCount = uniqueReplyContactsList.length;

  const stepMap = new Map<string, StepSummary>();

  for (const step of options.steps ?? []) {
    if (typeof step?.id === 'string' && step.id.length > 0 && !stepMap.has(step.id)) {
      stepMap.set(step.id, createEmptyStepSummary(step.id, step.order ?? null, step.subject ?? null));
    }
  }

  for (const row of scopedRows) {
    const key = row.stepId ?? NO_STEP_KEY;
    const existing = stepMap.get(key) ?? createEmptyStepSummary(row.stepId ?? null, row.stepOrder ?? null, row.stepSubject ?? null);

    if (row.status === 'pending') existing.pending += 1;
    else if (row.status === 'sent') existing.sent += 1;
    else if (row.status === 'failed') existing.failed += 1;

    const hasReplyLog = Boolean(row.hasReplyLog);
    const isReplied = row.status === 'replied' || row.replyAt != null;
    const isBounced = row.status === 'bounced' || row.bounceAt != null;
    const isSkipped = row.status === 'skipped' || row.skippedAt != null;

    if (isReplied) existing.replied += 1;
    if (!isReplied && hasReplyLog) {
      existing.replied += 1;
    }
    if (isBounced) existing.bounced += 1;
    if (isSkipped) existing.skipped += 1;

    stepMap.set(key, existing);
  }

  const sentPerStepEntries: [string, number][] = [];
  for (const [stepId, count] of normalizedSentCounts.entries()) {
    if (!stepId) {
      continue;
    }
    const target = (() => {
      let summaryForStep = stepMap.get(stepId);
      if (!summaryForStep) {
        const fallback = options.steps?.find((step) => step.id === stepId);
        summaryForStep = createEmptyStepSummary(stepId, fallback?.order ?? null, fallback?.subject ?? null);
        stepMap.set(stepId, summaryForStep);
      }
      return summaryForStep;
    })();
    target.sent = count;
    sentPerStepEntries.push([stepId, count]);
  }

  const steps = Array.from(stepMap.entries())
    .sort(([keyA, summaryA], [keyB, summaryB]) => {
      if (keyA === NO_STEP_KEY && keyB !== NO_STEP_KEY) {
        return 1;
      }
      if (keyB === NO_STEP_KEY && keyA !== NO_STEP_KEY) {
        return -1;
      }

      const orderA = summaryA.order ?? Number.POSITIVE_INFINITY;
      const orderB = summaryB.order ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (summaryA.stepId ?? '').localeCompare(summaryB.stepId ?? '');
    })
    .map(([, value]) => value);

  const contacts = scopedRows.map((row) => ({
    id: row.id,
    contactId: row.contactId,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    email: row.email,
    company: row.company ?? null,
    timezone: row.timezone ?? null,
    status: (row.status ?? 'pending') as SequenceDeliveryStatus,
    lastUpdated: row.lastUpdated ?? new Date(0),
    stepOrder: row.stepOrder ?? null,
    stepSubject: row.stepSubject ?? null,
    stepId: row.stepId ?? null,
    scheduledAt: row.scheduledAt ?? null,
    sentAt: row.sentAt ?? null,
    attempts: row.attempts ?? 0,
    replyAt: row.replyAt ?? null,
    bounceAt: row.bounceAt ?? null,
    skippedAt: row.skippedAt ?? null,
    lastThrottleAt: row.lastThrottleAt ?? null,
    scheduleMode: row.scheduleMode ?? null,
    scheduleSendTime: row.scheduleSendTime ?? null,
    scheduleWindowStart: row.scheduleWindowStart ?? null,
    scheduleWindowEnd: row.scheduleWindowEnd ?? null,
    scheduleRespectTimezone: row.scheduleRespectTimezone ?? true,
    scheduleFallbackTimezone: row.scheduleFallbackTimezone ?? null,
    scheduleTimezone: row.scheduleTimezone ?? null,
    scheduleSendDays: Array.isArray(row.scheduleSendDays) ? row.scheduleSendDays : null,
    scheduleSendWindows: Array.isArray(row.scheduleSendWindows) ? row.scheduleSendWindows : null,
    manualTriggeredAt: row.manualTriggeredAt ?? null,
    manualSentAt: row.manualSentAt ?? null
  }));

  const sentPerStep = Object.fromEntries(sentPerStepEntries);

  if (shouldDebug) {
    try {
      console.groupCollapsed?.('[SequenceAggregator] computed summary', {
        replyCount: summary.replyCount,
        replied: summary.replied,
        uniqueReplyContacts: uniqueReplyContactsList,
        uniqueReplyCount: uniqueReplyContactsList.length
      });
      console.log?.('stepBreakdown', Array.from(stepMap.entries()).map(([key, value]) => ({
        key,
        replied: value.replied,
        pending: value.pending,
        sent: value.sent
      })));
      console.groupEnd?.();
    } catch (error) {
      console.warn?.('[SequenceAggregator] failed to log summary', error);
    }
  }

  return {
    summary,
    steps,
    contacts,
    sentPerStep,
    uniqueReplyContacts: uniqueReplyContactsList,
    uniqueReplyCount: uniqueReplyContactsList.length
  };
}
