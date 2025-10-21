import { desc, and, eq, isNull, inArray, sql, gte, lte } from 'drizzle-orm';
import { db } from './drizzle';
import { aggregateSequenceRows, type StepSummary, type RawSequenceRow } from './aggregator';
import {
  activityLogs,
  senders,
  teamMembers,
  teams,
  users,
  contacts,
  sequences,
  sequenceSteps,
  contactSequenceStatus,
  deliveryLogs,
  type SenderStatus,
  type SequenceDeliveryStatus,
  type SequenceLifecycleStatus
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { normalizeTags } from '@/lib/validation/contact';
import { computeScheduledUtc, type SequenceScheduleOptions } from '@/lib/timezone';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getTeamByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  return result?.team || null;
}

export async function getSendersForTeam(teamId: number) {
  return await db
    .select()
    .from(senders)
    .where(eq(senders.teamId, teamId))
    .orderBy(desc(senders.createdAt));
}

export async function findSenderByEmail(teamId: number, email: string) {
  const result = await db
    .select()
    .from(senders)
    .where(and(eq(senders.teamId, teamId), eq(senders.email, email)))
    .limit(1);

  return result[0] || null;
}

export async function getSenderForTeam(teamId: number, senderId: number) {
  return await db
    .select()
    .from(senders)
    .where(and(eq(senders.teamId, teamId), eq(senders.id, senderId)))
    .limit(1)
    .then((rows) => rows[0] || null);
}

type DatabaseClient = typeof db;

export async function getPreferredSenderForTeam(teamId: number, client: DatabaseClient | any = db) {
  const statusPriority = sql<number>`CASE WHEN ${senders.status} = 'verified' THEN 2 WHEN ${senders.status} = 'active' THEN 1 ELSE 0 END`;

  const [sender] = await client
    .select({
      id: senders.id,
      name: senders.name,
      email: senders.email,
      host: senders.host,
      port: senders.port,
      username: senders.username,
      password: senders.password,
      status: senders.status
    })
    .from(senders)
    .where(and(eq(senders.teamId, teamId), inArray(senders.status, ['verified', 'active'])))
    .orderBy(desc(statusPriority), desc(senders.createdAt))
    .limit(1);

  return sender ?? null;
}

export async function updateSenderStatus(
  teamId: number,
  senderId: number,
  status: SenderStatus
) {
  const [updated] = await db
    .update(senders)
    .set({ status })
    .where(and(eq(senders.id, senderId), eq(senders.teamId, teamId)))
    .returning();

  return updated || null;
}

export async function deleteSender(teamId: number, senderId: number) {
  await db
    .delete(senders)
    .where(and(eq(senders.id, senderId), eq(senders.teamId, teamId)));
}

export async function addSender(
  teamId: number,
  data: {
    name: string;
    email: string;
    host: string;
    port: number;
    username: string;
    password: string;
    status?: string;
  }
) {
  const [inserted] = await db
    .insert(senders)
    .values({
      teamId,
      name: data.name,
      email: data.email,
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
      status: data.status ?? 'active'
    })
    .returning();

  return inserted;
}

export type ContactFilters = {
  search?: string;
  tag?: string;
};

export async function getContactsForTeam(teamId: number, filters: ContactFilters = {}) {
  const conditions = [eq(contacts.teamId, teamId)];

  if (filters.search) {
    const searchTerm = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(
        lower(${contacts.firstName}) LIKE ${searchTerm} OR
        lower(${contacts.lastName}) LIKE ${searchTerm} OR
        lower(${contacts.email}) LIKE ${searchTerm} OR
        lower(${contacts.company}) LIKE ${searchTerm}
      )`
    );
  }

  if (filters.tag) {
    const tagValue = filters.tag.trim();
    if (tagValue.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(${contacts.tags}) AS tag
          WHERE lower(tag) = lower(${tagValue})
        )`
      );
    }
  }

  const whereCondition = conditions.length > 1 ? and(...conditions) : conditions[0];

  return await db
    .select()
    .from(contacts)
    .where(whereCondition)
    .orderBy(desc(contacts.createdAt));
}

export async function updateContact(
  teamId: number,
  contactId: string,
  data: {
    firstName?: string;
    lastName?: string;
    company?: string;
    timezone?: string | null;
    tags?: string[];
  }
) {
  const updatePayload: Partial<{
    firstName: string;
    lastName: string;
    company: string;
    timezone: string | null;
    tags: string[];
  }> = {};

  if (typeof data.firstName === 'string') {
    updatePayload.firstName = data.firstName;
  }
  if (typeof data.lastName === 'string') {
    updatePayload.lastName = data.lastName;
  }
  if (typeof data.company === 'string') {
    updatePayload.company = data.company;
  }
  if (typeof data.timezone === 'string' || data.timezone === null) {
    updatePayload.timezone = data.timezone ?? null;
  }
  if (Array.isArray(data.tags)) {
    updatePayload.tags = data.tags;
  }

  if (Object.keys(updatePayload).length === 0) {
    return null;
  }

  const [updated] = await db
    .update(contacts)
    .set(updatePayload)
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .returning();

  return updated ?? null;
}

export async function deleteContact(teamId: number, contactId: string) {
  const result = await db
    .delete(contacts)
    .where(and(eq(contacts.teamId, teamId), eq(contacts.id, contactId)))
    .returning({ id: contacts.id });

  return result.length;
}

export async function bulkDeleteContacts(teamId: number, contactIds: string[]) {
  if (contactIds.length === 0) {
    return 0;
  }

  const result = await db
    .delete(contacts)
    .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, contactIds)))
    .returning({ id: contacts.id });

  return result.length;
}

export type SequenceStepInput = {
  id?: string | null;
  subject: string;
  body: string;
  delay: number;
  order: number;
  skipIfReplied: boolean;
  skipIfBounced: boolean;
  delayIfReplied: number | null;
};

export async function listSequencesForTeam(teamId: number) {
  return await db
    .select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      senderId: sequences.senderId,
      sender: {
        id: senders.id,
        name: senders.name,
        email: senders.email,
        status: senders.status
      },
      createdAt: sequences.createdAt,
      updatedAt: sequences.updatedAt,
      stepCount: sql<number>`COALESCE(count(${sequenceSteps.id}), 0)`
    })
    .from(sequences)
    .leftJoin(sequenceSteps, eq(sequenceSteps.sequenceId, sequences.id))
    .leftJoin(senders, eq(senders.id, sequences.senderId))
    .where(eq(sequences.teamId, teamId))
    .groupBy(
      sequences.id,
      senders.id,
      senders.name,
      senders.email,
      senders.status
    )
    .orderBy(desc(sequences.updatedAt));
}

type SequenceWithStepsInternal = {
  id: string;
  name: string;
  status: SequenceLifecycleStatus;
  senderId: number | null;
  sender: {
    id: number;
    name: string;
    email: string;
    status: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    subject: string;
    body: string;
    delayHours: number;
    order: number;
    skipIfReplied: boolean;
    skipIfBounced: boolean;
    delayIfReplied: number | null;
  }>;
};

async function getSequenceWithStepsInternal(
  sequenceId: string,
  teamId: number,
  client = db
): Promise<SequenceWithStepsInternal | null> {
  const rows = await client
    .select({
      id: sequences.id,
      name: sequences.name,
  status: sequences.status,
      senderId: sequences.senderId,
      senderName: senders.name,
      senderEmail: senders.email,
      senderStatus: senders.status,
      senderInternalId: senders.id,
      createdAt: sequences.createdAt,
      updatedAt: sequences.updatedAt,
      stepId: sequenceSteps.id,
      subject: sequenceSteps.subject,
      body: sequenceSteps.body,
      delayHours: sequenceSteps.delayHours,
  order: sequenceSteps.order,
  skipIfReplied: sequenceSteps.skipIfReplied,
  skipIfBounced: sequenceSteps.skipIfBounced,
  delayIfReplied: sequenceSteps.delayIfReplied
    })
  .from(sequences)
  .leftJoin(sequenceSteps, eq(sequenceSteps.sequenceId, sequences.id))
  .leftJoin(senders, eq(senders.id, sequences.senderId))
    .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
    .orderBy(sequenceSteps.order);

  if (rows.length === 0) {
    return null;
  }

  const [first] = rows;

  const sequence: SequenceWithStepsInternal = {
    id: first.id,
    name: first.name,
    status: first.status,
    senderId: first.senderId ?? null,
    sender:
      first.senderInternalId && first.senderName && first.senderEmail
        ? {
            id: first.senderInternalId,
            name: first.senderName,
            email: first.senderEmail,
            status: first.senderStatus ?? 'inactive'
          }
        : null,
    createdAt: first.createdAt,
    updatedAt: first.updatedAt,
    steps: rows
      .filter((row) => row.stepId !== null)
      .map((row) => ({
        id: row.stepId!,
        subject: row.subject ?? '',
        body: row.body ?? '',
        delayHours: row.delayHours ?? 0,
        order: row.order ?? 0,
        skipIfReplied: row.skipIfReplied ?? false,
        skipIfBounced: row.skipIfBounced ?? false,
        delayIfReplied: row.delayIfReplied ?? null
      }))
  };

  return sequence;
}

export async function getSequenceWithSteps(teamId: number, sequenceId: string) {
  return await getSequenceWithStepsInternal(sequenceId, teamId);
}

export async function getSequenceStepForTeam(
  teamId: number,
  sequenceId: string,
  stepId: string
) {
  const [step] = await db
    .select({
      id: sequenceSteps.id,
      sequenceId: sequenceSteps.sequenceId,
      subject: sequenceSteps.subject,
      body: sequenceSteps.body,
      order: sequenceSteps.order,
      sequenceName: sequences.name,
      sequenceSenderId: sequences.senderId,
      senderId: senders.id,
      senderName: senders.name,
      senderEmail: senders.email,
      senderStatus: senders.status,
      senderHost: senders.host,
      senderPort: senders.port,
      senderUsername: senders.username,
      senderPassword: senders.password
    })
    .from(sequenceSteps)
    .innerJoin(sequences, eq(sequenceSteps.sequenceId, sequences.id))
    .leftJoin(senders, eq(sequences.senderId, senders.id))
    .where(
      and(
        eq(sequenceSteps.id, stepId),
        eq(sequenceSteps.sequenceId, sequenceId),
        eq(sequences.teamId, teamId)
      )
    )
    .limit(1);

  return step ?? null;
}

export type SequenceStatusContact = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  timezone: string | null;
  status: SequenceDeliveryStatus;
  lastUpdated: Date;
  stepOrder: number | null;
  stepSubject: string | null;
  stepId: string | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  attempts: number;
  replyAt: Date | null;
  bounceAt: Date | null;
  skippedAt: Date | null;
  scheduleMode: 'fixed' | 'window' | null;
  scheduleSendTime: string | null;
  scheduleWindowStart: string | null;
  scheduleWindowEnd: string | null;
  scheduleRespectTimezone: boolean;
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

export type SequenceStatusResult = {
  sequence: {
    id: string;
    name: string;
    status: SequenceLifecycleStatus;
    senderId: number | null;
    sender: {
      id: number;
      name: string;
      email: string;
      status: string;
    } | null;
    createdAt: Date;
    updatedAt: Date;
  };
  summary: SequenceStatusSummary;
  contacts: SequenceStatusContact[];
  steps: StepSummary[];
  worker: SequenceWorkerSnapshot;
};

export type SequenceWorkerSnapshot = {
  queueSize: number;
  lastRunAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
};

async function buildSequenceWorkerSnapshot(sequenceId: string, queueSizeOverride?: number): Promise<SequenceWorkerSnapshot> {
  // Basic snapshot implementation: use provided queue size (from aggregation) and leave timestamps/errors null.
  // This can be extended later to query a worker status table or job queue for real metrics.
  const queueSize = typeof queueSizeOverride === 'number' ? queueSizeOverride : 0;

  return {
    queueSize,
    lastRunAt: null,
    lastFailureAt: null,
    lastError: null
  };
}

export async function getSequenceStatusForTeam(
  teamId: number,
  sequenceId: string
): Promise<SequenceStatusResult | null> {
  const sequenceRow = await db
    .select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      senderId: sequences.senderId,
      senderInternalId: senders.id,
      senderName: senders.name,
      senderEmail: senders.email,
      senderStatus: senders.status,
      createdAt: sequences.createdAt,
      updatedAt: sequences.updatedAt
    })
    .from(sequences)
    .leftJoin(senders, eq(senders.id, sequences.senderId))
    .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
    .limit(1);

  if (sequenceRow.length === 0) {
    return null;
  }

  const sequenceMeta = sequenceRow[0];

  const runSequenceStatusQuery = () =>
    db
      .select({
        id: contactSequenceStatus.id,
        contactId: contactSequenceStatus.contactId,
        status: contactSequenceStatus.status,
        lastUpdated: contactSequenceStatus.lastUpdated,
        scheduledAt: contactSequenceStatus.scheduledAt,
        sentAt: contactSequenceStatus.sentAt,
        attempts: contactSequenceStatus.attempts,
        replyAt: contactSequenceStatus.replyAt,
        bounceAt: contactSequenceStatus.bounceAt,
        skippedAt: contactSequenceStatus.skippedAt,
  scheduleMode: contactSequenceStatus.scheduleMode,
  scheduleSendTime: contactSequenceStatus.scheduleSendTime,
  scheduleWindowStart: contactSequenceStatus.scheduleWindowStart,
  scheduleWindowEnd: contactSequenceStatus.scheduleWindowEnd,
  scheduleRespectTimezone: contactSequenceStatus.scheduleRespectTimezone,
  scheduleFallbackTimezone: contactSequenceStatus.scheduleFallbackTimezone,
        stepOrder: sequenceSteps.order,
        stepSubject: sequenceSteps.subject,
        stepId: sequenceSteps.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        company: contacts.company,
        timezone: contacts.timezone
      })
      .from(contactSequenceStatus)
      .innerJoin(contacts, eq(contactSequenceStatus.contactId, contacts.id))
      .leftJoin(sequenceSteps, eq(contactSequenceStatus.stepId, sequenceSteps.id))
      .where(and(eq(contactSequenceStatus.sequenceId, sequenceId), eq(contacts.teamId, teamId)))
      .orderBy(desc(contactSequenceStatus.lastUpdated));

  let rows: Awaited<ReturnType<typeof runSequenceStatusQuery>>;
  try {
    rows = await runSequenceStatusQuery();
  } catch (error) {
    const isMissingSkippedColumn =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '42703' &&
      'message' in error &&
      typeof (error as { message?: string }).message === 'string' &&
      (error as { message?: string }).message?.includes('skipped_at');

    if (!isMissingSkippedColumn) {
      throw error;
    }

    // Auto-heal older databases that are missing the skipped_at column.
    await db.execute(sql`ALTER TABLE contact_sequence_status ADD COLUMN IF NOT EXISTS skipped_at timestamp`);
    rows = await runSequenceStatusQuery();
  }

  // Normalize scheduleMode values to the exact union expected by the aggregator
  const normalizedRows = rows.map((r) => ({
    ...r,
    scheduleMode:
      r.scheduleMode === 'fixed' || r.scheduleMode === 'window' ? r.scheduleMode : null
  }));

  const aggregated = aggregateSequenceRows(normalizedRows as RawSequenceRow[]);

  return {
    sequence: {
      id: sequenceMeta.id,
      name: sequenceMeta.name,
      status: sequenceMeta.status,
      senderId: sequenceMeta.senderId ?? null,
      sender:
        sequenceMeta.senderInternalId && sequenceMeta.senderName && sequenceMeta.senderEmail
          ? {
              id: sequenceMeta.senderInternalId,
              name: sequenceMeta.senderName,
              email: sequenceMeta.senderEmail,
              status: sequenceMeta.senderStatus ?? 'inactive'
            }
          : null,
      createdAt: sequenceMeta.createdAt,
      updatedAt: sequenceMeta.updatedAt
    },
    summary: aggregated.summary,
    contacts: aggregated.contacts,
    steps: aggregated.steps,
    worker: await buildSequenceWorkerSnapshot(sequenceId, aggregated.summary.pending)
  };

}

type SequenceEventTarget = {
  contactId: string;
  sequenceId: string;
  statusId: string;
  currentStatus: SequenceDeliveryStatus;
  currentStepId: string | null;
  lastSentStepId: string | null;
  replyAt: Date | null;
  bounceAt: Date | null;
};

export type SequenceInboundEvent = {
  type: 'reply' | 'bounce';
  messageId: string | null;
  contactId: string | null;
  sequenceId: string | null;
  occurredAt: Date | null;
  payload: unknown;
};

export type SequenceEventProcessingResult = {
  type: 'reply' | 'bounce';
  status: 'processed' | 'skipped';
  contactId?: string;
  sequenceId?: string;
  reason?: 'target_not_found' | 'missing_step';
};

async function findSequenceEventTarget(event: SequenceInboundEvent): Promise<SequenceEventTarget | null> {
  const messageId = event.messageId?.trim();

  if (messageId) {
    const [log] = await db
      .select({
        contactId: deliveryLogs.contactId,
        sequenceId: deliveryLogs.sequenceId,
        stepId: deliveryLogs.stepId
      })
      .from(deliveryLogs)
      .where(eq(deliveryLogs.messageId, messageId))
      .orderBy(desc(deliveryLogs.createdAt))
      .limit(1);

    if (log) {
      const [status] = await db
        .select({
          id: contactSequenceStatus.id,
          status: contactSequenceStatus.status,
          stepId: contactSequenceStatus.stepId,
          replyAt: contactSequenceStatus.replyAt,
          bounceAt: contactSequenceStatus.bounceAt
        })
        .from(contactSequenceStatus)
        .where(and(eq(contactSequenceStatus.contactId, log.contactId), eq(contactSequenceStatus.sequenceId, log.sequenceId)))
        .limit(1);

      if (status) {
        return {
          contactId: log.contactId,
          sequenceId: log.sequenceId,
          statusId: status.id,
          currentStatus: status.status,
          currentStepId: status.stepId,
          lastSentStepId: log.stepId,
          replyAt: status.replyAt ?? null,
          bounceAt: status.bounceAt ?? null
        };
      }
    }
  }

  const contactId = event.contactId?.trim();
  const sequenceId = event.sequenceId?.trim();

  if (contactId && sequenceId) {
    const [status] = await db
      .select({
        id: contactSequenceStatus.id,
        status: contactSequenceStatus.status,
        stepId: contactSequenceStatus.stepId,
        replyAt: contactSequenceStatus.replyAt,
        bounceAt: contactSequenceStatus.bounceAt
      })
      .from(contactSequenceStatus)
      .where(and(eq(contactSequenceStatus.contactId, contactId), eq(contactSequenceStatus.sequenceId, sequenceId)))
      .limit(1);

    if (status) {
      return {
        contactId,
        sequenceId,
        statusId: status.id,
        currentStatus: status.status,
        currentStepId: status.stepId,
        lastSentStepId: status.stepId,
        replyAt: status.replyAt ?? null,
        bounceAt: status.bounceAt ?? null
      };
    }
  }

  return null;
}

export async function recordSequenceEvents(events: SequenceInboundEvent[]): Promise<SequenceEventProcessingResult[]> {
  if (events.length === 0) {
    return [];
  }

  const results: SequenceEventProcessingResult[] = [];

  for (const event of events) {
    const occurredAt = event.occurredAt ?? new Date();
    const target = await findSequenceEventTarget(event);

    if (!target) {
      results.push({
        type: event.type,
        status: 'skipped',
        reason: 'target_not_found'
      });
      continue;
    }

    const stepId = target.lastSentStepId ?? target.currentStepId;
    if (!stepId) {
      results.push({
        type: event.type,
        status: 'skipped',
        contactId: target.contactId,
        sequenceId: target.sequenceId,
        reason: 'missing_step'
      });
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.insert(deliveryLogs).values({
        contactId: target.contactId,
        sequenceId: target.sequenceId,
        stepId,
        status: event.type === 'reply' ? 'sent' : 'failed',
        messageId: event.messageId?.trim() ?? null,
        type: event.type,
        payload: event.payload ?? null,
        createdAt: occurredAt
      });

      const updateData: Record<string, unknown> = {
        status: event.type === 'reply' ? 'replied' : 'bounced',
        stepId: null,
        scheduledAt: null,
        lastUpdated: occurredAt
      };

      if (event.type === 'reply') {
        updateData.replyAt = target.replyAt && target.replyAt > occurredAt ? target.replyAt : occurredAt;
      } else {
        updateData.bounceAt = target.bounceAt && target.bounceAt > occurredAt ? target.bounceAt : occurredAt;
      }

      await tx
        .update(contactSequenceStatus)
        .set(updateData)
        .where(eq(contactSequenceStatus.id, target.statusId));
    });

    results.push({
      type: event.type,
      status: 'processed',
      contactId: target.contactId,
      sequenceId: target.sequenceId
    });
  }

  return results;
}

export type SequenceReplyRecord = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  subject: string | null;
  snippet: string | null;
  occurredAt: Date;
  messageId: string | null;
  stepSubject: string | null;
};

export type SequenceBounceRecord = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  reason: string | null;
  detail: string | null;
  occurredAt: Date;
  messageId: string | null;
  stepSubject: string | null;
};

export type SequenceDeliveryLogRecord = {
  id: string;
  status: 'sent' | 'failed' | 'retrying';
  attempts: number;
  createdAt: Date;
  messageId: string | null;
  errorMessage: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  step: {
    id: string;
    order: number | null;
    subject: string | null;
  } | null;
};

export type SequenceDeliveryLogFilters = {
  status?: 'sent' | 'failed' | 'retrying' | 'all';
  contact?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
};

export type SequenceDeliveryLogQueryResult = {
  logs: SequenceDeliveryLogRecord[];
  total: number;
};

export async function listSequenceDeliveryLogsForTeam(
  teamId: number,
  sequenceId: string,
  filters: SequenceDeliveryLogFilters
): Promise<SequenceDeliveryLogQueryResult> {
  const conditions = [eq(deliveryLogs.sequenceId, sequenceId), eq(contacts.teamId, teamId)];

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(deliveryLogs.status, filters.status));
  }

  if (filters.contact) {
    const search = `%${filters.contact.trim().toLowerCase()}%`;
    conditions.push(
      sql`(
        lower(${contacts.firstName}) LIKE ${search} OR
        lower(${contacts.lastName}) LIKE ${search} OR
        lower(${contacts.email}) LIKE ${search}
      )`
    );
  }

  if (filters.from) {
    conditions.push(gte(deliveryLogs.createdAt, filters.from));
  }

  if (filters.to) {
    conditions.push(lte(deliveryLogs.createdAt, filters.to));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const offset = Math.max(0, (filters.page - 1) * filters.pageSize);

  const rows = await db
    .select({
      id: deliveryLogs.id,
      status: deliveryLogs.status,
      attempts: deliveryLogs.attempts,
      createdAt: deliveryLogs.createdAt,
      messageId: deliveryLogs.messageId,
      errorMessage: deliveryLogs.errorMessage,
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      stepId: deliveryLogs.stepId,
      stepOrder: sequenceSteps.order,
      stepSubject: sequenceSteps.subject
    })
    .from(deliveryLogs)
    .innerJoin(contacts, eq(deliveryLogs.contactId, contacts.id))
    .leftJoin(sequenceSteps, eq(deliveryLogs.stepId, sequenceSteps.id))
    .where(whereClause)
    .orderBy(desc(deliveryLogs.createdAt))
    .limit(filters.pageSize)
    .offset(offset);

  const totalResult = await db
    .select({ value: sql<number>`count(*)` })
    .from(deliveryLogs)
    .innerJoin(contacts, eq(deliveryLogs.contactId, contacts.id))
    .where(whereClause);

  const logs: SequenceDeliveryLogRecord[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
    attempts: row.attempts ?? 0,
    createdAt: row.createdAt,
    messageId: row.messageId ?? null,
    errorMessage: row.errorMessage ?? null,
    contact: {
      id: row.contactId,
      firstName: row.contactFirstName ?? null,
      lastName: row.contactLastName ?? null,
      email: row.contactEmail
    },
    step: row.stepId
      ? {
          id: row.stepId,
          order: row.stepOrder ?? null,
          subject: row.stepSubject ?? null
        }
      : null
  }));

  return {
    logs,
    total: totalResult[0]?.value ?? 0
  };
}

export async function listSequenceRepliesForTeam(teamId: number, sequenceId: string, limit = 20): Promise<SequenceReplyRecord[]> {
  const rows = await db
    .select({
      id: deliveryLogs.id,
      contactId: deliveryLogs.contactId,
      messageId: deliveryLogs.messageId,
      payload: deliveryLogs.payload,
      createdAt: deliveryLogs.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      company: contacts.company,
      stepSubject: sequenceSteps.subject
    })
    .from(deliveryLogs)
    .innerJoin(contacts, eq(deliveryLogs.contactId, contacts.id))
    .leftJoin(sequenceSteps, eq(deliveryLogs.stepId, sequenceSteps.id))
    .where(and(eq(deliveryLogs.sequenceId, sequenceId), eq(deliveryLogs.type, 'reply'), eq(contacts.teamId, teamId)))
    .orderBy(desc(deliveryLogs.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const subject = typeof payload.subject === 'string' ? payload.subject : null;
    const snippet = typeof payload.snippet === 'string' ? payload.snippet : typeof payload.text === 'string' ? payload.text : null;

    return {
      id: row.id,
      contactId: row.contactId,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      email: row.email,
      company: row.company ?? null,
      subject,
      snippet,
      occurredAt: row.createdAt,
      messageId: row.messageId ?? null,
      stepSubject: row.stepSubject ?? null
    } satisfies SequenceReplyRecord;
  });
}

export async function listSequenceBouncesForTeam(teamId: number, sequenceId: string, limit = 20): Promise<SequenceBounceRecord[]> {
  const rows = await db
    .select({
      id: deliveryLogs.id,
      contactId: deliveryLogs.contactId,
      messageId: deliveryLogs.messageId,
      payload: deliveryLogs.payload,
      createdAt: deliveryLogs.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      company: contacts.company,
      stepSubject: sequenceSteps.subject
    })
    .from(deliveryLogs)
    .innerJoin(contacts, eq(deliveryLogs.contactId, contacts.id))
    .leftJoin(sequenceSteps, eq(deliveryLogs.stepId, sequenceSteps.id))
    .where(and(eq(deliveryLogs.sequenceId, sequenceId), eq(deliveryLogs.type, 'bounce'), eq(contacts.teamId, teamId)))
    .orderBy(desc(deliveryLogs.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const reason = typeof payload.reason === 'string' ? payload.reason : typeof payload.type === 'string' ? payload.type : null;
    const detail = typeof payload.detail === 'string' ? payload.detail : typeof payload.description === 'string' ? payload.description : null;

    return {
      id: row.id,
      contactId: row.contactId,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      email: row.email,
      company: row.company ?? null,
      reason,
      detail,
      occurredAt: row.createdAt,
      messageId: row.messageId ?? null,
      stepSubject: row.stepSubject ?? null
    } satisfies SequenceBounceRecord;
  });
}

export async function createSequence(
  teamId: number,
  userId: number,
  data: { name: string; senderId: number | null; steps: SequenceStepInput[] }
) {
  const sequenceId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(sequences)
      .values({
        teamId,
        userId,
        name: data.name,
        senderId: data.senderId ?? null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning({ id: sequences.id });

    if (!inserted) {
      throw new Error('Failed to create sequence');
    }

    if (data.steps.length > 0) {
      await tx.insert(sequenceSteps).values(
        data.steps.map((step) => ({
          sequenceId: inserted.id,
          order: step.order,
          subject: step.subject,
          body: step.body,
          delayHours: step.delay,
          skipIfReplied: step.skipIfReplied,
          skipIfBounced: step.skipIfBounced,
          delayIfReplied: step.delayIfReplied
        }))
      );
    }

    return inserted.id;
  });

  return await getSequenceWithSteps(teamId, sequenceId);
}

export async function updateSequence(
  teamId: number,
  sequenceId: string,
  data: { name: string; senderId: number | null; steps: SequenceStepInput[] }
) {
  const updatedId = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
      .limit(1);

    if (existing.length === 0) {
      return null;
    }

    await tx
      .update(sequences)
      .set({
        name: data.name,
        senderId: data.senderId ?? null,
        updatedAt: new Date()
      })
      .where(eq(sequences.id, sequenceId));

    const existingSteps = await tx
      .select({ id: sequenceSteps.id })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId));

    const existingIds = new Set(existingSteps.map((step) => step.id));

    const normalisedSteps = data.steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((step, index) => ({
        id: step.id ?? undefined,
        subject: step.subject,
        body: step.body,
        delay: step.delay,
        skipIfReplied: step.skipIfReplied,
        skipIfBounced: step.skipIfBounced,
        delayIfReplied: step.delayIfReplied,
        order: index + 1
      }));

    const incomingIds = new Set(normalisedSteps.filter((step) => step.id).map((step) => step.id!));
    const idsToDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));

    if (idsToDelete.length > 0) {
      await tx
        .delete(sequenceSteps)
        .where(and(eq(sequenceSteps.sequenceId, sequenceId), inArray(sequenceSteps.id, idsToDelete)));
    }

    for (const step of normalisedSteps) {
      if (step.id && existingIds.has(step.id)) {
        await tx
          .update(sequenceSteps)
          .set({
            order: step.order,
            subject: step.subject,
            body: step.body,
            delayHours: step.delay,
            skipIfReplied: step.skipIfReplied,
            skipIfBounced: step.skipIfBounced,
            delayIfReplied: step.delayIfReplied,
            updatedAt: new Date()
          })
          .where(and(eq(sequenceSteps.id, step.id), eq(sequenceSteps.sequenceId, sequenceId)));
      } else {
        await tx.insert(sequenceSteps).values({
          sequenceId,
          order: step.order,
          subject: step.subject,
          body: step.body,
          delayHours: step.delay,
          skipIfReplied: step.skipIfReplied,
          skipIfBounced: step.skipIfBounced,
          delayIfReplied: step.delayIfReplied
        });
      }
    }

    return sequenceId;
  });

  if (!updatedId) {
    return null;
  }

  return await getSequenceWithSteps(teamId, updatedId);
}

export async function setSequenceLifecycleStatus(
  teamId: number,
  sequenceId: string,
  status: SequenceLifecycleStatus
) {
  const [updated] = await db
    .update(sequences)
    .set({
      status,
      updatedAt: new Date()
    })
    .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
    .returning({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      createdAt: sequences.createdAt,
      updatedAt: sequences.updatedAt
    });

  return updated ?? null;
}

export type SequenceEnrollmentResult = {
  enrolled: number;
  skipped: number;
};

const ENROLLMENT_ERROR_CODES = ['sequence_not_found', 'sequence_has_no_steps', 'contacts_not_found', 'sequence_paused'] as const;
export type SequenceEnrollmentErrorCode = (typeof ENROLLMENT_ERROR_CODES)[number];

export class SequenceEnrollmentError extends Error {
  code: SequenceEnrollmentErrorCode;

  constructor(code: SequenceEnrollmentErrorCode, message: string) {
    super(message);
    this.name = 'SequenceEnrollmentError';
    this.code = code;
  }
}

export async function enrollContactsInSequence(
  teamId: number,
  sequenceId: string,
  contactIds: string[],
  scheduleOptions?: SequenceScheduleOptions | null
): Promise<SequenceEnrollmentResult> {
  const uniqueContactIds = Array.from(new Set(contactIds)).filter((id) => typeof id === 'string' && id.length > 0);

  if (uniqueContactIds.length === 0) {
    return { enrolled: 0, skipped: 0 } as const;
  }

  return await db.transaction(async (tx) => {
    const sequenceRows = await tx
      .select({ id: sequences.id, ownerId: sequences.userId, status: sequences.status })
      .from(sequences)
      .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
      .limit(1);

    if (sequenceRows.length === 0) {
      throw new SequenceEnrollmentError('sequence_not_found', 'Sequence not found for this workspace');
    }
    const sequenceRow = sequenceRows[0];

    if (sequenceRow.status === 'paused') {
      throw new SequenceEnrollmentError('sequence_paused', 'Sequence is paused and cannot accept enrollments');
    }

    const [firstStep] = await tx
      .select({ id: sequenceSteps.id, delayHours: sequenceSteps.delayHours })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.order)
      .limit(1);

    if (!firstStep) {
      throw new SequenceEnrollmentError('sequence_has_no_steps', 'Add at least one step before enrolling contacts');
    }

    const contactRows = await tx
      .select({ id: contacts.id, timezone: contacts.timezone })
      .from(contacts)
      .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, uniqueContactIds)));

    if (contactRows.length !== uniqueContactIds.length) {
      throw new SequenceEnrollmentError('contacts_not_found', 'One or more contacts could not be found in this workspace');
    }

    if (contactRows.length === 0) {
      return { enrolled: 0, skipped: 0 } as const;
    }

    const now = new Date();
    const stepDelayHours = firstStep?.delayHours ?? 0;

    let fallbackTimezone = 'UTC';
    if (scheduleOptions) {
      const [owner] = await tx
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, sequenceRow.ownerId))
        .limit(1);

      fallbackTimezone = owner?.timezone ?? 'UTC';
    }

    const rowsToInsert = contactRows.map((contact) => {
      const scheduledAt = scheduleOptions
        ? computeScheduledUtc({
            now,
            stepDelayHours,
            contactTimezone: contact.timezone,
            fallbackTimezone,
            schedule: scheduleOptions
          })
        : new Date(now.getTime() + stepDelayHours * 60 * 60 * 1000);

      return {
        contactId: contact.id,
        sequenceId,
        stepId: firstStep.id,
        status: 'pending' as SequenceDeliveryStatus,
        scheduledAt,
        scheduleMode: scheduleOptions?.mode ?? null,
        scheduleSendTime: scheduleOptions?.mode === 'fixed' ? scheduleOptions.sendTime : null,
        scheduleWindowStart: scheduleOptions?.mode === 'window' ? scheduleOptions.sendWindowStart : null,
        scheduleWindowEnd: scheduleOptions?.mode === 'window' ? scheduleOptions.sendWindowEnd : null,
        scheduleRespectTimezone: scheduleOptions?.respectContactTimezone ?? true,
        scheduleFallbackTimezone: scheduleOptions ? fallbackTimezone : null,
        sentAt: null,
        attempts: 0,
        lastUpdated: now
      };
    });

    const inserted = await tx
      .insert(contactSequenceStatus)
      .values(rowsToInsert)
      .onConflictDoNothing({
        target: [contactSequenceStatus.contactId, contactSequenceStatus.sequenceId]
      })
      .returning({ id: contactSequenceStatus.id });

    return {
      enrolled: inserted.length,
      skipped: rowsToInsert.length - inserted.length
    } as const;
  });
}

export async function addTagsToContacts(
  teamId: number,
  contactIds: string[],
  tags: string[]
) {
  if (contactIds.length === 0) {
    return { updated: 0, applied: 0 } as const;
  }

  const tagsToAdd = normalizeTags(tags);
  if (tagsToAdd.length === 0) {
    return { updated: 0, applied: 0 } as const;
  }

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: contacts.id, tags: contacts.tags })
      .from(contacts)
      .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, contactIds)));

    if (existing.length === 0) {
      return { updated: 0, applied: 0 } as const;
    }

    let updated = 0;
    let applied = 0;

    for (const contact of existing) {
      const currentTags = Array.isArray(contact.tags)
        ? contact.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];

      const seen = new Set<string>();
      currentTags.forEach((tag) => {
        if (typeof tag === 'string') {
          const normalised = tag.trim().toLowerCase();
          if (normalised.length > 0) {
            seen.add(normalised);
          }
        }
      });

      const newTags: string[] = [];
      for (const tag of tagsToAdd) {
        const trimmed = tag.trim();
        if (!trimmed) {
          continue;
        }
        const key = trimmed.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        newTags.push(trimmed);
      }

      if (newTags.length === 0) {
        continue;
      }

      await tx
        .update(contacts)
        .set({ tags: [...currentTags, ...newTags] })
        .where(and(eq(contacts.id, contact.id), eq(contacts.teamId, teamId)));

      updated += 1;
      applied += newTags.length;
    }

    return { updated, applied } as const;
  });
}
export async function insertContacts(
  teamId: number,
  rows: Array<{
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    tags: string[];
    timezone?: string | null;
  }>
) {
  if (rows.length === 0) {
    return 0;
  }

  const result = await db
    .insert(contacts)
    .values(
      rows.map((row) => ({
        teamId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        company: row.company,
        timezone: row.timezone ?? null,
        tags: row.tags
      }))
    )
    .onConflictDoNothing({
      target: [contacts.teamId, contacts.email]
    })
    .returning({ id: contacts.id });

  return result.length;
}

export async function getDistinctContactTags(teamId: number) {
  const result = await db.execute<{ tag: string | null }>(sql`
    SELECT DISTINCT NULLIF(trim(tag), '') AS tag
    FROM contacts, jsonb_array_elements_text(contacts.tags) AS tag
    WHERE contacts.team_id = ${teamId}
    ORDER BY tag ASC
  `);

  return Array.from(result)
    .map((row) => row.tag)
    .filter((tag): tag is string => Boolean(tag));
}

export async function updateContactForTeam(
  teamId: number,
  contactId: string,
  data: {
    firstName: string;
    lastName: string;
    company: string;
    timezone?: string | null;
    tags: string[];
  }
) {
  const [updated] = await db
    .update(contacts)
    .set({
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      timezone: data.timezone ?? null,
      tags: data.tags
    })
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .returning();

  return updated || null;
}

export async function deleteContactForTeam(teamId: number, contactId: string) {
  const [deleted] = await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .returning({ id: contacts.id });

  return deleted ?? null;
}

export async function bulkDeleteContactsForTeam(teamId: number, contactIds: string[]) {
  if (contactIds.length === 0) {
    return 0;
  }

  const deleted = await db
    .delete(contacts)
    .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, contactIds)))
    .returning({ id: contacts.id });

  return deleted.length;
}
