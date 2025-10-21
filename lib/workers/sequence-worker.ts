import { and, desc, eq, gt, inArray, lte } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  contacts,
  contactSequenceStatus,
  deliveryLogs,
  sequences,
  sequenceSteps,
  senders
} from '@/lib/db/schema';
import { computeScheduledUtc, type SequenceScheduleOptions } from '@/lib/timezone';
import { dispatchSequenceEmail, renderSequenceContent } from '@/lib/mail/sequence-mailer';
import { decryptSecret } from '@/lib/security/encryption';

const MAX_SEND_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 15;

type DatabaseClient = typeof db;

export type SequenceWorkerOptions = {
  teamId?: number;
  limit?: number;
  now?: Date;
};

export type SequenceWorkerResult = {
  scanned: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
};

type PendingDelivery = {
  statusId: string;
  contactId: string;
  sequenceId: string;
  stepId: string;
  sequenceStatus: 'active' | 'paused';
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

function resolveSenderPassword(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const key = process.env.SENDER_CREDENTIALS_KEY;
  if (!key || key.length < 32) {
    return raw;
  }

  try {
    return decryptSecret(raw);
  } catch (error) {
    console.warn('Failed to decrypt sender password, falling back to stored value', error instanceof Error ? error.message : error);
    return raw;
  }
}

function buildScheduleOptions(task: PendingDelivery): SequenceScheduleOptions | null {
  if (task.scheduleMode === 'fixed' && task.scheduleSendTime) {
    return {
      mode: 'fixed',
      sendTime: task.scheduleSendTime,
      respectContactTimezone: task.scheduleRespectTimezone !== false
    };
  }

  if (task.scheduleMode === 'window' && task.scheduleWindowStart && task.scheduleWindowEnd) {
    return {
      mode: 'window',
      sendWindowStart: task.scheduleWindowStart,
      sendWindowEnd: task.scheduleWindowEnd,
      respectContactTimezone: task.scheduleRespectTimezone !== false
    };
  }

  return null;
}

export async function runSequenceWorker(
  options: SequenceWorkerOptions = {},
  client: DatabaseClient = db
): Promise<SequenceWorkerResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, options.limit ?? 25);

  const tasks = await fetchPendingDeliveries(client, now, limit, options.teamId);

  if (tasks.length === 0) {
    return { scanned: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  for (const task of tasks) {
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
      if (!currentState || currentState.status !== 'pending' || currentState.stepId !== task.stepId) {
        skipped += 1;
        return;
      }

      const [sequenceLifecycle] = await tx
        .select({ status: sequences.status })
        .from(sequences)
        .where(eq(sequences.id, task.sequenceId))
        .limit(1);

      const activeStatus = sequenceLifecycle?.status ?? task.sequenceStatus;
      if (activeStatus !== 'active') {
        skipped += 1;
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
        skipped += 1;
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
          skipped += 1;
          return;
        }

        if (typeof stepConfig.delayIfReplied === 'number' && stepConfig.delayIfReplied > 0) {
          const resumeAt = new Date(currentState.replyAt.getTime() + stepConfig.delayIfReplied * 60 * 60 * 1000);
          if (resumeAt > now) {
            const scheduleOptions = buildScheduleOptions(task);
            const fallbackTimezone = task.scheduleFallbackTimezone ?? DEFAULT_FALLBACK_TIMEZONE;
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
            skipped += 1;
            return;
          }
        }
      }

  const priorAttempts = currentState.attempts ?? task.attempts ?? 0;
  const attemptNumber = priorAttempts + 1;

      const senderSnapshot = task.sender;
      const isSenderEligible = senderSnapshot && ['verified', 'active'].includes(senderSnapshot.status);

      if (!senderSnapshot || !isSenderEligible) {
        await handleFailure(
          tx,
          task,
          now,
          !senderSnapshot
            ? 'Sequence does not have an active sender assigned'
            : 'Assigned sender is no longer active or verified',
          priorAttempts,
          {
            allowRetry: false
          }
        );
        failed += 1;
        return;
      }

      const sender = {
        name: senderSnapshot.name,
        email: senderSnapshot.email,
        host: senderSnapshot.host,
        port: senderSnapshot.port,
        username: senderSnapshot.username,
        password: senderSnapshot.password
      };

      try {
        const rendered = renderSequenceContent(task.stepSubject ?? '', task.stepBody ?? '', {
          firstName: task.contactFirstName,
          lastName: task.contactLastName,
          company: task.contactCompany,
          email: task.contactEmail,
          title: null,
          phone: null
        });
        const info = await dispatchSequenceEmail({
          sender,
          recipient: task.contactEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text
        });
        await recordSuccess(tx, task, now, info.messageId ?? null, attemptNumber);
        sent += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error while sending email';
        const result = await handleFailure(tx, task, now, errorMessage, priorAttempts);
        if (result.retried) {
          retried += 1;
        } else {
          failed += 1;
        }
      }
    });
  }

  return {
    scanned: tasks.length,
    sent,
    failed,
    retried,
    skipped
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
      contactTimezone: contacts.timezone,
      scheduleMode: contactSequenceStatus.scheduleMode,
      scheduleSendTime: contactSequenceStatus.scheduleSendTime,
      scheduleWindowStart: contactSequenceStatus.scheduleWindowStart,
      scheduleWindowEnd: contactSequenceStatus.scheduleWindowEnd,
      scheduleRespectTimezone: contactSequenceStatus.scheduleRespectTimezone,
      scheduleFallbackTimezone: contactSequenceStatus.scheduleFallbackTimezone
    })
    .from(contactSequenceStatus)
    .innerJoin(contacts, eq(contactSequenceStatus.contactId, contacts.id))
    .innerJoin(sequences, eq(contactSequenceStatus.sequenceId, sequences.id))
    .innerJoin(sequenceSteps, eq(contactSequenceStatus.stepId, sequenceSteps.id))
  .leftJoin(senders, eq(sequences.senderId, senders.id))
    .where(whereClause)
    .orderBy(contactSequenceStatus.scheduledAt)
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

async function recordSuccess(
  tx: any,
  task: PendingDelivery,
  now: Date,
  messageId: string | null,
  attemptNumber: number
) {
  const scheduleOptions = buildScheduleOptions(task);
  const fallbackTimezone = task.scheduleFallbackTimezone ?? DEFAULT_FALLBACK_TIMEZONE;

  await tx.insert(deliveryLogs).values({
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    status: 'sent',
    messageId,
    errorMessage: null,
    attempts: attemptNumber,
    createdAt: now
  });

  const [nextStep] = await tx
    .select({ id: sequenceSteps.id, delay: sequenceSteps.delayHours })
    .from(sequenceSteps)
    .where(and(eq(sequenceSteps.sequenceId, task.sequenceId), gt(sequenceSteps.order, task.stepOrder)))
    .orderBy(sequenceSteps.order)
    .limit(1);

  if (nextStep) {
    const delayHours = nextStep.delay ?? 0;
    const scheduleAt = scheduleOptions
      ? computeScheduledUtc({
          now,
          stepDelayHours: delayHours,
          contactTimezone: task.contactTimezone,
          fallbackTimezone,
          schedule: scheduleOptions
        })
      : new Date(now.getTime() + delayHours * 60 * 60 * 1000);
    await tx
      .update(contactSequenceStatus)
      .set({
        stepId: nextStep.id,
        scheduledAt: scheduleAt,
        sentAt: null,
        attempts: 0,
        status: 'pending',
        lastUpdated: now
      })
      .where(eq(contactSequenceStatus.id, task.statusId));
  } else {
    await tx
      .update(contactSequenceStatus)
      .set({
        stepId: null,
        scheduledAt: null,
        sentAt: now,
        attempts: 0,
        status: 'sent',
        lastUpdated: now
      })
      .where(eq(contactSequenceStatus.id, task.statusId));
  }
}

async function handleFailure(
  tx: any,
  task: PendingDelivery,
  now: Date,
  error: string,
  previousAttempts: number,
  options: { allowRetry?: boolean } = {}
) {
  const attemptNumber = previousAttempts + 1;
  const shouldRetry = options.allowRetry !== false && attemptNumber < MAX_SEND_ATTEMPTS;

  await tx.insert(deliveryLogs).values({
    contactId: task.contactId,
    sequenceId: task.sequenceId,
    stepId: task.stepId,
    status: shouldRetry ? 'retrying' : 'failed',
    messageId: null,
    errorMessage: error,
    attempts: attemptNumber,
    createdAt: now
  });

  if (shouldRetry) {
    const retryAt = new Date(now.getTime() + RETRY_DELAY_MINUTES * 60 * 1000);
    await tx
      .update(contactSequenceStatus)
      .set({
        attempts: attemptNumber,
        scheduledAt: retryAt,
        lastUpdated: now
      })
      .where(eq(contactSequenceStatus.id, task.statusId));
  } else {
    await tx
      .update(contactSequenceStatus)
      .set({
        attempts: attemptNumber,
        status: 'failed',
        scheduledAt: null,
        lastUpdated: now
      })
      .where(eq(contactSequenceStatus.id, task.statusId));
  }

  return { retried: shouldRetry };
}
