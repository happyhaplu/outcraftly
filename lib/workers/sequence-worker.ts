import { and, desc, eq, gt, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  activateScheduledSequences,
  assertCanSendEmails,
  trackEmailsSent,
  PlanLimitExceededError,
  syncAllSequenceRepliesForTeam,
  syncSequenceRepliesFromLogs
} from '@/lib/db/queries';
import {
  contacts,
  contactCustomFieldDefinitions,
  contactCustomFieldValues,
  contactSequenceStatus,
  deliveryLogs,
  sequences,
  sequenceSteps,
  senders
} from '@/lib/db/schema';
import { getMinSendIntervalMinutes } from '@/lib/config/pacing';
import { computeScheduledUtc, type SequenceScheduleOptions } from '@/lib/timezone';
import { dispatchSequenceEmail, renderSequenceContent } from '@/lib/mail/sequence-mailer';
import { generateFallbackMessageId, normalizeMessageId } from '@/lib/mail/message-id';
import { decryptSecret, isProbablyEncryptedSecret } from '@/lib/security/encryption';
import { ingestFallbackReplies } from '@/lib/replies/fallback-ingestion';
import { getLogger } from '@/lib/logger';
import { incrementCounter, registerCounter } from '@/lib/metrics';
import { recordHeartbeat } from '@/lib/workers/heartbeat';
import { ResilienceError } from '@/lib/services/resilience';

const MAX_SEND_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 15;
const DELIVERY_SCHEMA_CHECK_CACHE = new WeakSet<DatabaseClient>();

const sendCounter = registerCounter('sequence_emails_sent', {
  name: 'sequence_emails_sent',
  description: 'Total sequence emails sent successfully'
});

const retryCounter = registerCounter('sequence_emails_retried', {
  name: 'sequence_emails_retried',
  description: 'Total sequence email retries attempted'
});

const errorCounter = registerCounter('sequence_emails_errors', {
  name: 'sequence_emails_errors',
  description: 'Total sequence email processing errors'
});

const replyCounter = registerCounter('sequence_replies_detected', {
  name: 'sequence_replies_detected',
  description: 'Total sequence replies detected during worker runs'
});

const normalizeSendError = (error: unknown): { message: string; code?: string } => {
  const extractCode = (code: unknown): string | undefined => {
    if (typeof code !== 'string') {
      return undefined;
    }
    return code;
  };

  if (error instanceof ResilienceError) {
    const rawCode = extractCode(error.code);
    const lowered = rawCode?.toLowerCase();

    if (lowered === 'circuit_open' || lowered === 'retry_exhausted') {
      return { message: 'SMTP outage continues', code: rawCode };
    }

    return { message: error.message || 'SMTP outage continues', code: rawCode };
  }

  const maybeCode = extractCode((error as { code?: unknown })?.code);
  const lowered = maybeCode?.toLowerCase();

  if (lowered === 'circuit_open') {
    return { message: 'SMTP outage continues', code: maybeCode };
  }

  if (error instanceof Error) {
    return { message: error.message, code: maybeCode };
  }

  return { message: 'Unknown error while sending email', code: maybeCode };
};

type DatabaseClient = typeof db;

export type SequenceWorkerOptions = {
  teamId?: number;
  limit?: number;
  now?: Date;
  minSendIntervalMinutes?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type SequenceWorkerResult = {
  scanned: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
  durationMs: number;
  details: SequenceWorkerTaskAudit[];
  diagnostics: SequenceWorkerDiagnostics | null;
};

type PendingDelivery = {
  statusId: string;
  contactId: string;
  sequenceId: string;
  stepId: string;
  sequenceStatus: 'active' | 'paused';
  sequenceMinGapMinutes: number | null;
  attempts: number;
  scheduledAt: Date;
  teamId: number;
  stepOrder: number;
  stepSubject: string;
  stepBody: string;
  stepDelayHours: number;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactCompany: string;
  contactTags: string[] | null;
  skipIfReplied: boolean;
  skipIfBounced: boolean;
  delayIfReplied: number | null;
  contactTimezone: string | null;
  scheduleMode: 'fixed' | 'window' | null;
  scheduleSendTime: string | null;
  scheduleWindowStart: string | null;
  scheduleWindowEnd: string | null;
  scheduleRespectTimezone: boolean;
  scheduleFallbackTimezone: string | null;
  scheduleTimezone: string | null;
  scheduleSendDays: string[] | null;
  scheduleSendWindows: Array<{ start: string; end: string }> | null;
  manualTriggeredAt: Date | null;
  manualSentAt: Date | null;
  contactCustomFieldsById?: Record<string, string>;
  contactCustomFieldsByKey?: Record<string, string>;
  contactCustomFieldsByName?: Record<string, string>;
  sender: {
    id: number;
    name: string;
    email: string;
    status: string;
    host: string;
    port: number;
    username: string;
    password: string;
  } | null;
};

const DEFAULT_FALLBACK_TIMEZONE = 'UTC';
const MAX_AUDIT_ENTRIES = 100;
const DEFAULT_STEP_GAP_MINUTES = 2;
const MINUTE_MS = 60 * 1000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * 60;
const FLOAT_EPSILON = 1e-6;

export type StepDelayUnit = 'minutes' | 'hours' | 'days';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isApproximatelyInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) <= FLOAT_EPSILON;
}

function normaliseDelayMinutes(
  value: number | null | undefined,
  unit: StepDelayUnit | null | undefined,
  defaultGapMinutes: number
): { minutes: number; usedDefault: boolean } {
  if (!isFiniteNumber(value) || value <= 0) {
    return { minutes: defaultGapMinutes, usedDefault: true };
  }

  const safeUnit = unit ?? 'minutes';

  if (safeUnit === 'minutes') {
    return { minutes: value, usedDefault: false };
  }

  if (safeUnit === 'hours') {
    return { minutes: value * MINUTES_PER_HOUR, usedDefault: false };
  }

  if (safeUnit === 'days') {
    return { minutes: value * MINUTES_PER_DAY, usedDefault: false };
  }

  return { minutes: defaultGapMinutes, usedDefault: true };
}

export function computeNextSendAt(
  lastSentAt: Date,
  delayValue: number | null | undefined,
  delayUnit: StepDelayUnit | null | undefined,
  globalMinIntervalMinutes: number,
  defaultGapMinutes = DEFAULT_STEP_GAP_MINUTES
): {
  desiredAt: Date;
  stepDelayMinutes: number;
  effectiveMinGapMinutes: number;
  usedDefaultGap: boolean;
  delayedByMs: number;
} {
  const globalMin = Number.isFinite(globalMinIntervalMinutes) && globalMinIntervalMinutes > 0
    ? globalMinIntervalMinutes
    : 0;

  const { minutes: rawStepDelayMinutes, usedDefault } = normaliseDelayMinutes(delayValue, delayUnit, defaultGapMinutes);
  const stepDelayMinutes = Math.max(rawStepDelayMinutes, 0);
  const desiredAt = new Date(lastSentAt.getTime() + stepDelayMinutes * MINUTE_MS);
  const effectiveMinGapMinutes = Math.max(stepDelayMinutes, globalMin);
  const delayedByMs = Math.max(0, desiredAt.getTime() - lastSentAt.getTime());

  return {
    desiredAt,
    stepDelayMinutes,
    effectiveMinGapMinutes,
    usedDefaultGap: usedDefault,
    delayedByMs
  };
}

function resolveDelayFromHours(
  delayHours: number | null | undefined
): { value: number | null; unit: StepDelayUnit | null } {
  if (!isFiniteNumber(delayHours) || delayHours <= 0) {
    return { value: 0, unit: null };
  }

  const minutes = delayHours * MINUTES_PER_HOUR;
  const roundedMinutes = Math.round(minutes * 1000) / 1000;

  const days = roundedMinutes / MINUTES_PER_DAY;
  if (isApproximatelyInteger(days) && days >= 1) {
    return { value: Math.round(days), unit: 'days' };
  }

  const hours = roundedMinutes / MINUTES_PER_HOUR;
  if (isApproximatelyInteger(hours) && hours >= 1) {
    return { value: Math.round(hours), unit: 'hours' };
  }

  return { value: roundedMinutes, unit: 'minutes' };
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export type SequenceWorkerTaskOutcome = 'sent' | 'skipped' | 'failed' | 'retry' | 'delayed';

export type SequenceWorkerTaskAudit = {
  statusId: string;
  sequenceId: string;
  contactId: string;
  stepId: string | null;
  scheduledAt: string;
  attempts: number;
  outcome: SequenceWorkerTaskOutcome;
  reason?: string;
  error?: string;
  messageId?: string | null;
  rescheduledFor?: string | null;
};

export type SequenceWorkerDiagnostics = {
  pendingSequences: Array<{
    sequenceId: string;
    status: 'draft' | 'active' | 'paused';
    pending: number;
    nextScheduledAt: string | null;
  }>;
};

type SequenceSkipReason =
  | 'draft'
  | 'paused'
  | 'deleted'
  | 'status_changed'
  | 'reply_stop'
  | 'reply_delay'
  | 'bounce_policy'
  | 'outside_window'
  | 'plan_limit';

const workerLogger = getLogger({ component: 'sequence-worker' });

function logWorkerEvent(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
  workerLogger[level](
    {
      event: 'sequence-worker.event',
      message,
      ...(context ?? {})
    },
    message
  );
}

function resolveSenderPassword(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const key = process.env.SENDER_CREDENTIALS_KEY;
  if (!key || key.length < 32) {
    return raw;
  }

  try {
    if (!isProbablyEncryptedSecret(raw)) {
      return raw;
    }

    return decryptSecret(raw);
  } catch (error) {
    getLogger({ component: 'sequence-worker' }).warn(
      {
        err: error,
        event: 'sender.decrypt.failed'
      },
      'Failed to decrypt sender password, falling back to stored value'
    );
    return raw;
  }
}

function buildScheduleOptions(task: PendingDelivery): SequenceScheduleOptions | null {
  const sendDays = Array.isArray(task.scheduleSendDays) && task.scheduleSendDays.length > 0
    ? task.scheduleSendDays.filter((day): day is string => typeof day === 'string' && day.trim().length > 0)
    : null;

  const sendWindows = Array.isArray(task.scheduleSendWindows) && task.scheduleSendWindows.length > 0
    ? task.scheduleSendWindows
        .map((window) => ({
          start: typeof window?.start === 'string' ? window.start.trim() : '',
          end: typeof window?.end === 'string' ? window.end.trim() : ''
        }))
        .filter((window) => window.start.length > 0 && window.end.length > 0)
    : null;

  if (task.scheduleMode === 'fixed' && task.scheduleSendTime) {
    return {
      mode: 'fixed',
      sendTime: task.scheduleSendTime,
      respectContactTimezone: task.scheduleRespectTimezone !== false,
      timezone: task.scheduleTimezone ?? null,
      sendDays,
      sendWindows
    };
  }

  if (task.scheduleMode === 'window' && task.scheduleWindowStart && task.scheduleWindowEnd) {
    return {
      mode: 'window',
      sendWindowStart: task.scheduleWindowStart,
      sendWindowEnd: task.scheduleWindowEnd,
      respectContactTimezone: task.scheduleRespectTimezone !== false,
      timezone: task.scheduleTimezone ?? null,
      sendDays,
      sendWindows: sendWindows && sendWindows.length > 0 ? sendWindows : null
    };
  }

  if (sendDays || (sendWindows && sendWindows.length > 0) || (task.scheduleTimezone && task.scheduleTimezone.length > 0)) {
    return {
      mode: 'immediate',
      respectContactTimezone: task.scheduleRespectTimezone !== false,
      timezone: task.scheduleTimezone ?? null,
      sendDays,
      sendWindows
    };
  }

  return null;
}

async function ensureDeliveryLogSchema(client: DatabaseClient) {
  if (DELIVERY_SCHEMA_CHECK_CACHE.has(client)) {
    return;
  }

  if (typeof (client as any).execute !== 'function') {
    DELIVERY_SCHEMA_CHECK_CACHE.add(client);
    return;
  }

  try {
    await (client as any).execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'delivery_status'
            AND e.enumlabel = 'skipped'
        ) THEN
          ALTER TYPE delivery_status ADD VALUE 'skipped';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'delivery_status'
            AND e.enumlabel = 'delayed'
        ) THEN
          ALTER TYPE delivery_status ADD VALUE 'delayed';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'delivery_status'
            AND e.enumlabel = 'replied'
        ) THEN
          ALTER TYPE delivery_status ADD VALUE 'replied';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'delivery_status'
            AND e.enumlabel = 'manual_send'
        ) THEN
          ALTER TYPE delivery_status ADD VALUE 'manual_send';
        END IF;
      END $$;
    `);

    await (client as any).execute(sql`ALTER TABLE delivery_logs ADD COLUMN IF NOT EXISTS status_id uuid`);
    await (client as any).execute(sql`ALTER TABLE delivery_logs ADD COLUMN IF NOT EXISTS skip_reason text`);
  } catch (error) {
    getLogger({ component: 'sequence-worker', event: 'schema.ensure.failed' }).warn(
      { err: error },
      'Failed to ensure delivery log schema'
    );
  } finally {
    DELIVERY_SCHEMA_CHECK_CACHE.add(client);
  }
}

async function diagnosePendingDeliveries(
  client: DatabaseClient,
  teamId?: number
): Promise<SequenceWorkerDiagnostics | null> {
  // Surface why the worker saw no ready tasks by grouping pending contacts per sequence status.
  const conditions = [eq(contactSequenceStatus.status, 'pending')];

  conditions.push(isNull(sequences.deletedAt));

  if (typeof teamId === 'number') {
    conditions.push(eq(sequences.teamId, teamId));
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions);

  const rows = await client
    .select({
      sequenceId: contactSequenceStatus.sequenceId,
      status: sequences.status,
      pending: sql<number>`count(*)`,
      nextScheduledAt: sql<Date | null>`min(${contactSequenceStatus.scheduledAt})`
    })
    .from(contactSequenceStatus)
    .innerJoin(sequences, eq(contactSequenceStatus.sequenceId, sequences.id))
    .where(whereClause)
    .groupBy(contactSequenceStatus.sequenceId, sequences.status)
    .orderBy(desc(sql`count(*)`))
    .limit(25);

  if (rows.length === 0) {
    return null;
  }

  return {
    pendingSequences: rows.map((row) => ({
      sequenceId: row.sequenceId,
      status: (row.status as 'draft' | 'active' | 'paused') ?? 'draft',
      pending: row.pending ?? 0,
      nextScheduledAt: row.nextScheduledAt ? row.nextScheduledAt.toISOString() : null
    }))
  };
}

export async function runSequenceWorker(
  options: SequenceWorkerOptions = {},
  client: DatabaseClient = db
): Promise<SequenceWorkerResult> {
  recordHeartbeat('sequence-worker');
  let now = options.now ?? new Date();
  let nowMs = now.getTime();
  const limit = Math.max(1, options.limit ?? 25);
  const startedAt = Date.now();
  const audits: SequenceWorkerTaskAudit[] = [];
  let auditOverflow = false;
  const pushAudit = (audit: SequenceWorkerTaskAudit) => {
    if (audits.length >= MAX_AUDIT_ENTRIES) {
      auditOverflow = true;
      return;
    }
    audits.push(audit);
  };
  let diagnostics: SequenceWorkerDiagnostics | null = null;

  const globalMinSendIntervalMinutes =
    typeof options.minSendIntervalMinutes === 'number' && Number.isFinite(options.minSendIntervalMinutes) &&
    options.minSendIntervalMinutes >= 0
      ? options.minSendIntervalMinutes
      : getMinSendIntervalMinutes();
  const sleep = options.sleep ?? defaultSleep;
  let lastSentAtMs: number | null = null;

  const syncWithSystemClock = () => {
    if (!options.now) {
      const systemNow = Date.now();
      if (systemNow > nowMs) {
        nowMs = systemNow;
        now = new Date(nowMs);
      }
    }
  };

  await ensureDeliveryLogSchema(client);

  try {
    const fallbackResult = await ingestFallbackReplies({ logger: logWorkerEvent });
    if (fallbackResult.processed > 0) {
      replyCounter.increment(fallbackResult.processed);
      logWorkerEvent('info', 'Fallback reply ingestion processed events', {
        processed: fallbackResult.processed,
        filesProcessed: fallbackResult.filesProcessed
      });
    }
  } catch (error) {
    logWorkerEvent('warn', 'Fallback reply ingestion failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Activate any scheduled sequences before fetching pending deliveries
  try {
    await activateScheduledSequences(options.teamId, client);
  } catch (err) {
    getLogger({ component: 'sequence-worker', event: 'scheduled.activate.failed' }).warn(
      { err },
      'Failed to activate scheduled sequences'
    );
  }

  const rawTasks = await fetchPendingDeliveries(client, now, limit, options.teamId);
  logWorkerEvent('info', 'Fetched pending deliveries (pre-hydration)', {
    count: rawTasks.length,
    limit,
    teamId: options.teamId ?? null
  });
  const tasks = await hydratePendingDeliveryPersonalisation(client, rawTasks);
  logWorkerEvent('info', 'Fetched pending deliveries', {
    count: tasks.length,
    limit,
    teamId: options.teamId ?? null
  });

  if (tasks.length > 0) {
    try {
      if (typeof options.teamId === 'number' && Number.isFinite(options.teamId)) {
        await syncAllSequenceRepliesForTeam(options.teamId, client);
      } else {
        const sequenceIds = Array.from(
          new Set(
            tasks
              .map((task) => task.sequenceId)
              .filter((id): id is string => typeof id === 'string' && id.length > 0)
          )
        );

        for (const sequenceId of sequenceIds) {
          await syncSequenceRepliesFromLogs(sequenceId, client);
        }
      }
    } catch (error) {
      logWorkerEvent('warn', 'Failed to synchronise replies before processing deliveries', {
        error: error instanceof Error ? error.message : String(error),
        teamId: options.teamId ?? null
      });
    }
  }

  if (tasks.length === 0) {
    diagnostics = await diagnosePendingDeliveries(client, options.teamId);

    if (diagnostics && diagnostics.pendingSequences.length > 0) {
      const blocked = diagnostics.pendingSequences.filter((entry) => entry.status !== 'active');
      if (blocked.length > 0) {
        logWorkerEvent('warn', 'Pending deliveries blocked by lifecycle status', { blocked });
      } else {
        logWorkerEvent('info', 'Pending deliveries exist but none ready for current window', {
          sequences: diagnostics.pendingSequences.length,
          teamId: options.teamId ?? null
        });
      }
    }
  }

  let sent = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  for (const task of tasks) {
    logWorkerEvent('info', 'Processing pending delivery', {
      contactId: task.contactId,
      sequenceId: task.sequenceId,
      statusId: task.statusId,
      stepId: task.stepId,
      scheduledAt: task.scheduledAt.toISOString(),
      attempts: task.attempts,
      sequenceStatus: task.sequenceStatus,
      manualTriggeredAt: task.manualTriggeredAt
    });
    syncWithSystemClock();

    const effectiveMinIntervalMinutes =
      typeof task.sequenceMinGapMinutes === 'number' && Number.isFinite(task.sequenceMinGapMinutes) &&
      task.sequenceMinGapMinutes >= 0
        ? task.sequenceMinGapMinutes
        : globalMinSendIntervalMinutes;
    const effectiveMinIntervalMs = Math.max(0, Math.round(effectiveMinIntervalMinutes * 60 * 1000));
    let throttledForTask = false;
    let throttleDelayMs = 0;
    const isManualOverride = task.manualTriggeredAt != null;

    if (!isManualOverride && effectiveMinIntervalMs > 0 && lastSentAtMs !== null) {
      const elapsed = nowMs - lastSentAtMs;
      if (elapsed < effectiveMinIntervalMs) {
        throttleDelayMs = effectiveMinIntervalMs - elapsed;
        throttledForTask = throttleDelayMs > 0;
        if (throttledForTask) {
          await sleep(throttleDelayMs);
          nowMs += throttleDelayMs;
          now = new Date(nowMs);
          syncWithSystemClock();
          logWorkerEvent('info', 'Delaying send to respect minimum interval', {
            throttleDelayMs,
            effectiveMinIntervalMinutes,
            sequenceMinGapMinutes: task.sequenceMinGapMinutes,
            globalMinSendIntervalMinutes,
            lastSentAt: new Date(lastSentAtMs).toISOString()
          });
        }
      }
    }

    now = new Date(nowMs);
    await client.transaction(async (tx) => {
      // Re-check that the status is still pending to avoid double processing.
      const current = await tx
        .select({
          status: contactSequenceStatus.status,
          attempts: contactSequenceStatus.attempts,
          replyAt: contactSequenceStatus.replyAt,
          bounceAt: contactSequenceStatus.bounceAt,
          scheduledAt: contactSequenceStatus.scheduledAt,
          stepId: contactSequenceStatus.stepId
        })
        .from(contactSequenceStatus)
        .where(eq(contactSequenceStatus.id, task.statusId))
        .limit(1);

      const currentState = current[0];
      const currentAttempts = currentState?.attempts ?? task.attempts ?? 0;
      if (!currentState || currentState.status !== 'pending' || currentState.stepId !== task.stepId) {
        await recordSkip(tx, task, now, 'status_changed', { attempts: currentAttempts });
        pushAudit({
          statusId: task.statusId,
          sequenceId: task.sequenceId,
          contactId: task.contactId,
          stepId: task.stepId,
          scheduledAt: task.scheduledAt.toISOString(),
          attempts: currentAttempts,
          outcome: 'skipped',
          reason: 'status_changed'
        });
        skipped += 1;
        logWorkerEvent('info', 'Skipping delivery due to status change', {
          contactId: task.contactId,
          sequenceId: task.sequenceId,
          statusId: task.statusId,
          currentStatus: currentState?.status ?? null,
          currentStepId: currentState?.stepId ?? null
        });
        return;
      }

      if (throttledForTask && throttleDelayMs > 0) {
        await recordThrottleDelay(tx, task, now, {
          delayMs: throttleDelayMs,
          minIntervalMinutes: effectiveMinIntervalMinutes
        });
      }

      const priorAttempts = currentAttempts;
      const baseAudit: Omit<SequenceWorkerTaskAudit, 'outcome' | 'reason' | 'error' | 'messageId' | 'rescheduledFor'> = {
        statusId: task.statusId,
        sequenceId: task.sequenceId,
        contactId: task.contactId,
        stepId: task.stepId,
        scheduledAt: task.scheduledAt.toISOString(),
        attempts: priorAttempts
      };
      const recordAudit = (
        outcome: SequenceWorkerTaskOutcome,
        overrides: Partial<SequenceWorkerTaskAudit> = {}
      ) => {
        pushAudit({
          ...baseAudit,
          outcome,
          ...overrides
        });
      };

      if (throttledForTask && throttleDelayMs > 0) {
        recordAudit('delayed', {
          reason: 'min_send_interval'
        });
      }

      const [sequenceLifecycle] = await tx
        .select({ status: sequences.status })
        .from(sequences)
        .where(eq(sequences.id, task.sequenceId))
        .limit(1);

      const activeStatus = sequenceLifecycle?.status ?? task.sequenceStatus;
      if (activeStatus !== 'active') {
        const skipReason: SequenceSkipReason = sequenceLifecycle?.status === 'paused'
          ? 'paused'
          : sequenceLifecycle?.status === 'draft'
            ? 'draft'
            : task.sequenceStatus === 'paused'
              ? 'paused'
              : 'deleted';

        await recordSkip(tx, task, now, skipReason, { attempts: priorAttempts });
        recordAudit('skipped', {
          reason: 'sequence_not_active'
        });
        skipped += 1;
        logWorkerEvent('info', 'Skipping delivery because sequence is not active', {
          contactId: task.contactId,
          sequenceId: task.sequenceId,
          statusId: task.statusId,
          lifecycleStatus: sequenceLifecycle?.status ?? task.sequenceStatus
        });
        return;
      }

      const [stepConfig] = await tx
        .select({
          skipIfReplied: sequenceSteps.skipIfReplied,
          skipIfBounced: sequenceSteps.skipIfBounced,
          delayIfReplied: sequenceSteps.delayIfReplied
        })
        .from(sequenceSteps)
        .where(eq(sequenceSteps.id, task.stepId))
        .limit(1);

      if (!stepConfig) {
        await tx
          .update(contactSequenceStatus)
          .set({
            status: 'failed',
            scheduledAt: null,
            stepId: null,
            lastUpdated: now
          })
          .where(eq(contactSequenceStatus.id, task.statusId));
        failed += 1;
        recordAudit('failed', {
          attempts: priorAttempts + 1,
          reason: 'missing_step'
        });
        logWorkerEvent('warn', 'Delivery failed due to missing step configuration', {
          contactId: task.contactId,
          sequenceId: task.sequenceId,
          statusId: task.statusId,
          stepId: task.stepId
        });
        return;
      }

      if (currentState.bounceAt && stepConfig.skipIfBounced) {
        await tx
          .update(contactSequenceStatus)
          .set({
            status: 'bounced',
            scheduledAt: null,
            stepId: null,
            lastUpdated: now
          })
          .where(eq(contactSequenceStatus.id, task.statusId));
        await recordSkip(tx, task, now, 'bounce_policy', { attempts: priorAttempts });
        skipped += 1;
        recordAudit('skipped', {
          reason: 'bounce_policy'
        });
        logWorkerEvent('info', 'Skipping delivery due to bounce policy', {
          contactId: task.contactId,
          sequenceId: task.sequenceId,
          statusId: task.statusId
        });
        return;
      }

      if (currentState.replyAt) {
        if (stepConfig.skipIfReplied) {
          await tx
            .update(contactSequenceStatus)
            .set({
              status: 'replied',
              scheduledAt: null,
              stepId: null,
              lastUpdated: now
            })
            .where(eq(contactSequenceStatus.id, task.statusId));
          await recordSkip(tx, task, now, 'reply_stop', { attempts: priorAttempts });
          skipped += 1;
          recordAudit('skipped', {
            reason: 'reply_policy'
          });
          logWorkerEvent('info', 'Skipping delivery due to reply stop policy', {
            contactId: task.contactId,
            sequenceId: task.sequenceId,
            statusId: task.statusId
          });
          return;
        }

        if (typeof stepConfig.delayIfReplied === 'number' && stepConfig.delayIfReplied > 0) {
          const resumeAt = new Date(currentState.replyAt.getTime() + stepConfig.delayIfReplied * 60 * 60 * 1000);
          if (resumeAt > now) {
            const scheduleOptions = buildScheduleOptions(task);
            const fallbackTimezone = task.scheduleTimezone ?? task.scheduleFallbackTimezone ?? DEFAULT_FALLBACK_TIMEZONE;
            const target = scheduleOptions
              ? computeScheduledUtc({
                  now: resumeAt,
                  stepDelayHours: 0,
                  contactTimezone: task.contactTimezone,
                  fallbackTimezone,
                  schedule: scheduleOptions
                })
              : resumeAt;
            await tx
              .update(contactSequenceStatus)
              .set({
                scheduledAt: target,
                lastUpdated: now
              })
              .where(eq(contactSequenceStatus.id, task.statusId));
            await recordSkip(tx, task, now, 'reply_delay', {
              attempts: priorAttempts,
              rescheduledFor: target
            });
            skipped += 1;
            recordAudit('skipped', {
              reason: 'reply_delay',
              rescheduledFor: target.toISOString()
            });
            logWorkerEvent('info', 'Skipping delivery due to reply delay', {
              contactId: task.contactId,
              sequenceId: task.sequenceId,
              statusId: task.statusId,
              rescheduledFor: target.toISOString()
            });
            return;
          }
        }
      }

      const attemptNumber = priorAttempts + 1;

      const senderSnapshot = task.sender;
      const isSenderEligible = senderSnapshot && ['verified', 'active'].includes(senderSnapshot.status);

      if (!senderSnapshot || !isSenderEligible) {
        const reason = !senderSnapshot ? 'sender_missing' : 'sender_inactive';
        const failureMessage = !senderSnapshot
          ? 'Sequence does not have an active sender assigned'
          : 'Assigned sender is no longer active or verified';
        await handleFailure(
          tx,
          task,
          now,
          failureMessage,
          priorAttempts,
          {
            allowRetry: false
          }
        );
        recordAudit('failed', {
          attempts: attemptNumber,
          reason,
          error: failureMessage
        });
        failed += 1;
        logWorkerEvent('warn', 'Delivery failed due to sender configuration', {
          contactId: task.contactId,
          sequenceId: task.sequenceId,
          statusId: task.statusId,
          senderId: senderSnapshot?.id ?? null,
          senderStatus: senderSnapshot?.status ?? null
        });
        return;
      }

      try {
        await assertCanSendEmails(task.teamId, 1, now, tx);
      } catch (error) {
        if (error instanceof PlanLimitExceededError) {
          await recordSkip(tx, task, now, 'plan_limit', { attempts: priorAttempts });
          recordAudit('skipped', {
            reason: 'plan_limit',
            error: error.message
          });
          skipped += 1;
          logWorkerEvent('warn', 'Skipping delivery because plan limit reached', {
            contactId: task.contactId,
            sequenceId: task.sequenceId,
            statusId: task.statusId,
            teamId: task.teamId,
            error: error.message
          });
          return;
        }
        throw error;
      }

      const sender = {
        name: senderSnapshot.name,
        email: senderSnapshot.email,
        host: senderSnapshot.host,
        port: senderSnapshot.port,
        username: senderSnapshot.username,
        password: senderSnapshot.password
      };

      let contactEnsured = false;
      let dispatchedMessageId: string | null = null;

      try {
        if (throttledForTask) {
          // Sync now if the send was throttled just before dispatch.
          now = new Date(nowMs);
        }

        await ensureContactRecord(tx, task);
        contactEnsured = true;
        logWorkerEvent('info', 'Ensured contact record before sending', {
          contactId: task.contactId,
          sequenceId: task.sequenceId,
          statusId: task.statusId
        });

        const rendered = renderSequenceContent(task.stepSubject ?? '', task.stepBody ?? '', {
          email: task.contactEmail,
          firstName: task.contactFirstName,
          lastName: task.contactLastName,
          company: task.contactCompany,
          tags: task.contactTags ?? undefined,
          customFieldsById: task.contactCustomFieldsById ?? {},
          customFieldsByKey: task.contactCustomFieldsByKey ?? {},
          customFieldsByName: task.contactCustomFieldsByName ?? {}
        });
        const info = await dispatchSequenceEmail({
          sender,
          recipient: task.contactEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text
        });
        dispatchedMessageId = info.messageId ?? null;
        await recordSuccess(tx, task, now, dispatchedMessageId, attemptNumber, {
          lastSentAtMs,
          globalMinSendIntervalMinutes,
          contactEnsured
        });
        await trackEmailsSent(task.teamId, 1, now, tx);
      } catch (error) {
        const normalized = normalizeSendError(error);
        const errorMessage = normalized.message;
        const result = await handleFailure(tx, task, now, errorMessage, priorAttempts, {
          allowRetry: !isManualOverride
        });
        const outageReason = errorMessage === 'SMTP outage continues' ? errorMessage : undefined;

        if (result.retried) {
          recordAudit('retry', {
            attempts: attemptNumber,
            reason: outageReason ?? 'retryable_error',
            error: errorMessage,
            rescheduledFor: result.nextAttemptAt ? result.nextAttemptAt.toISOString() : undefined
          });
          retried += 1;
          retryCounter.increment();
          logWorkerEvent('warn', 'Delivery will be retried', {
            contactId: task.contactId,
            sequenceId: task.sequenceId,
            statusId: task.statusId,
            error: errorMessage,
            errorCode: normalized.code ?? null,
            rescheduledFor: result.nextAttemptAt ? result.nextAttemptAt.toISOString() : null
          });
          return;
        }

        recordAudit('failed', {
          attempts: attemptNumber,
          reason: outageReason ?? (isManualOverride ? 'manual_send_failure' : 'max_attempts_reached'),
          error: errorMessage
        });
        failed += 1;
        errorCounter.increment();
        logWorkerEvent('error', 'Delivery send failed', {
          contactId: task.contactId,
          sequenceId: task.sequenceId,
          statusId: task.statusId,
          error: errorMessage,
          errorCode: normalized.code ?? null
        });
        return;
      }

      recordAudit('sent', {
        attempts: attemptNumber,
        messageId: dispatchedMessageId,
        reason: isManualOverride ? 'manual_send' : undefined
      });
      sent += 1;
      sendCounter.increment();
      lastSentAtMs = now.getTime();
      logWorkerEvent('info', 'Delivery sent', {
        contactId: task.contactId,
        sequenceId: task.sequenceId,
        statusId: task.statusId,
        messageId: dispatchedMessageId,
        manual: isManualOverride
      });
    });

    syncWithSystemClock();
  }

  const durationMs = Date.now() - startedAt;

  recordHeartbeat('sequence-worker');

  if (auditOverflow) {
    logWorkerEvent('warn', 'Worker audit entries truncated', { maxEntries: MAX_AUDIT_ENTRIES });
  }

  logWorkerEvent('info', 'Sequence worker run completed', {
    scanned: tasks.length,
    sent,
    failed,
    retried,
    skipped,
    durationMs,
    teamId: options.teamId ?? null
  });

  const resultDiagnostics = auditOverflow ? { pendingSequences: [] } : diagnostics;

  return {
    scanned: tasks.length,
    sent,
    failed,
    retried,
    skipped,
    durationMs,
    details: audits,
    diagnostics: resultDiagnostics
  };
}

async function fetchPendingDeliveries(
  client: DatabaseClient,
  now: Date,
  limit: number,
  teamId?: number
): Promise<PendingDelivery[]> {
  const conditions = [
    eq(contactSequenceStatus.status, 'pending'),
    lte(contactSequenceStatus.scheduledAt, now),
    eq(sequences.status, 'active')
  ];

  conditions.push(isNull(sequences.deletedAt));

  if (typeof teamId === 'number') {
    conditions.push(eq(sequences.teamId, teamId));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await client
    .select({
      statusId: contactSequenceStatus.id,
      contactId: contactSequenceStatus.contactId,
      sequenceId: contactSequenceStatus.sequenceId,
      stepId: contactSequenceStatus.stepId,
  sequenceStatus: sequences.status,
    sequenceMinGapMinutes: sequences.minGapMinutes,
      attempts: contactSequenceStatus.attempts,
      scheduledAt: contactSequenceStatus.scheduledAt,
      replyAt: contactSequenceStatus.replyAt,
      bounceAt: contactSequenceStatus.bounceAt,
      teamId: sequences.teamId,
      sequenceSenderId: sequences.senderId,
      senderId: senders.id,
      senderName: senders.name,
      senderEmail: senders.email,
      senderStatus: senders.status,
      senderHost: senders.host,
      senderPort: senders.port,
      senderUsername: senders.username,
      senderPassword: senders.password,
      stepOrder: sequenceSteps.order,
      stepSubject: sequenceSteps.subject,
      stepBody: sequenceSteps.body,
      stepDelayHours: sequenceSteps.delayHours,
      skipIfReplied: sequenceSteps.skipIfReplied,
      skipIfBounced: sequenceSteps.skipIfBounced,
      delayIfReplied: sequenceSteps.delayIfReplied,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      contactCompany: contacts.company,
  contactTags: contacts.tags,
      contactTimezone: contacts.timezone,
      scheduleMode: contactSequenceStatus.scheduleMode,
      scheduleSendTime: contactSequenceStatus.scheduleSendTime,
      scheduleWindowStart: contactSequenceStatus.scheduleWindowStart,
      scheduleWindowEnd: contactSequenceStatus.scheduleWindowEnd,
    scheduleRespectTimezone: contactSequenceStatus.scheduleRespectTimezone,
    scheduleFallbackTimezone: contactSequenceStatus.scheduleFallbackTimezone,
    scheduleTimezone: contactSequenceStatus.scheduleTimezone,
    scheduleSendDays: contactSequenceStatus.scheduleSendDays,
    scheduleSendWindows: contactSequenceStatus.scheduleSendWindows,
      manualTriggeredAt: contactSequenceStatus.manualTriggeredAt,
      manualSentAt: contactSequenceStatus.manualSentAt
    })
    .from(contactSequenceStatus)
    .innerJoin(contacts, eq(contactSequenceStatus.contactId, contacts.id))
    .innerJoin(sequences, eq(contactSequenceStatus.sequenceId, sequences.id))
    .innerJoin(sequenceSteps, eq(contactSequenceStatus.stepId, sequenceSteps.id))
  .leftJoin(senders, eq(sequences.senderId, senders.id))
    .where(whereClause)
    .orderBy(
      sql`CASE WHEN ${contactSequenceStatus.manualTriggeredAt} IS NULL THEN 1 ELSE 0 END`,
      contactSequenceStatus.scheduledAt
    )
    .limit(limit);

  return rows
    .filter((row) => row.stepId != null)
    .map((row) => {
      const senderPassword = resolveSenderPassword(row.senderPassword);

      return {
        statusId: row.statusId,
        contactId: row.contactId,
        sequenceId: row.sequenceId,
        stepId: row.stepId as string,
        sequenceStatus: (row.sequenceStatus as 'active' | 'paused') ?? 'active',
        sequenceMinGapMinutes:
          typeof row.sequenceMinGapMinutes === 'number' && Number.isFinite(row.sequenceMinGapMinutes)
            ? row.sequenceMinGapMinutes
            : null,
        attempts: row.attempts,
        scheduledAt: row.scheduledAt ?? now,
        teamId: row.teamId,
        stepOrder: row.stepOrder,
        stepSubject: row.stepSubject,
        stepBody: row.stepBody,
        stepDelayHours: row.stepDelayHours,
        contactFirstName: row.contactFirstName,
        contactLastName: row.contactLastName,
        contactEmail: row.contactEmail,
        contactCompany: row.contactCompany,
        contactTags: Array.isArray(row.contactTags) ? row.contactTags : null,
        skipIfReplied: row.skipIfReplied ?? false,
        skipIfBounced: row.skipIfBounced ?? false,
        delayIfReplied: row.delayIfReplied ?? null,
        contactTimezone: row.contactTimezone ?? null,
        scheduleMode: (row.scheduleMode as 'fixed' | 'window' | null) ?? null,
        scheduleSendTime: row.scheduleSendTime ?? null,
        scheduleWindowStart: row.scheduleWindowStart ?? null,
        scheduleWindowEnd: row.scheduleWindowEnd ?? null,
        scheduleRespectTimezone: row.scheduleRespectTimezone ?? true,
        scheduleFallbackTimezone: row.scheduleFallbackTimezone ?? null,
        scheduleTimezone: row.scheduleTimezone ?? null,
        scheduleSendDays: Array.isArray(row.scheduleSendDays) ? row.scheduleSendDays : null,
        scheduleSendWindows: Array.isArray(row.scheduleSendWindows) ? row.scheduleSendWindows : null,
        manualTriggeredAt: row.manualTriggeredAt ?? null,
        manualSentAt: row.manualSentAt ?? null,
        sender:
          row.senderId &&
          row.senderName &&
          row.senderEmail &&
          row.senderHost &&
          row.senderPort != null &&
          row.senderUsername &&
          senderPassword
            ? {
                id: row.senderId,
                name: row.senderName,
                email: row.senderEmail,
                status: row.senderStatus ?? 'inactive',
                host: row.senderHost,
                port: row.senderPort,
                username: row.senderUsername,
                password: senderPassword
              }
            : null
      };
    });
}

async function hydratePendingDeliveryPersonalisation(
  client: DatabaseClient,
  tasks: PendingDelivery[]
): Promise<PendingDelivery[]> {
  if (tasks.length === 0) {
    return tasks;
  }

  const contactIds = Array.from(new Set(tasks.map((task) => task.contactId))).filter((id) => typeof id === 'string');
  if (contactIds.length === 0) {
    return tasks;
  }

  const teamIds = Array.from(new Set(tasks.map((task) => task.teamId))).filter((id) => typeof id === 'number');

  const fieldConditions: Array<SQL<unknown> | undefined> = [
    inArray(contactCustomFieldValues.contactId, contactIds)
  ];
  if (teamIds.length > 0) {
    fieldConditions.push(inArray(contactCustomFieldDefinitions.teamId, teamIds));
  }

  const filteredConditions = fieldConditions.filter(
    (condition): condition is SQL<unknown> => condition !== undefined
  );

  const fieldWhere =
    filteredConditions.length === 1
      ? filteredConditions[0]
      : and(...filteredConditions);

  const fieldRows = await client
    .select({
      contactId: contactCustomFieldValues.contactId,
      fieldId: contactCustomFieldValues.fieldId,
      key: contactCustomFieldDefinitions.key,
      name: contactCustomFieldDefinitions.name,
      type: contactCustomFieldDefinitions.type,
      textValue: contactCustomFieldValues.textValue,
      numberValue: contactCustomFieldValues.numberValue,
      dateValue: contactCustomFieldValues.dateValue
    })
    .from(contactCustomFieldValues)
    .innerJoin(
      contactCustomFieldDefinitions,
      eq(contactCustomFieldDefinitions.id, contactCustomFieldValues.fieldId)
    )
    .where(fieldWhere)
    .limit(Math.max(contactIds.length * 10, 25));

  const grouped = new Map<
    string,
    {
      byId: Record<string, string>;
      byKey: Record<string, string>;
      byName: Record<string, string>;
    }
  >();

  for (const row of fieldRows) {
    let stringValue: string | null = null;
    switch (row.type) {
      case 'text':
        stringValue = row.textValue ?? '';
        break;
      case 'number':
        stringValue = row.numberValue != null ? String(row.numberValue) : null;
        break;
      case 'date':
        stringValue = row.dateValue ? new Date(row.dateValue).toISOString().slice(0, 10) : null;
        break;
      default:
        stringValue = null;
    }

    if (stringValue == null) {
      continue;
    }

    let entry = grouped.get(row.contactId);
    if (!entry) {
      entry = { byId: {}, byKey: {}, byName: {} };
      grouped.set(row.contactId, entry);
    }

    entry.byId[row.fieldId] = stringValue;
    entry.byKey[row.key] = stringValue;
    entry.byName[row.name] = stringValue;
  }

  for (const task of tasks) {
    const entry = grouped.get(task.contactId);
    if (!entry) {
      task.contactCustomFieldsById = {};
      task.contactCustomFieldsByKey = {};
      task.contactCustomFieldsByName = {};
      continue;
    }
    task.contactCustomFieldsById = entry.byId;
    task.contactCustomFieldsByKey = entry.byKey;
    task.contactCustomFieldsByName = entry.byName;
  }

  return tasks;
}

async function recordSkip(
  tx: any,
  task: PendingDelivery,
  now: Date,
  reason: SequenceSkipReason,
  options: { attempts?: number; rescheduledFor?: Date } = {}
) {
  const attempts = options.attempts ?? task.attempts ?? 0;
  const payload = options.rescheduledFor ? { rescheduledFor: options.rescheduledFor.toISOString() } : null;

  await tx.insert(deliveryLogs).values({
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: 'skipped',
    messageId: null,
    errorMessage: null,
    attempts,
    skipReason: reason,
    payload,
    createdAt: now
  });

  logWorkerEvent('info', 'Recorded skipped delivery', {
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: 'skipped',
    messageId: null,
    skipReason: reason,
    rescheduledFor: payload?.rescheduledFor ?? null
  });

  if (task.manualTriggeredAt) {
    await tx
      .update(contactSequenceStatus)
      .set({ manualTriggeredAt: null })
      .where(eq(contactSequenceStatus.id, task.statusId));
  }
}

async function recordThrottleDelay(
  tx: any,
  task: PendingDelivery,
  now: Date,
  options: { delayMs: number; minIntervalMinutes: number }
) {
  await tx.insert(deliveryLogs).values({
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: 'delayed',
    messageId: null,
    errorMessage: null,
    attempts: task.attempts ?? 0,
    skipReason: null,
    type: 'throttle',
    payload: {
      reason: 'delayed_due_to_min_gap',
      delayMs: options.delayMs,
      minIntervalMinutes: options.minIntervalMinutes
    },
    createdAt: now
  });

  logWorkerEvent('info', 'Recorded throttle delay', {
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: 'delayed',
    messageId: null,
    delayMs: options.delayMs,
    minIntervalMinutes: options.minIntervalMinutes
  });
}

async function recordStepDelay(
  tx: any,
  task: PendingDelivery,
  now: Date,
  options: { delayMs: number; stepDelayHours: number; effectiveMinIntervalMinutes: number; rescheduledFor: Date; reason: 'step_delay' | 'min_gap' }
) {
  const reason = options.reason;
  await tx.insert(deliveryLogs).values({
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: 'delayed',
    messageId: null,
    errorMessage: null,
    attempts: task.attempts ?? 0,
    skipReason: null,
    type: 'delay',
    payload: {
      reason,
      delayMs: options.delayMs,
      stepDelayHours: options.stepDelayHours,
      effectiveMinIntervalMinutes: options.effectiveMinIntervalMinutes,
      rescheduledFor: options.rescheduledFor.toISOString()
    },
    createdAt: now
  });

  logWorkerEvent('info', 'Recorded step delay', {
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: 'delayed',
    messageId: null,
    delayMs: options.delayMs,
    reason: reason,
    effectiveMinIntervalMinutes: options.effectiveMinIntervalMinutes,
    rescheduledFor: options.rescheduledFor.toISOString()
  });
}

export function computeEffectiveNextSchedule(
  desired: Date,
  now: Date,
  lastSentAtMs: number | null,
  sequenceMinGapMinutes: number | null,
  globalMinSendIntervalMinutes: number
): { scheduleAt: Date; delayedByMs: number; reason: 'step_delay' | 'min_gap' | null; effectiveMinIntervalMinutes: number } {
  const sequenceMin = typeof sequenceMinGapMinutes === 'number' && Number.isFinite(sequenceMinGapMinutes) ? sequenceMinGapMinutes : null;
  const effectiveMin = Math.max(globalMinSendIntervalMinutes, sequenceMin ?? 0);
  const effectiveMinMs = Math.max(0, Math.round(effectiveMin * 60 * 1000));

  let scheduleAt = desired;
  let delayedByMs = 0;
  let reason: 'step_delay' | 'min_gap' | null = null;

  // If the desired time itself is in the future relative to now, that's a step-based delay.
  if (desired.getTime() > now.getTime()) {
    reason = 'step_delay';
    delayedByMs = desired.getTime() - now.getTime();
  }

  if (lastSentAtMs != null && effectiveMinMs > 0) {
    const earliest = new Date(lastSentAtMs + effectiveMinMs);
    if (earliest.getTime() > scheduleAt.getTime()) {
      const additionalDelay = earliest.getTime() - scheduleAt.getTime();
      delayedByMs += additionalDelay;
      scheduleAt = earliest;
      reason = 'min_gap';
    }
  }

  // If scheduleAt is still in the past relative to now, clamp to now (no negative schedules)
  if (scheduleAt.getTime() < now.getTime()) {
    scheduleAt = now;
    // if we clamped to now, there's no remaining step delay
    reason = null;
    delayedByMs = 0;
  }

  return { scheduleAt, delayedByMs, reason, effectiveMinIntervalMinutes: effectiveMin };
}

async function recordSuccess(
  tx: any,
  task: PendingDelivery,
  now: Date,
  messageId: string | null,
  attemptNumber: number,
  options?: { lastSentAtMs?: number | null; globalMinSendIntervalMinutes?: number; contactEnsured?: boolean }
) {
  if (!options?.contactEnsured) {
    await ensureContactRecord(tx, task);
  }

  const normalisedMessageId = normalizeMessageId(messageId);
  const persistedMessageId = normalisedMessageId ?? generateFallbackMessageId(task.sequenceId);

  if (!normalisedMessageId) {
    const context = {
      contactId: task.contactId,
      sequenceId: task.sequenceId,
      statusId: task.statusId
    } as const;

    if (messageId) {
      logWorkerEvent('warn', 'Message-ID normalised for delivery log', {
        ...context,
        rawMessageId: messageId,
        persistedMessageId
      });
    } else {
      logWorkerEvent('warn', 'SMTP response missing Message-ID; generated fallback', {
        ...context,
        persistedMessageId
      });
    }
  }

  const scheduleOptions = buildScheduleOptions(task);
  const fallbackTimezone = task.scheduleTimezone ?? task.scheduleFallbackTimezone ?? DEFAULT_FALLBACK_TIMEZONE;
  const isManual = task.manualTriggeredAt != null;
  const deliveryStatus: 'sent' | 'manual_send' = isManual ? 'manual_send' : 'sent';

  await tx.insert(deliveryLogs).values({
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: deliveryStatus,
    type: 'send',
    messageId: persistedMessageId,
    errorMessage: null,
    attempts: attemptNumber,
    skipReason: null,
    payload: {
      via: 'sequence-worker',
      sequenceId: task.sequenceId,
      contactId: task.contactId,
      messageId: persistedMessageId,
      rawMessageId: messageId ?? null,
      normalised: Boolean(normalisedMessageId)
    },
    createdAt: now
  });

  logWorkerEvent('info', 'Recorded successful delivery', {
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: deliveryStatus,
    messageId: persistedMessageId,
    normalised: Boolean(normalisedMessageId)
  });

  const [nextStep] = await tx
    .select({ id: sequenceSteps.id, delay: sequenceSteps.delayHours })
    .from(sequenceSteps)
    .where(and(eq(sequenceSteps.sequenceId, task.sequenceId), gt(sequenceSteps.order, task.stepOrder)))
    .orderBy(sequenceSteps.order)
    .limit(1);

  if (nextStep) {
    const rawDelayHours = isFiniteNumber(nextStep.delay) ? nextStep.delay : 0;
    const delayComponents = resolveDelayFromHours(rawDelayHours);
    const globalMin = options?.globalMinSendIntervalMinutes ?? getMinSendIntervalMinutes();
    const nextSend = computeNextSendAt(now, delayComponents.value, delayComponents.unit, globalMin);
    const stepDelayHoursUsed = nextSend.stepDelayMinutes / MINUTES_PER_HOUR;

    const desired = scheduleOptions
      ? computeScheduledUtc({
          now,
          stepDelayHours: stepDelayHoursUsed,
          contactTimezone: task.contactTimezone,
          fallbackTimezone,
          schedule: scheduleOptions
        })
      : nextSend.desiredAt;

    const lastSent = options?.lastSentAtMs ?? null;
    const effectiveMinForSchedule = Math.max(nextSend.effectiveMinGapMinutes, task.sequenceMinGapMinutes ?? 0);

    const { scheduleAt, delayedByMs, reason, effectiveMinIntervalMinutes } = computeEffectiveNextSchedule(
      desired,
      now,
      lastSent,
      task.sequenceMinGapMinutes,
      effectiveMinForSchedule
    );

    await tx
      .update(contactSequenceStatus)
      .set({
        stepId: nextStep.id,
        scheduledAt: scheduleAt,
        sentAt: null,
        attempts: 0,
        status: 'pending',
        lastUpdated: now,
        manualTriggeredAt: null,
        manualSentAt: isManual ? now : task.manualSentAt ?? null
      })
      .where(eq(contactSequenceStatus.id, task.statusId));

    if (reason && delayedByMs > 0) {
      await recordStepDelay(tx, task, now, {
        delayMs: delayedByMs,
        stepDelayHours: stepDelayHoursUsed,
        effectiveMinIntervalMinutes: effectiveMinIntervalMinutes,
        rescheduledFor: scheduleAt,
        reason: reason === 'min_gap' ? 'min_gap' : 'step_delay'
      });

      logWorkerEvent('info', 'Delaying next step send', {
        reason,
        delayMs: delayedByMs,
        effectiveMinIntervalMinutes,
        rescheduledFor: scheduleAt.toISOString(),
        stepDelayHours: stepDelayHoursUsed
      });
    }
  } else {
    await tx
      .update(contactSequenceStatus)
      .set({
        stepId: null,
        scheduledAt: null,
        sentAt: now,
        attempts: 0,
        status: 'sent',
        lastUpdated: now,
        manualTriggeredAt: null,
        manualSentAt: isManual ? now : task.manualSentAt ?? null
      })
      .where(eq(contactSequenceStatus.id, task.statusId));
  }
}

async function ensureContactRecord(tx: any, task: PendingDelivery): Promise<void> {
  const [statusRow] = await tx
    .select({
      id: contactSequenceStatus.id,
      contactId: contactSequenceStatus.contactId,
      sequenceId: contactSequenceStatus.sequenceId
    })
    .from(contactSequenceStatus)
    .where(eq(contactSequenceStatus.id, task.statusId))
    .limit(1);

  if (!statusRow) {
    logWorkerEvent('warn', 'Contact sequence status missing during ensureContactRecord', {
      contactId: task.contactId,
      sequenceId: task.sequenceId,
      statusId: task.statusId
    });
  }

  if (statusRow && statusRow.sequenceId !== task.sequenceId) {
    logWorkerEvent('warn', 'Sequence mismatch when ensuring contact record', {
      contactId: task.contactId,
      expectedSequenceId: task.sequenceId,
      statusSequenceId: statusRow.sequenceId,
      statusId: task.statusId
    });
  }

  if (statusRow && statusRow.contactId !== task.contactId) {
    logWorkerEvent('warn', 'Status contactId mismatch resolved in ensureContactRecord', {
      expectedContactId: task.contactId,
      statusContactId: statusRow.contactId,
      statusId: task.statusId
    });
    task.contactId = statusRow.contactId;
  }

  const targetContactId = statusRow?.contactId ?? task.contactId;

  const [existing] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, targetContactId))
    .limit(1);

  if (existing) {
    task.contactId = existing.id;
    return;
  }

  const firstName = task.contactFirstName?.trim() || 'Prospect';
  const lastName = task.contactLastName?.trim() || 'Contact';
  const email = task.contactEmail.trim().toLowerCase();
  const company = task.contactCompany?.trim() || 'Unknown';

  await tx
    .insert(contacts)
    .values({
      id: targetContactId,
      teamId: task.teamId,
      firstName,
      lastName,
      email,
      company,
      timezone: task.contactTimezone,
      tags: Array.isArray(task.contactTags) ? task.contactTags : []
    })
    .onConflictDoNothing({
      target: [contacts.teamId, contacts.email]
    });

  task.contactId = targetContactId;

  logWorkerEvent('info', 'Created contact record for delivery', {
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    statusId: task.statusId
  });
}

async function handleFailure(
  tx: any,
  task: PendingDelivery,
  now: Date,
  error: string,
  previousAttempts: number,
  options: { allowRetry?: boolean } = {}
) : Promise<{ retried: boolean; nextAttemptAt: Date | null }> {
  const attemptNumber = previousAttempts + 1;
  const isManual = task.manualTriggeredAt != null;
  const allowRetry = options.allowRetry !== false;
  const shouldRetry = !isManual && allowRetry && attemptNumber < MAX_SEND_ATTEMPTS;
  const logStatus: 'retrying' | 'failed' | 'manual_send' = isManual
    ? 'manual_send'
    : shouldRetry
      ? 'retrying'
      : 'failed';

  let nextAttemptAt: Date | null = null;

  await tx.insert(deliveryLogs).values({
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    statusId: task.statusId,
    status: logStatus,
    messageId: null,
    errorMessage: error,
    attempts: attemptNumber,
    skipReason: null,
    createdAt: now
  });

  if (shouldRetry) {
    const retryAt = new Date(now.getTime() + RETRY_DELAY_MINUTES * 60 * 1000);
    nextAttemptAt = retryAt;
    await tx
      .update(contactSequenceStatus)
      .set({
        attempts: attemptNumber,
        scheduledAt: retryAt,
        lastUpdated: now,
        manualTriggeredAt: null,
        manualSentAt: task.manualSentAt ?? null
      })
      .where(eq(contactSequenceStatus.id, task.statusId));
  } else {
    await tx
      .update(contactSequenceStatus)
      .set({
        attempts: attemptNumber,
        status: 'failed',
        scheduledAt: null,
        lastUpdated: now,
        manualTriggeredAt: null,
        manualSentAt: task.manualSentAt ?? null
      })
      .where(eq(contactSequenceStatus.id, task.statusId));
  }

  return { retried: shouldRetry, nextAttemptAt };
}
