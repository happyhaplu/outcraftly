import { NextResponse } from 'next/server';

import {
  getSequenceStatusForTeam,
  getTeamForUser,
  getActiveUser,
  syncSequenceRepliesFromLogs,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { sequenceIdSchema } from '@/lib/validation/sequence';
import { mapSequenceSummary, type RawSequence } from '@/lib/sequences/utils';

export const runtime = 'nodejs';

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const SUMMARY_FIELDS = ['total', 'pending', 'sent', 'replied', 'replyCount', 'bounced', 'failed', 'skipped', 'lastActivity'] as const;
type SummaryField = (typeof SUMMARY_FIELDS)[number];

const ensureNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export async function GET(_request: Request, context: any) {
  const rawParams = (await context?.params) ?? {};
  const params = rawParams as { id?: string };

  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const parsed = sequenceIdSchema.safeParse({ id: params.id });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

  await syncSequenceRepliesFromLogs(parsed.data.id);

  const result = await getSequenceStatusForTeam(team.id, parsed.data.id);
    if (!result) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    const anomalyProbe = mapSequenceSummary({
      id: result.sequence.id,
      name: result.sequence.name,
      status: result.sequence.status,
      createdAt: result.sequence.createdAt,
      updatedAt: result.sequence.updatedAt,
      launchAt: result.sequence.launchAt,
      launchedAt: result.sequence.launchedAt,
      deletedAt: result.sequence.deletedAt,
      senderId: result.sequence.senderId,
      sender: result.sequence.sender,
      minGapMinutes: result.sequence.minGapMinutes,
      replyCount: result.summary.replyCount,
      stepCount: result.steps.length,
      sentPerStep: result.sentPerStep
    } as RawSequence);

    const numericSummary = {
      total: ensureNumber(result.summary.total),
      pending: ensureNumber(result.summary.pending),
      sent: ensureNumber(result.summary.sent),
      replied: ensureNumber(result.summary.replied),
      replyCount: ensureNumber(result.summary.replyCount),
      bounced: ensureNumber(result.summary.bounced),
      failed: ensureNumber(result.summary.failed),
      skipped: ensureNumber(result.summary.skipped)
    };
    const normalizedSummary = {
      ...numericSummary,
      lastActivity: toIsoString(result.summary.lastActivity)
    } satisfies Record<SummaryField, number | string | null>;

    const summaryKeys = [...SUMMARY_FIELDS];
    const uniqueReplyContacts = Array.isArray(result.uniqueReplyContacts)
      ? result.uniqueReplyContacts.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [];
    const uniqueReplyCount =
      typeof result.uniqueReplyCount === 'number' && Number.isFinite(result.uniqueReplyCount)
        ? result.uniqueReplyCount
        : uniqueReplyContacts.length;
    const uniqueReplyContactsSample = uniqueReplyContacts.slice(0, 3);

    const payload = {
      sequence: {
        id: result.sequence.id,
        name: result.sequence.name,
        status: result.sequence.status,
        launchAt: toIsoString(result.sequence.launchAt),
        launchedAt: toIsoString(result.sequence.launchedAt),
        senderId: result.sequence.senderId,
        sender: result.sequence.sender
          ? {
              id: result.sequence.sender.id,
              name: result.sequence.sender.name,
              email: result.sequence.sender.email,
              status: result.sequence.sender.status
            }
          : null,
        createdAt: toIsoString(result.sequence.createdAt),
        updatedAt: toIsoString(result.sequence.updatedAt),
        minGapMinutes: result.sequence.minGapMinutes,
        hasMissingMetadata: anomalyProbe.hasMissingMetadata
      },
      summary: normalizedSummary,
      summaryKeys,
      contacts: result.contacts.map((contact) => ({
        id: contact.id,
        contactId: contact.contactId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        company: contact.company,
        timezone: contact.timezone,
        status: contact.status,
        lastUpdated: toIsoString(contact.lastUpdated),
        stepOrder: contact.stepOrder,
        stepSubject: contact.stepSubject,
        scheduledAt: toIsoString(contact.scheduledAt),
        sentAt: toIsoString(contact.sentAt),
        attempts: contact.attempts,
        replyAt: toIsoString(contact.replyAt),
        bounceAt: toIsoString(contact.bounceAt),
        skippedAt: toIsoString(contact.skippedAt),
        lastThrottleAt: toIsoString(contact.lastThrottleAt),
        scheduleMode: contact.scheduleMode,
        scheduleSendTime: contact.scheduleSendTime,
        scheduleWindowStart: contact.scheduleWindowStart,
        scheduleWindowEnd: contact.scheduleWindowEnd,
        scheduleRespectTimezone: contact.scheduleRespectTimezone,
        scheduleFallbackTimezone: contact.scheduleFallbackTimezone,
        scheduleTimezone: contact.scheduleTimezone,
        scheduleSendDays: Array.isArray(contact.scheduleSendDays) ? contact.scheduleSendDays : null,
        scheduleSendWindows: Array.isArray(contact.scheduleSendWindows) ? contact.scheduleSendWindows : null,
        manualTriggeredAt: toIsoString(contact.manualTriggeredAt),
        manualSentAt: toIsoString(contact.manualSentAt)
      })),
      steps: result.steps.map((s) => ({
        stepId: s.stepId,
        order: s.order,
        subject: s.subject,
        pending: s.pending,
        sent: s.sent,
        replied: s.replied,
        bounced: s.bounced,
        failed: s.failed,
        skipped: s.skipped
      })),
      sentPerStep: result.sentPerStep,
      worker: {
        queueSize: result.worker.queueSize,
        lastRunAt: toIsoString(result.worker.lastRunAt),
        lastFailureAt: toIsoString(result.worker.lastFailureAt),
        lastError: result.worker.lastError,
        minSendIntervalMinutes: result.worker.minSendIntervalMinutes
      },
      meta: {
        summaryKeys,
        payloadHasReplyCount: true,
        aggregatedReplyCount: numericSummary.replyCount,
        repliedCount: numericSummary.replied,
        uniqueReplyContacts,
        uniqueReplyCount,
        uniqueReplyContactsSample
      }
    };

    if (process.env.NODE_ENV !== 'production') {
      try {
        console.groupCollapsed?.('[SequenceStatusAPI] response', {
          sequenceId: result.sequence.id,
          aggregatedReplyCount: numericSummary.replyCount,
          repliedField: numericSummary.replied,
          payloadHasReplyCount: true,
          total: normalizedSummary.total,
          uniqueReplyCount,
          uniqueReplyContactsSample
        });
        console.log?.('summaryKeys', Object.keys(payload.summary ?? {}));
        console.groupEnd?.();
      } catch (error) {
        console.warn?.('[SequenceStatusAPI] failed to log response', error);
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to load sequence status', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
