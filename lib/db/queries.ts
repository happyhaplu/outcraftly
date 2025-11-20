import { desc, and, eq, isNull, isNotNull, inArray, sql, gte, lte, asc, type SQL } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { db } from './drizzle';
import { aggregateSequenceRows, type StepSummary, type RawSequenceRow } from './aggregator';
import { DEFAULT_PLAN_USAGE_LIMITS, DEFAULT_USER_PLAN, type UserPlan } from '@/lib/config/plans';
import {
  activityLogs,
  senders,
  teamMembers,
  plans,
  teams,
  users,
  contacts,
  teamUsageLimits,
  sequences,
  sequenceSteps,
  contactCustomFieldDefinitions,
  contactCustomFieldValues,
  contactSequenceStatus,
  deliveryLogs,
  deliveryStatusEnum,
  paymentStatusEnum,
  type Sender,
  type SenderStatus,
  type SequenceDeliveryStatus,
  type SequenceLifecycleStatus,
  type User
} from './schema';
import { verifyToken } from '@/lib/auth/session';
import { normalizeTags } from '@/lib/validation/contact';
import { computeScheduledUtc, type SequenceScheduleOptions } from '@/lib/timezone';

type SequenceLifecycleTransition = SequenceLifecycleStatus | 'deleted';

export const TRIAL_EXPIRED_ERROR_MESSAGE = 'Your trial has expired. Please upgrade to continue using Outcraftly.';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRIAL_DURATION_DAYS = 14;

const isBuildPhase = () => process.env.NEXT_PHASE === 'phase-production-build';
type CookieStore = Awaited<ReturnType<typeof cookies>>;

async function getCookieStore(): Promise<CookieStore | null> {
  try {
    return await cookies();
  } catch (error) {
    if (isBuildPhase() || process.env.NODE_ENV === 'test') {
      return null;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] Unable to access cookies outside a request context', error);
    }

    return null;
  }
}

export function calculateTrialExpiry(from: Date | string = new Date(), durationInDays = DEFAULT_TRIAL_DURATION_DAYS): Date {
  const base = from instanceof Date ? from : new Date(from ?? Date.now());
  const start = Number.isNaN(base.getTime()) ? new Date() : base;
  const days = Number.isFinite(durationInDays) && durationInDays > 0 ? durationInDays : DEFAULT_TRIAL_DURATION_DAYS;
  return new Date(start.getTime() + days * DAY_IN_MS);
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class InactiveTrialError extends Error {
  constructor(message = TRIAL_EXPIRED_ERROR_MESSAGE) {
    super(message);
    this.name = 'InactiveTrialError';
  }
}

export type PlanLimitResource = 'prospects' | 'emails' | 'credits';

export class PlanLimitExceededError extends Error {
  resource: PlanLimitResource;
  limit: number;
  remaining: number;

  constructor(resource: PlanLimitResource, limit: number, remaining: number) {
    super(`Plan limit exceeded for ${resource}`);
    this.name = 'PlanLimitExceededError';
    this.resource = resource;
    this.limit = limit;
    this.remaining = remaining;
  }
}

export class InvalidCustomFieldValueError extends Error {
  fieldId: string;

  constructor(fieldId: string, message: string) {
    super(message);
    this.name = 'InvalidCustomFieldValueError';
    this.fieldId = fieldId;
  }
}

const hasTrialExpired = (user: Pick<User, 'trialExpiresAt'>) => {
  if (!user.trialExpiresAt) {
    return false;
  }

  const expiryDate = user.trialExpiresAt instanceof Date ? user.trialExpiresAt : new Date(user.trialExpiresAt);
  if (Number.isNaN(expiryDate.getTime())) {
    return false;
  }

  return expiryDate.getTime() <= Date.now();
};

export async function countSequenceReplies(sequenceId: string): Promise<number> {
  if (!sequenceId) {
    return 0;
  }

  const [result] = await db
    .select({
      replyCount: sql<number>`COALESCE(COUNT(DISTINCT CASE
        WHEN ${contactSequenceStatus.status} = 'replied'
          OR ${contactSequenceStatus.replyAt} IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM ${deliveryLogs} dl
            WHERE dl.contact_id = ${contactSequenceStatus.contactId}
              AND dl.sequence_id = ${contactSequenceStatus.sequenceId}
              AND dl.type = 'reply'
          )
        THEN ${contactSequenceStatus.contactId}
        ELSE NULL
      END), 0)`
    })
    .from(contactSequenceStatus)
    .where(eq(contactSequenceStatus.sequenceId, sequenceId));

  return result?.replyCount ?? 0;
}

export async function findActiveSequenceStatuses(
  contactId: string,
  options: { sequenceIds?: string[] } = {},
  client: DatabaseClient | any = db
): Promise<Array<{ id: string; sequenceId: string; stepId: string | null; status: string }>> {
  if (!contactId) {
    return [];
  }

  const runner = client && typeof client.select === 'function' ? client : db;

  const filters = [
    eq(contactSequenceStatus.contactId, contactId),
    eq(sequences.status, 'active'),
    isNull(sequences.deletedAt)
  ];

  if (options.sequenceIds && options.sequenceIds.length > 0) {
    filters.push(inArray(contactSequenceStatus.sequenceId, options.sequenceIds));
  }

  const whereClause = filters.length === 1 ? filters[0] : and(...filters);

  return await runner
    .select({
      id: contactSequenceStatus.id,
      sequenceId: contactSequenceStatus.sequenceId,
      stepId: contactSequenceStatus.stepId,
      status: contactSequenceStatus.status
    })
    .from(contactSequenceStatus)
    .innerJoin(sequences, eq(contactSequenceStatus.sequenceId, sequences.id))
    .where(whereClause);
}

export async function syncSequenceRepliesFromLogs(
  sequenceId: string,
  client: DatabaseClient | any = db
): Promise<number> {
  if (!sequenceId) {
    return 0;
  }

  const runner = client && typeof client.execute === 'function' ? client : db;
  const selector = client && typeof client.select === 'function' ? client : db;

  if (!runner || typeof runner.execute !== 'function') {
    return 0;
  }

  const shouldDebug = process.env.NODE_ENV !== 'production';

  const [sequenceRow] = await selector
    .select({ deletedAt: sequences.deletedAt })
    .from(sequences)
    .where(eq(sequences.id, sequenceId))
    .limit(1);

  if (!sequenceRow) {
    if (shouldDebug) {
      console.info?.('[SequenceAggregator] Skipping reply sync', {
        sequenceId,
        reason: 'missing'
      });
    }
    return 0;
  }

  if (sequenceRow.deletedAt) {
    if (shouldDebug) {
      console.info?.('[SequenceAggregator] Skipping reply sync', {
        sequenceId,
        reason: 'deleted'
      });
    }
    return 0;
  }

  try {
    const hasSequenceLogsResult = await runner.execute(sql`
      SELECT to_regclass('public.sequence_logs')::text AS reg;
    `);

    const regValue = Array.isArray((hasSequenceLogsResult as any)?.rows)
      ? (hasSequenceLogsResult as any).rows[0]?.reg
      : (hasSequenceLogsResult as any)?.[0]?.reg;
    const hasSequenceLogs = typeof regValue === 'string' && regValue.length > 0;

    const replyLogsCte = hasSequenceLogs
      ? sql`
          SELECT contact_id, MAX(reply_at) AS reply_at
          FROM (
            SELECT dl.contact_id, dl.created_at AS reply_at
            FROM ${deliveryLogs} dl
            WHERE dl.sequence_id = ${sequenceId}
              AND dl.type = 'reply'
            UNION ALL
            SELECT sl.contact_id, sl.created_at AS reply_at
            FROM ${sql.raw('sequence_logs')} sl
            WHERE sl.sequence_id = ${sequenceId}
              AND sl.type = 'reply'
          ) reply_union
          GROUP BY contact_id
        `
      : sql`
          SELECT dl.contact_id, MAX(dl.created_at) AS reply_at
          FROM ${deliveryLogs} dl
          WHERE dl.sequence_id = ${sequenceId}
            AND dl.type = 'reply'
          GROUP BY dl.contact_id
        `;

    const result = await runner.execute(sql`
      WITH reply_logs AS (${replyLogsCte}),
      upserted AS (
        INSERT INTO contact_sequence_status (
          contact_id,
          sequence_id,
          status,
          reply_at,
          last_updated
        )
        SELECT
          rl.contact_id,
          ${sequenceId},
          'replied',
          rl.reply_at,
          rl.reply_at
        FROM reply_logs rl
        ON CONFLICT (contact_id, sequence_id) DO UPDATE
          SET
            status = 'replied',
            reply_at = GREATEST(COALESCE(contact_sequence_status.reply_at, TIMESTAMP 'epoch'), EXCLUDED.reply_at),
            last_updated = GREATEST(COALESCE(contact_sequence_status.last_updated, TIMESTAMP 'epoch'), EXCLUDED.reply_at)
          WHERE
            contact_sequence_status.status <> 'replied'
            OR contact_sequence_status.reply_at IS NULL
            OR contact_sequence_status.reply_at < EXCLUDED.reply_at
        RETURNING contact_id
      )
      SELECT COUNT(*)::int AS upserted_count FROM upserted;
    `);

    const rawCount = Array.isArray((result as any)?.rows)
      ? (result as any).rows[0]?.upserted_count
      : (result as any)?.[0]?.upserted_count;
    const parsed =
      typeof rawCount === 'number'
        ? rawCount
        : Number.parseInt(typeof rawCount === 'string' ? rawCount : String(rawCount ?? '0'), 10);

    const count = Number.isFinite(parsed) ? parsed : 0;

    if (shouldDebug && count > 0) {
      try {
        console.log?.('[SequenceAggregator] synced replies from logs', {
          sequenceId,
          updated: count
        });
      } catch (logError) {
        console.warn?.('[SequenceAggregator] failed to log sync result', logError);
      }
    }

    return count;
  } catch (error) {
    if (shouldDebug) {
      console.warn?.('[SequenceAggregator] failed to sync replies from logs', {
        sequenceId,
        error
      });
    }
    return 0;
  }
}

export async function syncAllSequenceRepliesForTeam(
  teamId: number,
  client: DatabaseClient | any = db
): Promise<number> {
  if (typeof teamId !== 'number' || !Number.isFinite(teamId) || teamId <= 0) {
    return 0;
  }

  const runner = client && typeof client.execute === 'function' ? client : db;
  const selector = client && typeof client.select === 'function' ? client : db;

  const shouldDebug = process.env.NODE_ENV !== 'production';

  try {
    const sequenceRows = await selector
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.teamId, teamId), isNull(sequences.deletedAt)));

    const ids = Array.isArray(sequenceRows) ? sequenceRows : [];
    let total = 0;

    for (const entry of ids) {
      if (entry && typeof entry.id === 'string' && entry.id.length > 0) {
        total += await syncSequenceRepliesFromLogs(entry.id, runner);
      }
    }

    return total;
  } catch (error) {
    if (shouldDebug) {
      console.warn?.('[SequenceAggregator] failed to sync replies for team', {
        teamId,
        error
      });
    }
    return 0;
  }
}

export async function activateScheduledSequences(
  teamId?: number,
  client: DatabaseClient | any = db
): Promise<Array<{ id: string }>> {
  const now = new Date();

  const conditions = [
    eq(sequences.status, 'draft'),
    isNull(sequences.deletedAt),
    lte(sequences.launchAt, now)
  ];

  if (typeof teamId === 'number' && Number.isFinite(teamId)) {
    conditions.push(eq(sequences.teamId, teamId));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const runner = client && typeof client.update === 'function' ? client : db;

  return await runner
    .update(sequences)
    .set({ status: 'active', launchedAt: now, updatedAt: now })
    .where(whereClause)
    .returning({ id: sequences.id });
}

export async function getUser(): Promise<User | null> {
  const cookieStore = await getCookieStore();
  if (!cookieStore) {
    return null;
  }

  const sessionCookie = cookieStore.get('session');
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

  return user[0] as User;
}

export async function getActiveUser(): Promise<User> {
  const user = await getUser();
  if (!user) {
    throw new UnauthorizedError();
  }

  if (user.status !== 'active') {
    throw new UnauthorizedError('User is inactive');
  }

  if (hasTrialExpired(user)) {
    throw new InactiveTrialError();
  }

  return user;
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

export async function getSendersForTeam(teamId: number): Promise<Sender[]> {
  return await db
    .select()
    .from(senders)
    .where(eq(senders.teamId, teamId))
    .orderBy(desc(senders.createdAt));
}

export async function findSenderByEmail(teamId: number, email: string): Promise<Sender | null> {
  const result = await db
    .select()
    .from(senders)
    .where(and(eq(senders.teamId, teamId), eq(senders.email, email)))
    .limit(1);

  return result[0] || null;
}

export async function getSenderForTeam(teamId: number, senderId: number): Promise<Sender | null> {
  return await db
    .select()
    .from(senders)
    .where(and(eq(senders.teamId, teamId), eq(senders.id, senderId)))
    .limit(1)
    .then((rows) => rows[0] || null);
}

type DatabaseClient = typeof db;
type TransactionClient = Parameters<typeof db.transaction>[0] extends (tx: infer T) => Promise<any> ? T : typeof db;
type DbExecutor = DatabaseClient | TransactionClient;
type TransactionRunner = {
  transaction: <T>(cb: (tx: DbExecutor) => Promise<T>) => Promise<T>;
};

export async function getPreferredSenderForTeam(teamId: number, client: DatabaseClient | any = db) {
  const statusPriority = sql<number>`CASE WHEN ${senders.status} = 'verified' THEN 2 WHEN ${senders.status} = 'active' THEN 1 ELSE 0 END`;

  const [sender] = await client
    .select({
      id: senders.id,
      name: senders.name,
      email: senders.email,
      host: senders.host,
      port: senders.port,
      smtpSecurity: senders.smtpSecurity,
      username: senders.username,
      password: senders.password,
      status: senders.status,
      inboundHost: senders.inboundHost,
      inboundPort: senders.inboundPort,
      inboundSecurity: senders.inboundSecurity,
      inboundProtocol: senders.inboundProtocol
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
    smtpSecurity: 'SSL/TLS' | 'STARTTLS' | 'None';
    username: string;
    password: string;
    status?: string;
    inboundHost?: string | null;
    inboundPort?: number | null;
    inboundSecurity?: 'SSL/TLS' | 'STARTTLS' | 'None' | null;
    inboundProtocol?: 'IMAP' | 'POP3' | null;
  }
): Promise<Sender> {
  const [inserted] = await db
    .insert(senders)
    .values({
      teamId,
      name: data.name,
      email: data.email,
      host: data.host,
      port: data.port,
      smtpSecurity: data.smtpSecurity,
      username: data.username,
      password: data.password,
      status: data.status ?? 'active',
      inboundHost: data.inboundHost,
      inboundPort: data.inboundPort,
      inboundSecurity: data.inboundSecurity,
      inboundProtocol: data.inboundProtocol
    })
    .returning();

  return inserted as Sender;
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

export type ContactPaginationOptions = {
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
  client?: any;
};

export type ContactPaginationResult = {
  data: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    jobTitle: string | null;
    timezone: string | null;
    tags: string[];
    createdAt: Date;
  }>;
  total: number;
  page: number;
  totalPages: number;
};

export async function getPaginatedContactsForTeam(
  teamId: number,
  options: ContactPaginationOptions = {}
): Promise<ContactPaginationResult> {
  const {
    client: providedClient,
    search,
    tag,
    page: rawPage = 1,
    limit: rawLimit = 25
  } = options;

  const client = providedClient ?? db;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 25;

  const conditions = [eq(contacts.teamId, teamId)];

  if (typeof search === 'string' && search.trim().length > 0) {
    const searchTerm = `%${search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(
        lower(${contacts.firstName}) LIKE ${searchTerm} OR
        lower(${contacts.lastName}) LIKE ${searchTerm} OR
        lower(${contacts.email}) LIKE ${searchTerm} OR
        lower(${contacts.company}) LIKE ${searchTerm}
      )`
    );
  }

  if (typeof tag === 'string' && tag.trim().length > 0) {
    const tagValue = tag.trim().toLowerCase();
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${contacts.tags}) AS tag
        WHERE lower(tag) = ${tagValue}
      )`
    );
  }

  const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions);
  const offset = Math.max(0, (page - 1) * limit);

  const rows = await client
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      company: contacts.company,
      jobTitle: contacts.jobTitle,
      timezone: contacts.timezone,
      tags: contacts.tags,
      createdAt: contacts.createdAt
    })
    .from(contacts)
    .where(whereCondition)
    .orderBy(desc(contacts.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await client
    .select({ value: sql<number>`count(*)` })
    .from(contacts)
    .where(whereCondition);

  const total = countResult[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data: rows.map((row: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      company: string;
      jobTitle: string | null;
      timezone?: string | null;
      tags: unknown;
      createdAt: Date;
    }) => {
      const mapped = {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        company: row.company,
        jobTitle: row.jobTitle ?? null,
        tags: Array.isArray(row.tags)
          ? row.tags.filter((tag: unknown): tag is string => typeof tag === 'string')
          : [],
        createdAt: row.createdAt
      } as {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        company: string;
        jobTitle: string | null;
        tags: string[];
        createdAt: Date;
        timezone?: string | null;
      };

      if (Object.prototype.hasOwnProperty.call(row, 'timezone')) {
        mapped.timezone = row.timezone ?? null;
      }

      return mapped;
    }),
    total,
    page,
    totalPages
  };
}

export async function listContactCustomFieldDefinitions(teamId: number, client: any = db) {
  return await client
    .select()
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.teamId, teamId))
    .orderBy(asc(contactCustomFieldDefinitions.name));
}

type ContactCustomFieldDefinitionInput = {
  name: string;
  key?: string | null;
  type: (typeof contactCustomFieldDefinitions.$inferInsert)['type'];
  description?: string | null;
};

function normaliseCustomFieldKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const slug = trimmed
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
  return slug.length > 0 ? slug : 'custom_field';
}

async function ensureUniqueCustomFieldKey(client: any, teamId: number, key: string): Promise<string> {
  const query = client
    .select({ key: contactCustomFieldDefinitions.key })
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.teamId, teamId));

  let rows: Array<{ key: string }>;

  if (typeof query.execute === 'function') {
    rows = await query.execute();
  } else if (typeof (query as { all?: () => Promise<Array<{ key: string }>> }).all === 'function') {
    rows = await (query as { all: () => Promise<Array<{ key: string }>> }).all();
  } else {
    const result = await query;
    rows = Array.isArray(result) ? result : [];
  }

  const existingKeys = new Set<string>(rows.map((row) => row.key));

  if (!existingKeys.has(key)) {
    return key;
  }

  const base = key.slice(0, 100);
  let suffix = 2;
  while (suffix < 1000) {
    const candidate = `${base}_${suffix}`.slice(0, 120);
    if (!existingKeys.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }

  return `${base}_${Date.now()}`.slice(0, 120);
}

export async function createContactCustomFieldDefinition(
  teamId: number,
  data: ContactCustomFieldDefinitionInput,
  client: any = db
) {
  const executor = client ?? db;
  const now = new Date();
  const userProvidedKey = typeof data.key === 'string' && data.key.trim().length > 0;
  const desiredKey = userProvidedKey ? normaliseCustomFieldKey(data.key!) : normaliseCustomFieldKey(data.name);
  const key = userProvidedKey ? desiredKey : await ensureUniqueCustomFieldKey(executor, teamId, desiredKey);

  const payload = {
    teamId,
    name: data.name.trim(),
    key,
    type: data.type,
    description: data.description ?? null,
    createdAt: now,
    updatedAt: now
  } satisfies (typeof contactCustomFieldDefinitions.$inferInsert);

  const [inserted] = await executor
    .insert(contactCustomFieldDefinitions)
    .values(payload)
    .returning();

  return inserted ?? null;
}

type UpdateContactCustomFieldDefinitionInput = {
  name?: string;
  type?: (typeof contactCustomFieldDefinitions.$inferInsert)['type'];
  description?: string | null;
};

export async function updateContactCustomFieldDefinition(
  teamId: number,
  fieldId: string,
  data: UpdateContactCustomFieldDefinitionInput,
  client: any = db
) {
  const executor = client ?? db;
  const updatePayload: Partial<(typeof contactCustomFieldDefinitions.$inferInsert)> = {};

  if (typeof data.name === 'string') {
    updatePayload.name = data.name.trim();
  }
  if (typeof data.type === 'string') {
    updatePayload.type = data.type;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'description')) {
    updatePayload.description = data.description ?? null;
  }

  if (Object.keys(updatePayload).length === 0) {
    const [existing] = await executor
      .select()
      .from(contactCustomFieldDefinitions)
      .where(and(eq(contactCustomFieldDefinitions.teamId, teamId), eq(contactCustomFieldDefinitions.id, fieldId)))
      .limit(1);

    return existing ?? null;
  }

  updatePayload.updatedAt = new Date();

  const [updated] = await executor
    .update(contactCustomFieldDefinitions)
    .set(updatePayload)
    .where(and(eq(contactCustomFieldDefinitions.teamId, teamId), eq(contactCustomFieldDefinitions.id, fieldId)))
    .returning();

  return updated ?? null;
}

export async function deleteContactCustomFieldDefinition(teamId: number, fieldId: string, client: any = db) {
  const executor = client ?? db;
  const [deleted] = await executor
    .delete(contactCustomFieldDefinitions)
    .where(and(eq(contactCustomFieldDefinitions.teamId, teamId), eq(contactCustomFieldDefinitions.id, fieldId)))
    .returning();

  return deleted ?? null;
}

export type CreateContactWithCustomFieldsInput = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  jobTitle?: string | null;
  timezone?: string | null;
  tags?: string[];
  customFields?: Record<string, string | number | null>;
};

export async function createContactWithCustomFields(
  teamId: number,
  data: CreateContactWithCustomFieldsInput,
  client: any = db
) {
  const executor = client ?? db;
  const normalisedEmail = data.email.trim().toLowerCase();
  const normalisedTags = normalizeTags(data.tags ?? []);
  const now = new Date();

  const execute = async (conn: any) => {
    const existing = await conn
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.teamId, teamId), eq(contacts.email, normalisedEmail)))
      .limit(1);

    if (existing.length > 0) {
      return null;
    }

    await ensureProspectCapacity(teamId, 1, now, conn);

    const [inserted] = await conn
      .insert(contacts)
      .values({
        teamId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: normalisedEmail,
        company: data.company,
        jobTitle: data.jobTitle ?? null,
        timezone: data.timezone ?? null,
        tags: normalisedTags
      })
      .returning();

    if (!inserted) {
      return null;
    }

    if (data.customFields && Object.keys(data.customFields).length > 0) {
      await upsertContactCustomFieldValues(conn, teamId, inserted.id, data.customFields);
    }

    await incrementUsageCounters(teamId, { prospects: 1 }, now, conn);

    return inserted;
  };

  if (executor !== db) {
    return await execute(executor);
  }

  return await db.transaction(async (tx) => execute(tx));
}

export type ContactWithCustomFieldsResult = {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    jobTitle: string | null;
    timezone: string | null;
    tags: string[];
    createdAt: Date;
  };
  customFields: Record<string, string | number | null>;
};

export async function getContactWithCustomFields(
  teamId: number,
  contactId: string,
  client: any = db
): Promise<ContactWithCustomFieldsResult | null> {
  const executor = client ?? db;

  const [contact] = await executor
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      company: contacts.company,
      jobTitle: contacts.jobTitle,
      timezone: contacts.timezone,
      tags: contacts.tags,
      createdAt: contacts.createdAt
    })
    .from(contacts)
    .where(and(eq(contacts.teamId, teamId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact) {
    return null;
  }

  const customFieldRows = await executor
    .select({
      fieldId: contactCustomFieldValues.fieldId,
      type: contactCustomFieldDefinitions.type,
      textValue: contactCustomFieldValues.textValue,
      numberValue: contactCustomFieldValues.numberValue,
      dateValue: contactCustomFieldValues.dateValue
    })
    .from(contactCustomFieldValues)
    .innerJoin(
      contactCustomFieldDefinitions,
      and(
        eq(contactCustomFieldDefinitions.id, contactCustomFieldValues.fieldId),
        eq(contactCustomFieldDefinitions.teamId, teamId)
      )
    )
    .where(eq(contactCustomFieldValues.contactId, contactId));

  const customFields: Record<string, string | number | null> = {};

  for (const row of customFieldRows) {
    let value: string | number | null = null;

    if (row.type === 'number') {
      value = typeof row.numberValue === 'number' ? row.numberValue : null;
    } else if (row.type === 'date') {
      if (row.dateValue instanceof Date) {
        value = row.dateValue.toISOString().slice(0, 10);
      } else if (typeof row.dateValue === 'string') {
        value = row.dateValue;
      } else {
        value = null;
      }
    } else {
      value = row.textValue ?? null;
    }

    customFields[row.fieldId] = value;
  }

  const tags = Array.isArray(contact.tags)
    ? contact.tags.filter((tag: unknown): tag is string => typeof tag === 'string')
    : [];

  return {
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      company: contact.company,
      jobTitle: contact.jobTitle ?? null,
      timezone: contact.timezone ?? null,
      tags,
      createdAt: contact.createdAt
    },
    customFields
  };
}

export async function updateContact(
  teamId: number,
  contactId: string,
  data: {
    firstName?: string;
    lastName?: string;
    company?: string;
    jobTitle?: string | null;
    timezone?: string | null;
    tags?: string[];
    customFields?: Record<string, string | number | null>;
  },
  client: any = db
) {
  const executor = client ?? db;

  const execute = async (conn: any) => {
    const updatePayload: Partial<{
      firstName: string;
      lastName: string;
      company: string;
      jobTitle: string | null;
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
    if (typeof data.jobTitle === 'string' || data.jobTitle === null) {
      updatePayload.jobTitle = data.jobTitle ?? null;
    }
    if (typeof data.timezone === 'string' || data.timezone === null) {
      updatePayload.timezone = data.timezone ?? null;
    }
    if (Array.isArray(data.tags)) {
      updatePayload.tags = normalizeTags(data.tags) ?? [];
    }

    let targetContact = null as (typeof contacts.$inferSelect) | null;

    if (Object.keys(updatePayload).length > 0) {
      const [updated] = await conn
        .update(contacts)
        .set(updatePayload)
        .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
        .returning();

      if (!updated) {
        return null;
      }
      targetContact = updated;
    } else {
      const [existing] = await conn
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
        .limit(1);

      if (!existing) {
        return null;
      }
      targetContact = existing;
    }

    if (data.customFields && Object.keys(data.customFields).length > 0) {
      await upsertContactCustomFieldValues(
        conn,
        teamId,
        contactId,
        data.customFields
      );
    }

    return targetContact;
  };

  if (executor !== db) {
    return await execute(executor);
  }

  return await db.transaction(async (tx) => execute(tx));
}

export async function findContactByEmail(teamId: number, email: string, client: any = db) {
  const executor = client ?? db;
  const [contact] = await executor
    .select()
    .from(contacts)
    .where(and(eq(contacts.teamId, teamId), eq(contacts.email, email)))
    .limit(1);

  return contact ?? null;
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

type SequenceTrackingConfig = {
  trackOpens: boolean;
  trackClicks: boolean;
  enableUnsubscribe: boolean;
};

type SequenceScheduleConfig = {
  mode: 'immediate' | 'fixed' | 'window';
  sendTime: string | null;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  respectContactTimezone: boolean;
  fallbackTimezone: string | null;
  timezone: string | null;
  sendDays: string[] | null;
  sendWindows: Array<{ start: string; end: string }> | null;
};

export async function listSequencesForTeam(teamId: number, options: { includeDeleted?: boolean } = {}) {
  const { includeDeleted = false } = options;

  const conditions = [eq(sequences.teamId, teamId)] as Array<any>;
  if (!includeDeleted) {
    conditions.push(isNull(sequences.deletedAt));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  return await db
    .select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      deletedAt: sequences.deletedAt,
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
    .where(whereClause)
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
  launchAt: Date | null;
  launchedAt: Date | null;
  deletedAt: Date | null;
  trackOpens: boolean;
  trackClicks: boolean;
  enableUnsubscribe: boolean;
  stopCondition: string | null;
  stopOnBounce: boolean;
  minGapMinutes: number | null;
  scheduleMode: 'immediate' | 'fixed' | 'window' | null;
  scheduleSendTime: string | null;
  scheduleWindowStart: string | null;
  scheduleWindowEnd: string | null;
  scheduleRespectTimezone: boolean;
  scheduleFallbackTimezone: string | null;
  scheduleTimezone: string | null;
  scheduleSendDays: string[] | null;
  scheduleSendWindows: Array<{ start: string; end: string }> | null;
  contactIds: string[];
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
      launchAt: sequences.launchAt,
      launchedAt: sequences.launchedAt,
      deletedAt: sequences.deletedAt,
      trackOpens: sequences.trackOpens,
      trackClicks: sequences.trackClicks,
      enableUnsubscribe: sequences.enableUnsubscribe,
      stopCondition: sequences.stopCondition,
      stopOnBounce: sequences.stopOnBounce,
      minGapMinutes: sequences.minGapMinutes,
      scheduleMode: sequences.scheduleMode,
      scheduleSendTime: sequences.scheduleSendTime,
      scheduleWindowStart: sequences.scheduleWindowStart,
      scheduleWindowEnd: sequences.scheduleWindowEnd,
      scheduleRespectTimezone: sequences.scheduleRespectTimezone,
      scheduleFallbackTimezone: sequences.scheduleFallbackTimezone,
      scheduleTimezone: sequences.scheduleTimezone,
      scheduleSendDays: sequences.scheduleSendDays,
      scheduleSendWindows: sequences.scheduleSendWindows,
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

  const contactRows = await client
    .select({ contactId: contactSequenceStatus.contactId })
    .from(contactSequenceStatus)
    .where(eq(contactSequenceStatus.sequenceId, sequenceId));

  const contactIds = Array.from(
    new Set(
      contactRows
        .map((row) => row.contactId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );

  const [first] = rows;

  const rawScheduleMode = typeof first.scheduleMode === 'string' ? first.scheduleMode : null;
  const scheduleMode: 'immediate' | 'fixed' | 'window' | null =
    rawScheduleMode === 'fixed' || rawScheduleMode === 'window' || rawScheduleMode === 'immediate'
      ? rawScheduleMode
      : null;

  const scheduleSendDays = Array.isArray(first.scheduleSendDays)
    ? first.scheduleSendDays.filter((day): day is string => typeof day === 'string' && day.trim().length > 0)
    : null;

  const scheduleSendWindows = Array.isArray(first.scheduleSendWindows)
    ? first.scheduleSendWindows
        .map((window) => {
          if (!window || typeof window !== 'object') {
            return null;
          }
          const start = typeof (window as any).start === 'string' ? (window as any).start : null;
          const end = typeof (window as any).end === 'string' ? (window as any).end : null;
          if (!start || !end) {
            return null;
          }
          return { start, end } as { start: string; end: string };
        })
        .filter((value): value is { start: string; end: string } => Boolean(value))
    : null;

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
    launchAt: first.launchAt ?? null,
    launchedAt: first.launchedAt ?? null,
    deletedAt: first.deletedAt ?? null,
    trackOpens: first.trackOpens ?? false,
    trackClicks: first.trackClicks ?? false,
    enableUnsubscribe: first.enableUnsubscribe ?? false,
    stopCondition: typeof first.stopCondition === 'string' ? first.stopCondition : null,
    stopOnBounce: first.stopOnBounce ?? false,
    minGapMinutes:
      typeof first.minGapMinutes === 'number' && Number.isFinite(first.minGapMinutes)
        ? first.minGapMinutes
        : null,
    scheduleMode,
    scheduleSendTime: typeof first.scheduleSendTime === 'string' ? first.scheduleSendTime : null,
    scheduleWindowStart: typeof first.scheduleWindowStart === 'string' ? first.scheduleWindowStart : null,
    scheduleWindowEnd: typeof first.scheduleWindowEnd === 'string' ? first.scheduleWindowEnd : null,
    scheduleRespectTimezone: first.scheduleRespectTimezone ?? true,
    scheduleFallbackTimezone: typeof first.scheduleFallbackTimezone === 'string' ? first.scheduleFallbackTimezone : null,
    scheduleTimezone: typeof first.scheduleTimezone === 'string' ? first.scheduleTimezone : null,
    scheduleSendDays,
    scheduleSendWindows,
    contactIds,
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
  scheduleTimezone: string | null;
  scheduleSendDays: string[] | null;
  scheduleSendWindows: Array<{ start: string; end: string }> | null;
  manualTriggeredAt: Date | null;
  manualSentAt: Date | null;
  lastThrottleAt: Date | null;
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
    launchAt: Date | null;
    launchedAt: Date | null;
    deletedAt: Date | null;
    minGapMinutes: number | null;
  };
  summary: SequenceStatusSummary;
  contacts: SequenceStatusContact[];
  steps: StepSummary[];
  sentPerStep: Record<string, number>;
  uniqueReplyContacts: string[];
  uniqueReplyCount: number;
  worker: SequenceWorkerSnapshot;
};

export type SequenceWorkerSnapshot = {
  queueSize: number;
  lastRunAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  minSendIntervalMinutes: number | null;
};

async function buildSequenceWorkerSnapshot(
  sequenceId: string,
  queueSizeOverride?: number,
  minGapMinutes?: number | null
): Promise<SequenceWorkerSnapshot> {
  // Basic snapshot implementation: use provided queue size (from aggregation) and leave timestamps/errors null.
  // This can be extended later to query a worker status table or job queue for real metrics.
  const queueSize = typeof queueSizeOverride === 'number' ? queueSizeOverride : 0;

  return {
    queueSize,
    lastRunAt: null,
    lastFailureAt: null,
    lastError: null,
    minSendIntervalMinutes: typeof minGapMinutes === 'number' ? minGapMinutes : null
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
      updatedAt: sequences.updatedAt,
      launchAt: sequences.launchAt,
      launchedAt: sequences.launchedAt,
      deletedAt: sequences.deletedAt,
      minGapMinutes: sequences.minGapMinutes
    })
    .from(sequences)
    .leftJoin(senders, eq(senders.id, sequences.senderId))
    .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
    .limit(1);

  if (sequenceRow.length === 0) {
    return null;
  }

  const sequenceMeta = sequenceRow[0];

  await syncSequenceRepliesFromLogs(sequenceId);

  const runSequenceStatusQuery = () =>
    db
      .select({
        id: contactSequenceStatus.id,
        sequenceId: contactSequenceStatus.sequenceId,
        contactId: contactSequenceStatus.contactId,
        status: contactSequenceStatus.status,
        lastUpdated: contactSequenceStatus.lastUpdated,
        scheduledAt: contactSequenceStatus.scheduledAt,
        sentAt: contactSequenceStatus.sentAt,
        attempts: contactSequenceStatus.attempts,
        replyAt: contactSequenceStatus.replyAt,
        bounceAt: contactSequenceStatus.bounceAt,
    skippedAt: contactSequenceStatus.skippedAt,
    hasReplyLog: sql<boolean>`exists (select 1 from ${deliveryLogs} dl where dl.contact_id = ${contactSequenceStatus.contactId} and dl.sequence_id = ${contactSequenceStatus.sequenceId} and dl.type = 'reply')`,
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
  manualSentAt: contactSequenceStatus.manualSentAt,
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

  const aggregated = aggregateSequenceRows(normalizedRows as RawSequenceRow[], { sequenceId });

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
      updatedAt: sequenceMeta.updatedAt,
      launchAt: sequenceMeta.launchAt ?? null,
      launchedAt: sequenceMeta.launchedAt ?? null,
      deletedAt: sequenceMeta.deletedAt ?? null,
      minGapMinutes: sequenceMeta.minGapMinutes ?? null
    },
    summary: aggregated.summary,
    contacts: aggregated.contacts,
    steps: aggregated.steps,
    sentPerStep: aggregated.sentPerStep,
    uniqueReplyContacts: aggregated.uniqueReplyContacts,
    uniqueReplyCount: aggregated.uniqueReplyCount,
    worker: await buildSequenceWorkerSnapshot(sequenceId, aggregated.summary.pending, sequenceMeta.minGapMinutes ?? null)
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
  matchedMessageId?: string | null;
};

export type SequenceInboundEvent = {
  type: 'reply' | 'bounce';
  messageId: string | null;
  contactId: string | null;
  sequenceId: string | null;
  occurredAt: Date | null;
  payload: unknown;
  inReplyTo?: string | null;
  references?: string[] | null;
  threadId?: string | null;
  to?: string[] | null;
  from?: string[] | null;
};

export type SequenceEventProcessingResult = {
  type: 'reply' | 'bounce';
  status: 'processed' | 'skipped';
  contactId?: string;
  sequenceId?: string;
  reason?: 'target_not_found' | 'missing_step';
};

export type SequenceEventResolverContext = {
  candidates: string[];
};

export type SequenceEventResolver = (
  event: SequenceInboundEvent,
  client: DbExecutor,
  context: SequenceEventResolverContext
) => Promise<SequenceEventTarget | null>;

export type RecordSequenceEventsOptions = {
  client?: TransactionRunner;
  resolveTarget?: SequenceEventResolver;
};

const MAX_SEQUENCE_EVENT_MESSAGE_IDS = 20;

const CANDIDATE_HEADER_KEYS = new Set([
  'in-reply-to',
  'references',
  'reference',
  'message-id',
  'original-message-id',
  'x-original-message-id',
  'thread-index',
  'thread-id'
]);

const MESSAGE_ID_FIELD_KEYS = new Set([
  'inreplyto',
  'in-reply-to',
  'in_reply_to',
  'references',
  'reference',
  'originalmessageid',
  'original-message-id',
  'original_message_id',
  'threadid',
  'thread-id',
  'thread_id',
  'parentmessageid',
  'parent-message-id',
  'replymessageid',
  'reply-message-id'
]);

const MAX_REPLY_SNIPPET_LENGTH = 500;

function normaliseSingleMessageId(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  let candidate = value.trim();
  if (!candidate) {
    return null;
  }

  candidate = candidate.replace(/[\r\n]+/g, ' ').trim();
  candidate = candidate.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');

  const angleMatches = candidate.match(/<[^>]+>/g);
  if (angleMatches && angleMatches.length > 0) {
    const first = angleMatches[0].trim();
    if (!first) {
      return null;
    }
    return first.startsWith('<') && first.endsWith('>') ? first : `<${first.replace(/^<+|>+$/g, '').trim()}>`;
  }

  const stripped = candidate.replace(/^<+/, '').replace(/>+$/, '').trim();
  if (!stripped) {
    return null;
  }

  if (stripped.includes('@')) {
    return `<${stripped}>`;
  }

  return stripped;
}

function extractMessageIdTokens(value: string): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const matches = trimmed.match(/<[^>]+>/g);
  if (matches && matches.length > 0) {
    const collected: string[] = [];
    for (const match of matches) {
      const normalised = normaliseSingleMessageId(match);
      if (normalised) {
        collected.push(normalised);
      }
    }
    if (collected.length > 0) {
      return collected;
    }
  }

  const fallback = normaliseSingleMessageId(trimmed);
  return fallback ? [fallback] : [];
}

function collectHeaderCandidates(source: unknown, emit: (value: string) => void) {
  const processValue = (value: unknown) => {
    if (typeof value === 'string') {
      for (const token of extractMessageIdTokens(value)) {
        emit(token);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        processValue(entry);
      }
      return;
    }

    if (value && typeof value === 'object') {
      const inner = (value as Record<string, unknown>).value ?? (value as Record<string, unknown>).Value;
      if (typeof inner === 'string' || Array.isArray(inner)) {
        processValue(inner);
      }
    }
  };

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry) {
        continue;
      }

      if (typeof entry === 'object' && !Array.isArray(entry)) {
        const candidate = entry as Record<string, unknown>;
        const nameRaw =
          typeof candidate.name === 'string'
            ? candidate.name
            : typeof candidate.Name === 'string'
              ? candidate.Name
              : null;
        const valueRaw =
          typeof candidate.value === 'string'
            ? candidate.value
            : typeof candidate.Value === 'string'
              ? candidate.Value
              : null;

        if (nameRaw && valueRaw) {
          const headerKey = nameRaw.trim().toLowerCase();
          if (CANDIDATE_HEADER_KEYS.has(headerKey)) {
            processValue(valueRaw);
          }
          continue;
        }
      }

      processValue(entry);
    }
    return;
  }

  if (source && typeof source === 'object') {
    for (const [name, value] of Object.entries(source as Record<string, unknown>)) {
      const headerKey = name.trim().toLowerCase();
      if (!CANDIDATE_HEADER_KEYS.has(headerKey)) {
        continue;
      }
      processValue(value);
    }
    return;
  }

  processValue(source);
}

function getSequenceEventMessageCandidates(event: SequenceInboundEvent): string[] {
  const primary: string[] = [];
  const fallback: string[] = [];
  const seen = new Set<string>();

  const pushToken = (token: string, priority: 'primary' | 'fallback') => {
    if (!token || seen.has(token) || seen.size >= MAX_SEQUENCE_EVENT_MESSAGE_IDS) {
      return;
    }
    seen.add(token);
    if (priority === 'primary') {
      primary.push(token);
    } else {
      fallback.push(token);
    }
  };

  const append = (value: unknown, priority: 'primary' | 'fallback' = 'primary') => {
    if (value == null || seen.size >= MAX_SEQUENCE_EVENT_MESSAGE_IDS) {
      return;
    }

    if (typeof value === 'string') {
      for (const token of extractMessageIdTokens(value)) {
        pushToken(token, priority);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        append(entry, priority);
      }
    }
  };

  append(event.inReplyTo ?? null, 'primary');
  append(event.threadId ?? null, 'primary');
  append(event.references ?? null, 'primary');

  const visited = new Set<unknown>();
  const stack: unknown[] = [];

  if (event.payload && typeof event.payload === 'object') {
    stack.push(event.payload);
  }

  while (stack.length > 0 && seen.size < MAX_SEQUENCE_EVENT_MESSAGE_IDS) {
    const node = stack.pop();

    if (node == null) {
      continue;
    }

    if (typeof node === 'string') {
      append(node, 'primary');
      continue;
    }

    if (Array.isArray(node)) {
      for (const entry of node) {
        if (typeof entry === 'string') {
          append(entry, 'primary');
        } else if (entry && typeof entry === 'object') {
          stack.push(entry);
        }
      }
      continue;
    }

    if (typeof node !== 'object') {
      continue;
    }

    if (visited.has(node)) {
      continue;
    }
    visited.add(node);

    for (const [rawKey, rawValue] of Object.entries(node as Record<string, unknown>)) {
      const key = rawKey.trim().toLowerCase();

      if (CANDIDATE_HEADER_KEYS.has(key)) {
        collectHeaderCandidates(rawValue, (headerValue) => append(headerValue, 'primary'));
        continue;
      }

      if (MESSAGE_ID_FIELD_KEYS.has(key)) {
        append(rawValue, 'primary');
        continue;
      }

      if (rawValue && (typeof rawValue === 'object' || Array.isArray(rawValue))) {
        stack.push(rawValue);
      }
    }
  }

  append(event.messageId ?? null, 'fallback');

  return [...primary, ...fallback];
}

function extractString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function extractReplyContentMetadata(payload: unknown): { subject: string | null; snippet: string | null } {
  if (!payload || typeof payload !== 'object') {
    return { subject: null, snippet: null };
  }

  const data = payload as Record<string, unknown>;

  const tryKeys = (source: Record<string, unknown> | null | undefined, keys: string[]): string | null => {
    if (!source) {
      return null;
    }
    for (const key of keys) {
      const value = extractString(source[key]);
      if (value) {
        return value;
      }
    }
    return null;
  };

  const subjectCandidates = ['subject', 'Subject', 'SUBJECT'];
  const snippetCandidates = ['snippet', 'Snippet', 'text', 'Text', 'body', 'Body', 'preview', 'Preview', 'content'];

  const subject =
    extractString(data.subject) ??
    tryKeys((data.headers as Record<string, unknown> | undefined) ?? null, subjectCandidates) ??
    tryKeys((data.message as Record<string, unknown> | undefined) ?? null, subjectCandidates);

  let snippet =
    extractString(data.snippet) ??
    extractString(data.text) ??
    extractString(data.body) ??
    extractString(data.preview) ??
    tryKeys((data.message as Record<string, unknown> | undefined) ?? null, snippetCandidates) ??
    tryKeys((data.headers as Record<string, unknown> | undefined) ?? null, snippetCandidates);

  if (snippet && snippet.length > MAX_REPLY_SNIPPET_LENGTH) {
    snippet = `${snippet.slice(0, MAX_REPLY_SNIPPET_LENGTH)}…`;
  }

  return {
    subject: subject ?? null,
    snippet: snippet ?? null
  };
}

async function findSequenceEventTarget(
  event: SequenceInboundEvent,
  client: DatabaseClient | any = db,
  context?: { candidates?: string[] }
): Promise<SequenceEventTarget | null> {
  const candidateMessageIds = Array.isArray(context?.candidates) && context.candidates.length > 0
    ? context.candidates
    : getSequenceEventMessageCandidates(event);

  for (const candidate of candidateMessageIds) {
    if (!candidate) {
      continue;
    }

    const [log] = await client
      .select({
        contactId: deliveryLogs.contactId,
        sequenceId: deliveryLogs.sequenceId,
        stepId: deliveryLogs.stepId
      })
      .from(deliveryLogs)
      .where(eq(deliveryLogs.messageId, candidate))
      .orderBy(desc(deliveryLogs.createdAt))
      .limit(1);

    if (!log) {
      continue;
    }

    const [status] = await client
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
        bounceAt: status.bounceAt ?? null,
        matchedMessageId: candidate
      };
    }
  }

  const contactId = event.contactId?.trim();
  const sequenceId = event.sequenceId?.trim();

  if (contactId && sequenceId) {
    const [status] = await client
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
        bounceAt: status.bounceAt ?? null,
        matchedMessageId: null
      };
    }
  }

  return null;
}

export async function recordSequenceEvents(
  events: SequenceInboundEvent[],
  options: RecordSequenceEventsOptions = {}
): Promise<SequenceEventProcessingResult[]> {
  if (events.length === 0) {
    return [];
  }

  const shouldDebug = process.env.NODE_ENV !== 'production';

  const clientRunner: TransactionRunner = (options.client ?? db) as TransactionRunner;
  const resolveTarget: SequenceEventResolver = options.resolveTarget
    ? async (event, resolverClient, context) => options.resolveTarget!(event, resolverClient, context)
    : async (event, resolverClient, context) => findSequenceEventTarget(event, resolverClient, context);

  if (shouldDebug) {
    try {
      console.groupCollapsed?.('[SequenceEvents] batch start', {
        count: events.length,
        types: Array.from(new Set(events.map((event) => event.type))).sort()
      });
      console.log?.('[SequenceEvents] raw payload', events);
      console.groupEnd?.();
    } catch (error) {
      console.warn?.('[SequenceEvents] failed to log batch', error);
    }
  }

  const results: SequenceEventProcessingResult[] = [];

  for (const event of events) {
    const occurredAt = event.occurredAt ?? new Date();
    const candidateMessageIds = getSequenceEventMessageCandidates(event);

    const result = await clientRunner.transaction(async (tx) => {
      const target = await resolveTarget(event, tx, { candidates: candidateMessageIds });

      if (!target) {
        if (shouldDebug) {
          console.warn?.('[SequenceEvents] target not found', {
            eventType: event.type,
            messageId: event.messageId,
            candidates: candidateMessageIds
          });
        }

        return {
          type: event.type,
          status: 'skipped',
          reason: 'target_not_found'
        } satisfies SequenceEventProcessingResult;
      }

      const stepId = target.lastSentStepId ?? target.currentStepId;
      if (!stepId) {
        if (shouldDebug) {
          console.warn?.('[SequenceEvents] missing step for target', {
            eventType: event.type,
            contactId: target.contactId,
            sequenceId: target.sequenceId,
            statusId: target.statusId,
            candidates: candidateMessageIds
          });
        }

        return {
          type: event.type,
          status: 'skipped',
          contactId: target.contactId,
          sequenceId: target.sequenceId,
          reason: 'missing_step'
        } satisfies SequenceEventProcessingResult;
      }

      const resolvedMessageId = target.matchedMessageId ?? event.messageId?.trim() ?? null;

      const replyMetadata = extractReplyContentMetadata(event.payload);

      await (tx as any).insert(deliveryLogs).values({
        contactId: target.contactId,
        sequenceId: target.sequenceId,
        stepId,
        statusId: target.statusId,
        status: event.type === 'reply' ? 'replied' : 'failed',
        attempts: 0,
        messageId: resolvedMessageId,
        type: event.type,
        payload: {
          raw: event.payload ?? null,
          candidates: candidateMessageIds,
          matchedMessageId: target.matchedMessageId ?? null,
          occurredAt: occurredAt.toISOString(),
          incomingMessageId: event.messageId ?? null,
          subject: replyMetadata.subject,
          snippet: replyMetadata.snippet,
          headers: {
            inReplyTo: event.inReplyTo ?? null,
            references: event.references ?? null,
            threadId: event.threadId ?? null,
            to: event.to ?? null,
            from: event.from ?? null
          }
        },
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
        updateData.bounceAt = target.bounceAt ?? null;
      } else {
        updateData.bounceAt = target.bounceAt && target.bounceAt > occurredAt ? target.bounceAt : occurredAt;
      }

      await (tx as any)
        .update(contactSequenceStatus)
        .set(updateData)
        .where(eq(contactSequenceStatus.id, target.statusId));

      if (shouldDebug) {
        console.log?.('[SequenceEvents] processed', {
          eventType: event.type,
          contactId: target.contactId,
          sequenceId: target.sequenceId,
          statusId: target.statusId,
          matchedMessageId: target.matchedMessageId ?? null,
          candidateMessageIds,
          resolvedMessageId
        });
      }

      return {
        type: event.type,
        status: 'processed',
        contactId: target.contactId,
        sequenceId: target.sequenceId
      } satisfies SequenceEventProcessingResult;
    });

    results.push(result);
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

type DeliveryLogStatus = (typeof deliveryStatusEnum.enumValues)[number];

export type SequenceDeliveryLogRecord = {
  id: string;
  status: DeliveryLogStatus;
  type: string | null;
  attempts: number;
  createdAt: Date;
  messageId: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  rescheduledFor: Date | null;
  delayReason: string | null;
  delayMs: number | null;
  minIntervalMinutes: number | null;
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
  status?: DeliveryLogStatus | 'all';
  type?: 'reply' | 'bounce' | 'send' | 'manual_send' | 'retrying' | 'delayed' | string;
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

  if (filters.type) {
    conditions.push(eq(deliveryLogs.type, filters.type));
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
      type: deliveryLogs.type,
      attempts: deliveryLogs.attempts,
      createdAt: deliveryLogs.createdAt,
      messageId: deliveryLogs.messageId,
      errorMessage: deliveryLogs.errorMessage,
      skipReason: deliveryLogs.skipReason,
      payload: deliveryLogs.payload,
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

  const logs: SequenceDeliveryLogRecord[] = rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const rescheduledFor = (() => {
      const value = typeof payload.rescheduledFor === 'string' ? payload.rescheduledFor : null;
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })();

    const delayReason = (() => {
      if (typeof payload.reason === 'string') {
        return payload.reason;
      }
      if (typeof payload.delayReason === 'string') {
        return payload.delayReason;
      }
      return null;
    })();

    const delayMs = typeof payload.delayMs === 'number' ? payload.delayMs : null;
    const minIntervalMinutes = (() => {
      if (typeof payload.minIntervalMinutes === 'number') {
        return payload.minIntervalMinutes;
      }
      if (typeof payload.effectiveMinIntervalMinutes === 'number') {
        return payload.effectiveMinIntervalMinutes;
      }
      return null;
    })();

    return {
      id: row.id,
      status: row.status,
      type: row.type ?? null,
      attempts: row.attempts ?? 0,
      createdAt: row.createdAt,
      messageId: row.messageId ?? null,
      errorMessage: row.errorMessage ?? null,
      skipReason: row.skipReason ?? null,
      rescheduledFor,
      delayReason,
      delayMs,
      minIntervalMinutes,
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
    } satisfies SequenceDeliveryLogRecord;
  });

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
    const rawSource = (payload.raw ?? payload) as unknown;
    const meta = extractReplyContentMetadata(rawSource);
    const subject = typeof payload.subject === 'string' && payload.subject.trim().length > 0 ? payload.subject : meta.subject;
    const snippet = (() => {
      if (typeof payload.snippet === 'string' && payload.snippet.trim().length > 0) {
        return payload.snippet;
      }
      if (typeof payload.text === 'string' && payload.text.trim().length > 0) {
        return payload.text;
      }
      return meta.snippet;
    })();

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
  data: {
    name: string;
    senderId: number | null;
    steps: SequenceStepInput[];
    launchAt: Date | string | null;
    tracking: SequenceTrackingConfig;
    stopCondition: string;
    stopOnBounce: boolean;
    schedule: SequenceScheduleConfig;
    minGapMinutes: number | null;
  }
) {
  const sequenceId = await db.transaction(async (tx) => {
    const now = new Date();

    const launchAt = (() => {
      if (data.launchAt instanceof Date) {
        return Number.isNaN(data.launchAt.getTime()) ? null : data.launchAt;
      }
      if (typeof data.launchAt === 'string') {
        const parsed = new Date(data.launchAt);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      return null;
    })();

    const scheduleMode = data.schedule.mode;
    const scheduleSendTime = scheduleMode === 'fixed' ? data.schedule.sendTime ?? null : null;
    const scheduleWindowStart = scheduleMode === 'window' ? data.schedule.sendWindowStart ?? null : null;
    const scheduleWindowEnd = scheduleMode === 'window' ? data.schedule.sendWindowEnd ?? null : null;
    const scheduleSendDays = Array.isArray(data.schedule.sendDays) && data.schedule.sendDays.length > 0 ? data.schedule.sendDays : null;
    const scheduleSendWindows = Array.isArray(data.schedule.sendWindows) && data.schedule.sendWindows.length > 0 ? data.schedule.sendWindows : null;

    const [inserted] = await tx
      .insert(sequences)
      .values({
        teamId,
        userId,
        name: data.name,
        senderId: data.senderId ?? null,
        launchAt,
        trackOpens: data.tracking.trackOpens,
        trackClicks: data.tracking.trackClicks,
        enableUnsubscribe: data.tracking.enableUnsubscribe,
        stopCondition: data.stopCondition ?? 'on_reply',
        stopOnBounce: data.stopOnBounce ?? false,
        minGapMinutes: data.minGapMinutes ?? null,
        scheduleMode,
        scheduleSendTime,
        scheduleWindowStart,
        scheduleWindowEnd,
        scheduleRespectTimezone: data.schedule.respectContactTimezone ?? true,
        scheduleFallbackTimezone: data.schedule.fallbackTimezone ?? null,
        scheduleTimezone: data.schedule.timezone ?? null,
        scheduleSendDays,
        scheduleSendWindows,
        createdAt: now,
        updatedAt: now
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
  data: {
    name: string;
    senderId: number | null;
    steps: SequenceStepInput[];
    launchAt?: Date | string | null;
    minGapMinutes?: number | null;
    contactIds?: string[];
  }
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

    const launchAt = (() => {
      if (data.launchAt instanceof Date) {
        return Number.isNaN(data.launchAt.getTime()) ? null : data.launchAt;
      }
      if (typeof data.launchAt === 'string') {
        const parsed = new Date(data.launchAt);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      return undefined;
    })();

    const updatePayload: Partial<typeof sequences.$inferInsert> = {
      name: data.name,
      senderId: data.senderId ?? null,
      updatedAt: new Date()
    };

    if (launchAt !== undefined) {
      updatePayload.launchAt = launchAt;
    }

    if (data.minGapMinutes !== undefined) {
      updatePayload.minGapMinutes = data.minGapMinutes;
    }

    await tx
      .update(sequences)
      .set(updatePayload)
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

    if (Array.isArray(data.contactIds)) {
      const desiredContacts = Array.from(
        new Set(
          data.contactIds.filter((contactId): contactId is string => typeof contactId === 'string' && contactId.length > 0)
        )
      );

      const existingContactRows = await tx
        .select({ contactId: contactSequenceStatus.contactId })
        .from(contactSequenceStatus)
        .where(eq(contactSequenceStatus.sequenceId, sequenceId));

      const existingContacts = new Set(
        existingContactRows
          .map((row) => row.contactId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      );

      const desiredSet = new Set(desiredContacts);
      const contactsToRemove = Array.from(existingContacts).filter((contactId) => !desiredSet.has(contactId));

      if (contactsToRemove.length > 0) {
        await tx
          .delete(contactSequenceStatus)
          .where(
            and(
              eq(contactSequenceStatus.sequenceId, sequenceId),
              inArray(contactSequenceStatus.contactId, contactsToRemove)
            )
          );
      }
    }

    return sequenceId;
  });

  if (!updatedId) {
    return null;
  }

  const sequence = await getSequenceWithSteps(teamId, updatedId);
  if (!sequence) {
    return null;
  }

  if (Array.isArray(data.contactIds)) {
    return {
      ...sequence,
      contactIds: data.contactIds
    } satisfies SequenceWithStepsInternal;
  }

  return sequence;
}

export async function setSequenceLifecycleStatus(
  teamId: number,
  sequenceId: string,
  status: SequenceLifecycleTransition
) {
  return await db.transaction(async (tx) => {
    const now = new Date();
    const updatePayload: Partial<typeof sequences.$inferInsert> = {
      updatedAt: now,
      deletedAt: status === 'deleted' ? now : null
    };

    if (status !== 'deleted') {
      updatePayload.status = status;
    }

    const [updated] = await tx
      .update(sequences)
      .set(updatePayload)
      .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
      .returning({
        id: sequences.id,
        name: sequences.name,
        status: sequences.status,
        deletedAt: sequences.deletedAt,
        createdAt: sequences.createdAt,
        updatedAt: sequences.updatedAt
      });

    if (!updated) {
      return null;
    }

    if (status === 'deleted') {
      await tx
        .delete(contactSequenceStatus)
        .where(eq(contactSequenceStatus.sequenceId, sequenceId));
    }

    return updated;
  });
}

export type SequenceEnrollmentResult = {
  enrolled: number;
  skipped: number;
};

export type SequenceEnrollmentErrorCode = 'sequence_not_found' | 'sequence_has_no_steps' | 'contacts_not_found' | 'sequence_paused' | 'sequence_draft';

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
  scheduleOptions?: SequenceScheduleOptions | null,
  options?: { allowDraft?: boolean; fallbackTimezone?: string | null }
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

    if (sequenceRow.status === 'draft' && !options?.allowDraft) {
      throw new SequenceEnrollmentError('sequence_draft', 'Sequence is still a draft and cannot accept enrollments');
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

    let fallbackTimezone = options?.fallbackTimezone ?? 'UTC';
    if (scheduleOptions && !options?.fallbackTimezone) {
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
        scheduleTimezone: scheduleOptions?.timezone ?? null,
        scheduleSendDays: Array.isArray(scheduleOptions?.sendDays) ? scheduleOptions.sendDays : null,
        scheduleSendWindows: Array.isArray(scheduleOptions?.sendWindows) ? scheduleOptions.sendWindows : null,
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
export type InsertContactsRow = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  tags: string[];
  jobTitle?: string | null;
  timezone?: string | null;
};

export type InsertContactsResult = {
  inserted: number;
  skipped: number;
  ids: string[];
};

export async function insertContacts(teamId: number, rows: InsertContactsRow[], client: any = db): Promise<InsertContactsResult> {
  if (rows.length === 0) {
    return { inserted: 0, skipped: 0, ids: [] };
  }

  const now = new Date();
  const executor = client ?? db;

  const dedupedRows: InsertContactsRow[] = [];
  const seenEmails = new Set<string>();
  let skippedFromInput = 0;

  for (const row of rows) {
    const normalisedEmail = row.email.trim().toLowerCase();

    if (seenEmails.has(normalisedEmail)) {
      skippedFromInput += 1;
      continue;
    }

    seenEmails.add(normalisedEmail);
    dedupedRows.push({ ...row, email: normalisedEmail });
  }

  const execute = async (conn: any) => {
    if (dedupedRows.length === 0) {
      return { inserted: 0, skipped: rows.length, ids: [] } satisfies InsertContactsResult;
    }

    const emailList = Array.from(seenEmails);
    const existing = emailList.length
      ? await conn
          .select({ email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.teamId, teamId), inArray(contacts.email, emailList)))
      : [];

    const existingEmails = new Set(existing.map((record: { email: string }) => record.email.toLowerCase()));

    const rowsToInsert = dedupedRows
      .filter((row) => !existingEmails.has(row.email))
      .map((row) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        company: row.company,
        jobTitle: row.jobTitle ?? null,
        timezone: row.timezone ?? null,
        tags: normalizeTags(row.tags)
      }));

    const duplicatesFromDb = dedupedRows.length - rowsToInsert.length;
    const totalSkippedPreInsert = skippedFromInput + duplicatesFromDb;

    if (rowsToInsert.length === 0) {
      return {
        inserted: 0,
        skipped: Math.min(rows.length, totalSkippedPreInsert),
        ids: []
      } satisfies InsertContactsResult;
    }

    await ensureProspectCapacity(teamId, rowsToInsert.length, now, conn);

    const inserted = await conn
      .insert(contacts)
      .values(
        rowsToInsert.map((row) => ({
          teamId,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          company: row.company,
          jobTitle: row.jobTitle,
          timezone: row.timezone,
          tags: row.tags
        }))
      )
      .onConflictDoNothing({
        target: [contacts.teamId, contacts.email]
      })
      .returning({ id: contacts.id, email: contacts.email });

    const insertedIds = inserted.map((record: { id: string }) => record.id);
    const insertedCount = insertedIds.length;
    const conflictsDuringInsert = rowsToInsert.length - insertedCount;
    const totalSkipped = Math.min(rows.length, totalSkippedPreInsert + conflictsDuringInsert);

    if (insertedCount > 0) {
      await incrementUsageCounters(teamId, { prospects: insertedCount }, now, conn);
    }

    return {
      inserted: insertedCount,
      skipped: totalSkipped,
      ids: insertedIds
    } satisfies InsertContactsResult;
  };

  if (executor !== db) {
    return await execute(executor);
  }

  return await db.transaction(async (tx) => execute(tx));
}

type TeamPlanInfo = {
  plan: string;
  planIsTrial: boolean;
  planIsActive: boolean;
  limits: {
    prospects: number;
    emailsPerMonth: number;
    credits: number;
  };
};

export type PlanRecord = {
  id: number;
  name: string;
  maxEmailsPerMonth: number;
  maxProspects: number;
  maxCredits: number;
  isActive: boolean;
  isTrial: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  limits: {
    prospects: number;
    emailsPerMonth: number;
    credits: number;
  };
};

const PLAN_SELECTION = {
  id: plans.id,
  name: plans.name,
  maxEmailsPerMonth: plans.maxEmailsPerMonth,
  maxProspects: plans.maxProspects,
  maxCredits: plans.maxCredits,
  isActive: plans.isActive,
  isTrial: plans.isTrial,
  sortOrder: plans.sortOrder,
  createdAt: plans.createdAt,
  updatedAt: plans.updatedAt
};

function mapPlanRow(row: {
  id: number;
  name: string;
  maxEmailsPerMonth: number;
  maxProspects: number;
  maxCredits: number;
  isActive: boolean | null;
  isTrial: boolean | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): PlanRecord {
  return {
    id: row.id,
    name: row.name,
    maxEmailsPerMonth: row.maxEmailsPerMonth,
    maxProspects: row.maxProspects,
    maxCredits: row.maxCredits,
    isActive: row.isActive ?? false,
    isTrial: row.isTrial ?? false,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    limits: {
      prospects: row.maxProspects,
      emailsPerMonth: row.maxEmailsPerMonth,
      credits: row.maxCredits
    }
  };
}

export async function getPlans(client: any = db): Promise<PlanRecord[]> {
  const executor = client ?? db;
  const rows = await executor
    .select(PLAN_SELECTION)
    .from(plans)
    .orderBy(asc(plans.sortOrder), asc(plans.id));

  return rows.map((row: Parameters<typeof mapPlanRow>[0]) => mapPlanRow(row));
}

type UpdatePlanPayload = {
  maxProspects?: number;
  maxEmailsPerMonth?: number;
  maxCredits?: number;
  isTrial?: boolean;
};

export async function updatePlanById(
  planId: number,
  updates: UpdatePlanPayload,
  client: any = db
): Promise<PlanRecord | null> {
  const executor = client ?? db;
  const payload: Partial<(typeof plans.$inferInsert)> = {};

  if (typeof updates.maxProspects === 'number' && updates.maxProspects >= 0) {
    payload.maxProspects = updates.maxProspects;
  }
  if (typeof updates.maxEmailsPerMonth === 'number' && updates.maxEmailsPerMonth >= 0) {
    payload.maxEmailsPerMonth = updates.maxEmailsPerMonth;
  }
  if (typeof updates.maxCredits === 'number' && updates.maxCredits >= 0) {
    payload.maxCredits = updates.maxCredits;
  }
  if (typeof updates.isTrial === 'boolean') {
    payload.isTrial = updates.isTrial;
  }

  if (Object.keys(payload).length === 0) {
    const [existing] = await executor
      .select(PLAN_SELECTION)
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    return existing ? mapPlanRow(existing) : null;
  }

  payload.updatedAt = new Date();

  const [updated] = await executor
    .update(plans)
    .set(payload)
    .where(eq(plans.id, planId))
    .returning(PLAN_SELECTION);

  return updated ? mapPlanRow(updated) : null;
}

type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

export async function resolvePrimaryTeamIdForUser(userId: number, client: any = db): Promise<number | null> {
  const executor = client ?? db;
  const [membership] = await executor
    .select({
      teamId: teamMembers.teamId
    })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .orderBy(asc(teamMembers.joinedAt), asc(teamMembers.id))
    .limit(1);

  return membership?.teamId ?? null;
}

export async function setTeamPaymentStatus(
  teamId: number,
  status: PaymentStatus,
  client: any = db
) {
  const executor = client ?? db;
  const [updated] = await executor
    .update(teams)
    .set({ paymentStatus: status, updatedAt: new Date() })
    .where(eq(teams.id, teamId))
    .returning({
      id: teams.id,
      paymentStatus: teams.paymentStatus,
      subscriptionStatus: teams.subscriptionStatus,
      planName: teams.planName
    });

  return updated ?? null;
}

export class InvalidPlanAssignmentError extends Error {
  constructor(message = 'Plan cannot be assigned to this user') {
    super(message);
    this.name = 'InvalidPlanAssignmentError';
  }
}

export type AdminUserUsageSummary = {
  prospectsUsed: number;
  prospectsLimit: number;
  emailsUsed: number;
  emailsLimit: number;
  emailsMonthStart: Date | null;
};

export type AdminUserSummary = {
  id: number;
  email: string;
  plan: string | null;
  planIsActive: boolean | null;
  planIsTrial: boolean | null;
  status: 'active' | 'inactive';
  signupDate: Date;
  trialExpiresAt: Date | null;
  trialStatus: 'Trial Active' | 'Trial Expired' | 'Trial Ended';
  teamId: number | null;
  usage: AdminUserUsageSummary | null;
};

export type AdminUserListResult = {
  users: AdminUserSummary[];
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
  plans: Array<{
    id: number;
    name: string;
    isActive: boolean;
    isTrial: boolean;
  }>;
};

function resolveTrialStatus(expiresAt: Date | null, reference: Date): 'Trial Active' | 'Trial Expired' | 'Trial Ended' {
  if (!expiresAt) {
    return 'Trial Ended';
  }

  const timestamp = expiresAt.getTime();
  if (Number.isNaN(timestamp)) {
    return 'Trial Ended';
  }

  return timestamp >= reference.getTime() ? 'Trial Active' : 'Trial Expired';
}

export async function updateUserPlan(
  { userId, plan }: { userId: number; plan: UserPlan },
  client: any = db
) {
  const executor = client ?? db;

  const [planRow] = await executor
    .select(PLAN_SELECTION)
    .from(plans)
    .where(eq(plans.name, plan))
    .limit(1);

  let resolvedPlan: PlanRecord | null = null;
  if (planRow) {
    resolvedPlan = mapPlanRow(planRow);
    if (!resolvedPlan.isActive) {
      throw new InvalidPlanAssignmentError('Plan is inactive');
    }
  } else {
    const fallbackLimits = DEFAULT_PLAN_USAGE_LIMITS[plan];
    if (!fallbackLimits) {
      throw new InvalidPlanAssignmentError('Plan not found');
    }
    resolvedPlan = {
      id: -1,
      name: plan,
      maxProspects: fallbackLimits.prospects,
      maxEmailsPerMonth: fallbackLimits.emailsPerMonth,
      maxCredits: fallbackLimits.credits,
      isActive: true,
      isTrial: plan === 'Trial',
      sortOrder: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      limits: fallbackLimits
    } satisfies PlanRecord;
  }

  const result = await executor.transaction(async (tx: DbExecutor) => {
    const [userRow] = await tx
      .update(users)
      .set({ plan, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        plan: users.plan
      });

    if (!userRow) {
      return null;
    }

    const teamId = await resolvePrimaryTeamIdForUser(userId, tx);
    if (teamId != null) {
      await tx
        .update(teams)
        .set({ planName: plan, updatedAt: new Date() })
        .where(eq(teams.id, teamId));
    }

    return {
      user: userRow,
      plan: resolvedPlan
    };
  });

  return result;
}

export async function updateUserStatus(
  {
    userId,
    status,
    refreshTrial = false
  }: {
    userId: number;
    status: 'active' | 'inactive';
    refreshTrial?: boolean;
  },
  client: any = db
) {
  const executor = client ?? db;
  const now = new Date();
  const updatePayload: Partial<(typeof users.$inferInsert)> = {
    status,
    updatedAt: now
  };

  if (refreshTrial) {
    updatePayload.trialExpiresAt = calculateTrialExpiry(now);
  }

  const [updated] = await executor
    .update(users)
    .set(updatePayload)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      status: users.status,
      trialExpiresAt: users.trialExpiresAt
    });

  return updated ?? null;
}

export async function expireTrialUsers(
  now = new Date(),
  client: any = db
): Promise<Array<{ id: number; email: string; trialExpiresAt: Date | null }>> {
  const executor = client ?? db;
  const reference = now instanceof Date ? now : new Date(now);

  const expired = await executor
    .update(users)
    .set({ status: 'inactive', updatedAt: reference })
    .where(
      and(
        isNotNull(users.trialExpiresAt),
        lte(users.trialExpiresAt, reference),
        eq(users.status, 'active')
      )
    )
    .returning({
      id: users.id,
      email: users.email,
      trialExpiresAt: users.trialExpiresAt
    });

  return expired;
}

export async function getAdminUsers(
  {
    page = 1,
    status,
    pageSize = 20
  }: {
    page?: number;
    status?: 'active' | 'inactive';
    pageSize?: number;
  } = {}
): Promise<AdminUserListResult> {
  const safePage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : 20;
  const offset = (safePage - 1) * safePageSize;
  const executor = db;
  const conditions: SQL[] = [];
  if (status) {
    conditions.push(eq(users.status, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countQuery = executor.select({ value: sql<number>`COUNT(*)` }).from(users);
  const countRows = whereClause ? await countQuery.where(whereClause) : await countQuery;
  const total = countRows[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));

  const idQuery = executor
    .select({ id: users.id })
    .from(users)
    .orderBy(desc(users.signupDate), desc(users.id))
    .limit(safePageSize)
    .offset(offset);
  const idRows = whereClause ? await idQuery.where(whereClause) : await idQuery;
  const userIds = idRows.map((row) => row.id);

  if (userIds.length === 0) {
    const planList = await getPlans();
    return {
      users: [],
      pagination: {
        page: safePage,
        totalPages,
        total
      },
      plans: planList.map((plan) => ({
        id: plan.id,
        name: plan.name,
        isActive: plan.isActive,
        isTrial: plan.isTrial
      }))
    };
  }

  const userRows = await executor
    .select({
      id: users.id,
      email: users.email,
      plan: users.plan,
      status: users.status,
      signupDate: users.signupDate,
      trialExpiresAt: users.trialExpiresAt
    })
    .from(users)
    .where(inArray(users.id, userIds));

  const memberships = await executor
    .select({
      userId: teamMembers.userId,
      teamId: teamMembers.teamId,
      joinedAt: teamMembers.joinedAt,
      membershipId: teamMembers.id
    })
    .from(teamMembers)
    .where(inArray(teamMembers.userId, userIds))
    .orderBy(asc(teamMembers.joinedAt), asc(teamMembers.id));

  const primaryMembership = new Map<number, { teamId: number; joinedAt: Date | null }>();
  for (const membership of memberships) {
    if (!primaryMembership.has(membership.userId)) {
      primaryMembership.set(membership.userId, {
        teamId: membership.teamId,
        joinedAt: membership.joinedAt instanceof Date ? membership.joinedAt : membership.joinedAt ? new Date(membership.joinedAt) : null
      });
    }
  }

  const teamIds = Array.from(new Set(Array.from(primaryMembership.values()).map((row) => row.teamId))).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const teamRows = teamIds.length
    ? await executor
        .select({ id: teams.id, planName: teams.planName })
        .from(teams)
        .where(inArray(teams.id, teamIds))
    : [];

  const teamById = new Map<number, { id: number; planName: string | null }>(teamRows.map((row) => [row.id, row]));

  const planList = await getPlans();
  const planByName = new Map<string, PlanRecord>(planList.map((plan) => [plan.name, plan]));

  const usageByTeam = new Map<number, AdminUserUsageSummary | null>();
  for (const teamId of teamIds) {
    try {
      const summary = await getTeamUsageSummary(teamId);
      const monthStartIso = `${summary.monthStart}T00:00:00.000Z`;
      const monthStartDate = new Date(monthStartIso);
      usageByTeam.set(teamId, {
        prospectsUsed: summary.prospects.used,
        prospectsLimit: summary.prospects.limit,
        emailsUsed: summary.emails.used,
        emailsLimit: summary.emails.limit,
        emailsMonthStart: Number.isNaN(monthStartDate.getTime()) ? null : monthStartDate
      });
    } catch (error) {
      console.warn?.('[getAdminUsers] Failed to load usage for team', teamId, error);
      usageByTeam.set(teamId, null);
    }
  }

  const userById = new Map(userRows.map((row) => [row.id, row]));
  const now = new Date();

  const usersResult: AdminUserSummary[] = [];
  for (const id of userIds) {
    const userRow = userById.get(id);
    if (!userRow) {
      continue;
    }

    const membership = primaryMembership.get(id);
    const teamId = membership?.teamId ?? null;
    const teamMeta = teamId != null ? teamById.get(teamId) ?? null : null;
    const planName = (userRow.plan as string | null) ?? teamMeta?.planName ?? null;
    const planMeta = planName ? planByName.get(planName) ?? null : null;

    const fallbackPlanLimits = planName && !planMeta ? DEFAULT_PLAN_USAGE_LIMITS[planName as UserPlan] : undefined;
    const planIsTrial = planMeta?.isTrial ?? (planName === 'Trial' ? true : null);
    const planIsActive = planMeta?.isActive ?? (planMeta ? true : fallbackPlanLimits ? true : null);

    const signupDate = userRow.signupDate instanceof Date ? userRow.signupDate : new Date(userRow.signupDate);
    const trialExpiresAt = userRow.trialExpiresAt instanceof Date
      ? userRow.trialExpiresAt
      : userRow.trialExpiresAt
        ? new Date(userRow.trialExpiresAt)
        : null;

    usersResult.push({
      id: userRow.id,
      email: userRow.email,
      plan: planName,
      planIsActive,
      planIsTrial,
      status: userRow.status,
      signupDate,
      trialExpiresAt,
      trialStatus: resolveTrialStatus(trialExpiresAt, now),
      teamId,
      usage: teamId != null ? usageByTeam.get(teamId) ?? null : null
    });
  }

  return {
    users: usersResult,
    pagination: {
      page: safePage,
      totalPages,
      total
    },
    plans: planList.map((plan) => ({
      id: plan.id,
      name: plan.name,
      isActive: plan.isActive,
      isTrial: plan.isTrial
    }))
  };
}

export async function setPlanActiveStatus(
  planId: number,
  isActive: boolean,
  client: any = db
): Promise<PlanRecord | null> {
  const executor = client ?? db;
  const [updated] = await executor
    .update(plans)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(plans.id, planId))
    .returning(PLAN_SELECTION);

  return updated ? mapPlanRow(updated) : null;
}

type MonthlyUsageRow = {
  id: number;
  prospectsUsed: number;
  emailsSent: number;
  creditsUsed: number;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function formatMonthStart(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return MONTH_FORMATTER.format(utc);
}

async function resolveTeamPlan(teamId: number, client: any): Promise<TeamPlanInfo> {
  const [teamRow] = await client
    .select({ planName: teams.planName })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const rawPlanName = teamRow?.planName ?? DEFAULT_USER_PLAN;
  const knownPlans = Object.keys(DEFAULT_PLAN_USAGE_LIMITS) as UserPlan[];
  const fallbackPlan: UserPlan = knownPlans.includes(rawPlanName as UserPlan)
    ? (rawPlanName as UserPlan)
    : DEFAULT_USER_PLAN;

  const [planRow] = await client
    .select({
      name: plans.name,
      maxProspects: plans.maxProspects,
      maxEmailsPerMonth: plans.maxEmailsPerMonth,
      maxCredits: plans.maxCredits,
      isActive: plans.isActive,
      isTrial: plans.isTrial
    })
    .from(plans)
    .where(eq(plans.name, rawPlanName))
    .limit(1);

  if (planRow) {
    return {
      plan: planRow.name,
      planIsTrial: planRow.isTrial ?? false,
      planIsActive: planRow.isActive ?? true,
      limits: {
        prospects: planRow.maxProspects,
        emailsPerMonth: planRow.maxEmailsPerMonth,
        credits: planRow.maxCredits
      }
    };
  }

  const defaultLimits = DEFAULT_PLAN_USAGE_LIMITS[fallbackPlan] ?? DEFAULT_PLAN_USAGE_LIMITS[DEFAULT_USER_PLAN];

  return {
    plan: fallbackPlan,
    planIsTrial: fallbackPlan === 'Trial',
    planIsActive: true,
    limits: defaultLimits
  };
}

async function getOrCreateMonthlyUsage(teamId: number, monthStart: string, client: any): Promise<MonthlyUsageRow> {
  const [existing] = await client
    .select({
      id: teamUsageLimits.id,
      prospectsUsed: teamUsageLimits.prospectsUsed,
      emailsSent: teamUsageLimits.emailsSent,
      creditsUsed: teamUsageLimits.creditsUsed
    })
    .from(teamUsageLimits)
    .where(and(eq(teamUsageLimits.teamId, teamId), eq(teamUsageLimits.monthStart, monthStart)))
    .limit(1);

  if (existing) {
    return existing;
  }

  await client
    .insert(teamUsageLimits)
    .values({
      teamId,
      monthStart,
      prospectsUsed: 0,
      emailsSent: 0,
      creditsUsed: 0
    })
    .onConflictDoNothing({
      target: [teamUsageLimits.teamId, teamUsageLimits.monthStart]
    });

  return {
    id: 0,
    prospectsUsed: 0,
    emailsSent: 0,
    creditsUsed: 0
  };
}

async function getProspectCount(teamId: number, client: any): Promise<number> {
  const result = await client
    .select({ value: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.teamId, teamId));

  return result[0]?.value ?? 0;
}

async function ensureProspectCapacity(teamId: number, additional: number, now: Date, client: any) {
  if (additional <= 0) {
    return;
  }

  const planInfo = await resolveTeamPlan(teamId, client);
  const limit = planInfo.limits.prospects;

  if (limit <= 0) {
    throw new PlanLimitExceededError('prospects', limit, 0);
  }

  const currentCount = await getProspectCount(teamId, client);
  const remaining = limit - currentCount;

  if (remaining < additional) {
    throw new PlanLimitExceededError('prospects', limit, Math.max(0, remaining));
  }

  await getOrCreateMonthlyUsage(teamId, formatMonthStart(now), client);
}

type UsageDelta = {
  prospects?: number;
  emails?: number;
  credits?: number;
};

async function incrementUsageCounters(teamId: number, deltas: UsageDelta, now: Date, client: any) {
  const { prospects = 0, emails = 0, credits = 0 } = deltas;
  if (prospects === 0 && emails === 0 && credits === 0) {
    return;
  }

  const monthStart = formatMonthStart(now);
  await getOrCreateMonthlyUsage(teamId, monthStart, client);

  const updatePayload: Record<string, unknown> = {
    updatedAt: now
  };

  if (prospects !== 0) {
    updatePayload.prospectsUsed = sql`${teamUsageLimits.prospectsUsed} + ${prospects}`;
  }
  if (emails !== 0) {
    updatePayload.emailsSent = sql`${teamUsageLimits.emailsSent} + ${emails}`;
  }
  if (credits !== 0) {
    updatePayload.creditsUsed = sql`${teamUsageLimits.creditsUsed} + ${credits}`;
  }

  await client
    .update(teamUsageLimits)
    .set(updatePayload)
    .where(and(eq(teamUsageLimits.teamId, teamId), eq(teamUsageLimits.monthStart, monthStart)));
}

export type ContactCustomFieldType = (typeof contactCustomFieldDefinitions.$inferSelect)['type'];

type PreparedCustomFieldValue = {
  textValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
};

function prepareCustomFieldValue(
  type: ContactCustomFieldType,
  rawValue: string | number | null,
  fieldId: string
): PreparedCustomFieldValue {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { textValue: null, numberValue: null, dateValue: null };
  }

  if (type === 'text') {
    return { textValue: String(rawValue), numberValue: null, dateValue: null };
  }

  if (type === 'number') {
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numeric)) {
      throw new InvalidCustomFieldValueError(fieldId, 'Custom field requires a numeric value');
    }
    return { textValue: null, numberValue: numeric, dateValue: null };
  }

  if (type === 'date') {
    if (typeof rawValue !== 'string') {
      throw new InvalidCustomFieldValueError(fieldId, 'Custom field requires a date value');
    }

    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      return { textValue: null, numberValue: null, dateValue: null };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { textValue: null, numberValue: null, dateValue: trimmed };
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new InvalidCustomFieldValueError(fieldId, 'Custom field requires a valid ISO date value');
    }

    return { textValue: null, numberValue: null, dateValue: parsed.toISOString().slice(0, 10) };
  }

  return { textValue: null, numberValue: null, dateValue: null };
}

async function upsertContactCustomFieldValues(
  client: any,
  teamId: number,
  contactId: string,
  values: Record<string, string | number | null>
) {
  const fieldIds = Object.keys(values);
  if (fieldIds.length === 0) {
    return;
  }

  const definitions = await client
    .select({
      id: contactCustomFieldDefinitions.id,
      type: contactCustomFieldDefinitions.type
    })
    .from(contactCustomFieldDefinitions)
    .where(and(eq(contactCustomFieldDefinitions.teamId, teamId), inArray(contactCustomFieldDefinitions.id, fieldIds)));

  const definitionMap = new Map<string, ContactCustomFieldType>(
    definitions.map((definition: { id: string; type: ContactCustomFieldType }) => [definition.id, definition.type])
  );

  const now = new Date();
  const writes = fieldIds.map((fieldId) => {
    const type = definitionMap.get(fieldId);
    if (!type) {
      throw new InvalidCustomFieldValueError(fieldId, 'Unknown custom field');
    }

    const prepared = prepareCustomFieldValue(type, values[fieldId], fieldId);
    return {
      contactId,
      fieldId,
      textValue: prepared.textValue,
      numberValue: prepared.numberValue,
      dateValue: prepared.dateValue,
      createdAt: now,
      updatedAt: now
    };
  });

  if (writes.length === 0) {
    return;
  }

  await client
    .insert(contactCustomFieldValues)
    .values(writes)
    .onConflictDoUpdate({
      target: [contactCustomFieldValues.contactId, contactCustomFieldValues.fieldId],
      set: {
        textValue: sql`excluded.text_value`,
        numberValue: sql`excluded.number_value`,
        dateValue: sql`excluded.date_value`,
        updatedAt: now
      }
    });
}

export type TeamUsageSummary = {
  teamId: number;
  plan: string;
  planIsTrial: boolean;
  planIsActive: boolean;
  monthStart: string;
  limits: TeamPlanInfo['limits'];
  prospects: { used: number; limit: number; remaining: number };
  emails: { used: number; limit: number; remaining: number };
  credits: { used: number; limit: number; remaining: number };
};

export async function getTeamUsageSummary(teamId: number, now: Date = new Date(), client: any = db): Promise<TeamUsageSummary> {
  const executor = client ?? db;
  const planInfo = await resolveTeamPlan(teamId, executor);
  const monthStart = formatMonthStart(now);
  const usage = await getOrCreateMonthlyUsage(teamId, monthStart, executor);
  const totalProspects = await getProspectCount(teamId, executor);

  if (usage.prospectsUsed !== totalProspects) {
    await executor
      .update(teamUsageLimits)
      .set({ prospectsUsed: totalProspects, updatedAt: now })
      .where(and(eq(teamUsageLimits.teamId, teamId), eq(teamUsageLimits.monthStart, monthStart)));
    usage.prospectsUsed = totalProspects;
  }

  return {
    teamId,
    plan: planInfo.plan,
    planIsTrial: planInfo.planIsTrial,
    planIsActive: planInfo.planIsActive,
    monthStart,
    limits: planInfo.limits,
    prospects: {
      used: totalProspects,
      limit: planInfo.limits.prospects,
      remaining: Math.max(0, planInfo.limits.prospects - totalProspects)
    },
    emails: {
      used: usage.emailsSent,
      limit: planInfo.limits.emailsPerMonth,
      remaining: Math.max(0, planInfo.limits.emailsPerMonth - usage.emailsSent)
    },
    credits: {
      used: usage.creditsUsed,
      limit: planInfo.limits.credits,
      remaining: Math.max(0, planInfo.limits.credits - usage.creditsUsed)
    }
  };
}

export async function assertCanSendEmails(teamId: number, emailsToSend: number, now: Date = new Date(), client: any = db) {
  if (emailsToSend <= 0) {
    return;
  }

  const executor = client ?? db;
  const planInfo = await resolveTeamPlan(teamId, executor);
  const monthStart = formatMonthStart(now);
  const usage = await getOrCreateMonthlyUsage(teamId, monthStart, executor);

  const limit = planInfo.limits.emailsPerMonth;
  const remaining = limit - usage.emailsSent;

  if (remaining < emailsToSend) {
    throw new PlanLimitExceededError('emails', limit, Math.max(0, remaining));
  }
}

export async function trackEmailsSent(teamId: number, count: number, now: Date = new Date(), client: any = db) {
  if (count <= 0) {
    return;
  }

  const executor = client ?? db;
  const monthStart = formatMonthStart(now);
  await getOrCreateMonthlyUsage(teamId, monthStart, executor);

  await executor
    .update(teamUsageLimits)
    .set({
      emailsSent: sql`${teamUsageLimits.emailsSent} + ${count}`,
      updatedAt: now
    })
    .where(and(eq(teamUsageLimits.teamId, teamId), eq(teamUsageLimits.monthStart, monthStart)));
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
