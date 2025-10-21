import type { SequenceDeliveryStatus } from './schema';

export type RawSequenceRow = {
  id: string;
  contactId: string;
  status: SequenceDeliveryStatus | null;
  lastUpdated: Date | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  attempts: number | null;
  replyAt: Date | null;
  bounceAt: Date | null;
  skippedAt: Date | null;
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
};

export type SequenceStatusSummary = {
  total: number;
  pending: number;
  sent: number;
  replied: number;
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

export function aggregateSequenceRows(rows: RawSequenceRow[]) {
  const summary: SequenceStatusSummary = {
    total: rows.length,
    pending: 0,
    sent: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    skipped: 0,
    lastActivity: null
  };

  for (const row of rows) {
    if (row.status === 'pending') summary.pending += 1;
    else if (row.status === 'sent') summary.sent += 1;
    else if (row.status === 'failed') summary.failed += 1;

    const isReplied = row.status === 'replied' || row.replyAt != null;
    const isBounced = row.status === 'bounced' || row.bounceAt != null;
    const isSkipped = row.status === 'skipped' || row.skippedAt != null;

    if (isReplied) summary.replied += 1;
    if (isBounced) summary.bounced += 1;
    if (isSkipped) summary.skipped += 1;

    if (!summary.lastActivity || (row.lastUpdated && row.lastUpdated > summary.lastActivity)) {
      summary.lastActivity = row.lastUpdated ?? summary.lastActivity;
    }
  }

  const stepMap = new Map<string | null, StepSummary>();
  for (const row of rows) {
    const key = row.stepId ?? '__no_step__';
    const existing = stepMap.get(key) || {
      stepId: row.stepId ?? null,
      order: row.stepOrder ?? null,
      subject: row.stepSubject ?? null,
      pending: 0,
      sent: 0,
      replied: 0,
      bounced: 0,
      failed: 0,
      skipped: 0
    };

    if (row.status === 'pending') existing.pending += 1;
    else if (row.status === 'sent') existing.sent += 1;
    else if (row.status === 'failed') existing.failed += 1;

    const isReplied = row.status === 'replied' || row.replyAt != null;
    const isBounced = row.status === 'bounced' || row.bounceAt != null;
    const isSkipped = row.status === 'skipped' || row.skippedAt != null;

    if (isReplied) existing.replied += 1;
    if (isBounced) existing.bounced += 1;
    if (isSkipped) existing.skipped += 1;

    stepMap.set(key, existing);
  }

  const steps = Array.from(stepMap.values()).sort((a, b) => {
    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return (a.stepId ?? '').localeCompare(b.stepId ?? '');
  });

  const contacts = rows.map((row) => ({
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
    scheduleMode: row.scheduleMode ?? null,
    scheduleSendTime: row.scheduleSendTime ?? null,
    scheduleWindowStart: row.scheduleWindowStart ?? null,
    scheduleWindowEnd: row.scheduleWindowEnd ?? null,
    scheduleRespectTimezone: row.scheduleRespectTimezone ?? true,
    scheduleFallbackTimezone: row.scheduleFallbackTimezone ?? null
  }));

  return { summary, steps, contacts };
}
