import { ImapFlow } from 'imapflow';
import type { ParsedMail } from 'mailparser';
import { simpleParser } from 'mailparser';
import Poplib from 'poplib';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  contacts,
  contactSequenceStatus,
  deliveryLogs,
  senders,
  sequenceSteps,
  sequences,
  type SenderStatus
} from '@/lib/db/schema';
import { decryptSecret, isProbablyEncryptedSecret } from '@/lib/security/encryption';
import { normalizeMessageId, normalizeMessageIdList } from '@/lib/mail/message-id';

export type SenderSecurity = 'SSL/TLS' | 'STARTTLS' | 'None';
export type InboundProtocol = 'IMAP' | 'POP3';

type SenderWithInbound = {
  id: number;
  teamId: number;
  name: string;
  email: string;
  inboundHost: string;
  inboundPort: number;
  inboundSecurity: SenderSecurity;
  inboundProtocol: InboundProtocol;
  username: string;
  password: string;
  status: SenderStatus;
};

type ContactRecord = {
  id: string;
  teamId: number;
  email: string;
};

type SequenceStatusRecord = {
  id: string;
  sequenceId: string;
  stepId: string | null;
  status: string;
};

type ReplyLogPayload = {
  inReplyTo?: string | null;
  references?: string[];
  subject?: string | null;
  via: 'reply-detection-worker';
  messageId?: string | null;
  senderId: number;
  deliveryLogId?: string | null;
};

type DeliveryLogRecord = {
  id: string;
  sequenceId: string;
  statusId: string | null;
  messageId: string | null;
  stepId: string | null;
  sequenceStatus: string;
  sequenceDeletedAt: Date | null;
  contact: ContactRecord;
};

export type InboundMessage = {
  internalId: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromAddress: string | null;
  subject: string | null;
  receivedAt: Date | null;
};

export type ReplyDetectionMetrics = {
  senderId: number;
  fetched: number;
  matched: number;
  ignored: number;
  errors: number;
};

export type RecordReplyResult = {
  recorded: boolean;
  statusUpdated: boolean;
  deliveryLogId: string | null;
};

export type ReplyDetectionRepository = {
  listEligibleSenders(): Promise<SenderWithInbound[]>;
  findContactByEmail(teamId: number, email: string): Promise<ContactRecord | null>;
  findContactById(contactId: string): Promise<ContactRecord | null>;
  findActiveSequenceStatuses(contactId: string, options?: { sequenceIds?: string[] }): Promise<SequenceStatusRecord[]>;
  findDeliveryLogsByMessageIds(messageIds: string[]): Promise<DeliveryLogRecord[]>;
  recordReply(params: {
    status: SequenceStatusRecord;
    contact: ContactRecord;
    sender: SenderWithInbound;
    message: InboundMessage;
    deliveryLogId?: string | null;
  }): Promise<RecordReplyResult>;
};

export type MailClient = {
  connect(): Promise<void>;
  fetchMessages(limit?: number): AsyncGenerator<InboundMessage>;
  markAsProcessed(id: string): Promise<void>;
  close(): Promise<void>;
};

type MailClientFactory = (sender: SenderWithInbound) => MailClient;

export type ReplyDetectionWorkerOptions = {
  messageLimit?: number;
  log?: Pick<typeof console, 'info' | 'warn' | 'error'>;
  repository?: ReplyDetectionRepository;
  mailClientFactory?: MailClientFactory;
  debug?: boolean;
};

function parseDebugFlag(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

// Ensure legacy databases include the delivery status values required for reply logging.
let deliveryStatusEnumEnsured = false;
let deliveryStatusEnumEnsuring: Promise<void> | null = null;

async function ensureDeliveryStatusEnumValues(): Promise<void> {
  if (deliveryStatusEnumEnsured) {
    return;
  }

  if (!deliveryStatusEnumEnsuring) {
    deliveryStatusEnumEnsuring = db
      .execute(sql`
        DO $$
        BEGIN
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
      `)
      .then(() => {
        deliveryStatusEnumEnsured = true;
      })
      .finally(() => {
        deliveryStatusEnumEnsuring = null;
      });
  }

  await deliveryStatusEnumEnsuring;
}

function getHeaderEntry(headers: unknown, key: string): unknown {
  if (!headers) {
    return undefined;
  }

  const normalized = key.toLowerCase();
  const upperKey = key.toUpperCase();
  const compactKey = key.replace(/-/g, '');
  const compactNormalized = normalized.replace(/-/g, '');

  if (headers instanceof Map) {
    return (
      headers.get(normalized) ??
      headers.get(key) ??
      headers.get(upperKey) ??
      headers.get(compactKey) ??
      headers.get(compactNormalized)
    );
  }

  if (typeof headers === 'object' && headers !== null) {
    const record = headers as Record<string, unknown>;
    return (
      record[normalized] ??
      record[key] ??
      record[upperKey] ??
      record[compactKey] ??
      record[compactNormalized]
    );
  }

  return undefined;
}

function coerceHeaderValues(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return value.trim().length > 0 ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => coerceHeaderValues(entry));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates: Array<string | null | undefined> = [];

    if (typeof record.value === 'string') {
      candidates.push(record.value);
    }
    if (typeof record.text === 'string') {
      candidates.push(record.text);
    }
    if (typeof record.address === 'string') {
      candidates.push(record.address);
    }
    if (Array.isArray(record.value)) {
      candidates.push(...coerceHeaderValues(record.value));
    }

    return candidates
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
      .map((candidate) => candidate.trim());
  }

  return [];
}

function getHeaderValues(headers: unknown, key: string): string[] {
  return coerceHeaderValues(getHeaderEntry(headers, key));
}

function getHeaderFirstValue(headers: unknown, key: string): string | null {
  const values = getHeaderValues(headers, key);
  return values.length > 0 ? values[0] : null;
}

class ImapMailClient implements MailClient {
  constructor(private readonly sender: SenderWithInbound) {}

  private client: ImapFlow | null = null;

  async connect(): Promise<void> {
    const secure = this.sender.inboundSecurity === 'SSL/TLS';
    const useStartTls = this.sender.inboundSecurity === 'STARTTLS';
    const socketTimeoutEnv = Number.parseInt(process.env.IMAP_SOCKET_TIMEOUT_MS ?? '', 10);
    const socketTimeout = Number.isFinite(socketTimeoutEnv) && socketTimeoutEnv > 0 ? socketTimeoutEnv : 60000;

    this.client = new ImapFlow({
      host: this.sender.inboundHost,
      port: this.sender.inboundPort,
      secure,
      logger: false,
      socketTimeout,
      auth: {
        user: this.sender.username,
        pass: this.sender.password
      },
      tls: useStartTls || secure ? { rejectUnauthorized: false } : undefined
    });

    await this.client.connect();
    await this.client.mailboxOpen('INBOX');
  }

  async *fetchMessages(limit?: number): AsyncGenerator<InboundMessage> {
    if (!this.client) {
      return;
    }

    const debugEnabled = parseDebugFlag(process.env.DEBUG_INBOUND);

    const searchResult = await this.client.search({ seen: false });
    const uids = Array.isArray(searchResult) ? searchResult : [];

    if (!uids.length) {
      return;
    }

    const slice = typeof limit === 'number' && limit > 0 ? uids.slice(0, limit) : uids;

    for await (const message of this.client.fetch(slice, {
      uid: true,
      envelope: true,
      source: false,
      internalDate: true,
      headers: ['message-id', 'in-reply-to', 'references', 'from', 'subject']
    })) {
      const headers = message.headers as unknown;

      const rawReferences = getHeaderValues(headers, 'references');
      const references = rawReferences
        .flatMap((value) => value.split(/\s+/g))
        .map((token) => token.trim())
        .filter(Boolean);

      const inReplyToHeader = getHeaderFirstValue(headers, 'in-reply-to');
      const inReplyTo = inReplyToHeader ?? message.envelope?.inReplyTo ?? null;

      const fromHeader = getHeaderFirstValue(headers, 'from');
      const fromEnvelope = message.envelope?.from?.[0]?.address ?? null;
      const fromAddress = fromEnvelope ?? fromHeader ?? null;

      const subjectHeader = getHeaderFirstValue(headers, 'subject');
      const subject = subjectHeader ?? message.envelope?.subject ?? null;

      if (debugEnabled) {
        try {
          console.info({
            tag: '[ReplyWorker]',
            level: 'debug',
            action: 'imap-parsed-headers',
            internalId: String(message.uid ?? message.seq ?? ''),
            headers: {
              from: fromHeader ?? null,
              inReplyTo: inReplyToHeader ?? null,
              references,
              subject: subjectHeader ?? null
            }
          });
        } catch (error) {
          console.warn?.('[ReplyDetectionWorker] Failed to log parsed headers', error);
        }
      }

      yield {
        internalId: String(message.uid ?? message.seq),
        messageId: message.envelope?.messageId ?? null,
        inReplyTo,
        references,
        fromAddress,
        subject,
        receivedAt: message.internalDate ? new Date(message.internalDate) : null
      } satisfies InboundMessage;
    }
  }

  async markAsProcessed(id: string): Promise<void> {
    if (!this.client || !id) {
      return;
    }

    await this.client.messageFlagsAdd(id, ['\\Seen'], { uid: true });
  }

  async close(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.logout();
    } finally {
      this.client = null;
    }
  }
}

class Pop3MailClient implements MailClient {
  constructor(private readonly sender: SenderWithInbound, private readonly fetchWindow = 25) {}

  private client: Poplib | null = null;
  private messages: InboundMessage[] = [];

  async connect(): Promise<void> {
    const options: Record<string, unknown> = {
      tlserrs: false,
      enabletls: this.sender.inboundSecurity === 'SSL/TLS',
      usetls: this.sender.inboundSecurity === 'STARTTLS',
      debug: false
    };

    this.client = new Poplib(this.sender.inboundPort, this.sender.inboundHost, options);

    await new Promise<void>((resolve, reject) => {
      const client = this.client!;

      const cleanup = () => {
        client.removeAllListeners();
      };

      client.on('error', (error: Error) => {
        cleanup();
        reject(error);
      });

      client.on('connect', () => {
        client.login(this.sender.username, this.sender.password);
      });

      client.on('invalid-state', (cmd: string) => {
        cleanup();
        reject(new Error(`POP3 invalid state: ${cmd}`));
      });

      client.on('locked', () => {
        cleanup();
        reject(new Error('POP3 mailbox locked'));
      });

      client.on('login', (status: boolean, raw: string) => {
        if (!status) {
          cleanup();
          reject(new Error(`POP3 login failed: ${raw}`));
          return;
        }
        client.list();
      });

      client.on('list', (status: boolean, count: number) => {
        if (!status) {
          cleanup();
          reject(new Error('POP3 LIST command failed'));
          return;
        }

        if (count === 0) {
          client.quit();
          cleanup();
          resolve();
          return;
        }

        const toFetch = Math.max(0, Math.min(count, this.fetchWindow));
        let fetched = 0;

        client.on('top', async (topStatus: boolean, number: number, data: string) => {
          if (!topStatus) {
            cleanup();
            reject(new Error('POP3 TOP command failed'));
            return;
          }

          try {
            const parsed = await this.parseMessage(data, number);
            this.messages.push(parsed);
          } catch (error) {
            cleanup();
            reject(error instanceof Error ? error : new Error('POP3 parse failed'));
            return;
          }

          fetched += 1;
          if (fetched >= toFetch) {
            client.quit();
            cleanup();
            resolve();
          } else {
            const next = number - 1;
            if (next >= 1) {
              client.top(next, 0);
            } else {
              client.quit();
              cleanup();
              resolve();
            }
          }
        });

        client.top(count, 0);
      });
    });
  }

  private async parseMessage(source: string, internalId: number): Promise<InboundMessage> {
    const parsed: ParsedMail = await simpleParser(source);
    const referencesHeader = parsed.headers.get('references');
    const references = Array.isArray(referencesHeader)
      ? referencesHeader.flatMap((value) => value.split(/\s+/g)).filter(Boolean)
      : typeof referencesHeader === 'string'
        ? referencesHeader.split(/\s+/g).filter(Boolean)
        : [];

    const inReplyToHeader = parsed.headers.get('in-reply-to');

    return {
      internalId: String(internalId),
      messageId: parsed.messageId ?? null,
      inReplyTo: typeof inReplyToHeader === 'string' ? inReplyToHeader : null,
      references,
      fromAddress: parsed.from?.value?.[0]?.address ?? null,
      subject: parsed.subject ?? null,
      receivedAt: parsed.date ?? null
    } satisfies InboundMessage;
  }

  async *fetchMessages(limit?: number): AsyncGenerator<InboundMessage> {
    const messages = typeof limit === 'number' && limit > 0 ? this.messages.slice(0, limit) : this.messages;
    for (const message of messages) {
      yield message;
    }
  }

  async markAsProcessed(_id: string): Promise<void> {
    // POP3 does not support marking as read without deleting; no-op keeps messages for manual follow-up.
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.quit();
      this.client = null;
    }
  }
}

function extractEmailAddress(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const match = raw.match(/<([^>]+)>/);
  if (match?.[1]) {
    return match[1].trim().toLowerCase();
  }

  return raw.trim().toLowerCase();
}

function createMailClient(sender: SenderWithInbound): MailClient {
  if (sender.inboundProtocol === 'POP3') {
    return new Pop3MailClient(sender);
  }
  return new ImapMailClient(sender);
}

class DrizzleReplyDetectionRepository implements ReplyDetectionRepository {
  async listEligibleSenders(): Promise<SenderWithInbound[]> {
    const rows = await db
      .select({
        id: senders.id,
        teamId: senders.teamId,
        name: senders.name,
        email: senders.email,
        inboundHost: senders.inboundHost,
        inboundPort: senders.inboundPort,
        inboundSecurity: senders.inboundSecurity,
        inboundProtocol: senders.inboundProtocol,
        username: senders.username,
        password: senders.password,
        status: senders.status
      })
      .from(senders)
      .where(
        and(
          isNotNull(senders.inboundHost),
          isNotNull(senders.inboundPort),
          isNotNull(senders.inboundProtocol),
          isNotNull(senders.username),
          isNotNull(senders.password),
          inArray(senders.status, ['active', 'verified'])
        )
      );

    return rows
      .filter((row) => row.inboundHost && row.inboundPort && row.inboundProtocol && row.username && row.password)
      .map((row) => ({
        id: row.id,
        teamId: row.teamId,
        name: row.name,
        email: row.email,
        inboundHost: row.inboundHost!,
        inboundPort: row.inboundPort!,
        inboundSecurity: (row.inboundSecurity ?? 'SSL/TLS') as SenderSecurity,
        inboundProtocol: row.inboundProtocol as InboundProtocol,
        username: row.username!,
        password: isProbablyEncryptedSecret(row.password!) ? decryptSecret(row.password!) : row.password!,
        status: row.status
      }));
  }

  async findContactByEmail(teamId: number, email: string): Promise<ContactRecord | null> {
    const [contact] = await db
      .select({ id: contacts.id, teamId: contacts.teamId, email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.teamId, teamId), sql`lower(${contacts.email}) = lower(${email})`))
      .limit(1);

    return contact ?? null;
  }

  async findContactById(contactId: string): Promise<ContactRecord | null> {
    const [contact] = await db
      .select({ id: contacts.id, teamId: contacts.teamId, email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    return contact ?? null;
  }

  async findActiveSequenceStatuses(
    contactId: string,
    options?: { sequenceIds?: string[] }
  ): Promise<SequenceStatusRecord[]> {
    const filters = [
      eq(contactSequenceStatus.contactId, contactId),
      eq(sequences.status, 'active'),
      isNull(sequences.deletedAt)
    ];

    if (options?.sequenceIds && options.sequenceIds.length > 0) {
      filters.push(inArray(contactSequenceStatus.sequenceId, options.sequenceIds));
    }

    const whereClause = filters.length === 1 ? filters[0] : and(...filters);

    return await db
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

  async findDeliveryLogsByMessageIds(messageIds: string[]): Promise<DeliveryLogRecord[]> {
    const candidates = normalizeMessageIdList(messageIds);
    if (candidates.length === 0) {
      return [];
    }

    const rows = await db
      .select({
        id: deliveryLogs.id,
        sequenceId: deliveryLogs.sequenceId,
        statusId: deliveryLogs.statusId,
        messageId: deliveryLogs.messageId,
        stepId: deliveryLogs.stepId,
        sequenceStatus: sequences.status,
        sequenceDeletedAt: sequences.deletedAt,
        contactId: contacts.id,
        contactTeamId: contacts.teamId,
        contactEmail: contacts.email
      })
      .from(deliveryLogs)
      .innerJoin(contacts, eq(deliveryLogs.contactId, contacts.id))
      .innerJoin(sequences, eq(deliveryLogs.sequenceId, sequences.id))
      .where(and(inArray(deliveryLogs.messageId, candidates), inArray(deliveryLogs.type, ['send', 'manual_send'])))
      .orderBy(desc(deliveryLogs.createdAt));

    return rows.map((row) => ({
      id: row.id,
      sequenceId: row.sequenceId,
      statusId: row.statusId,
      messageId: row.messageId,
      stepId: row.stepId,
      sequenceStatus: row.sequenceStatus,
      sequenceDeletedAt: row.sequenceDeletedAt,
      contact: {
        id: row.contactId,
        teamId: row.contactTeamId,
        email: row.contactEmail
      }
    } satisfies DeliveryLogRecord));
  }

  async recordReply(params: {
    status: SequenceStatusRecord;
    contact: ContactRecord;
    sender: SenderWithInbound;
    message: InboundMessage;
    deliveryLogId?: string | null;
  }): Promise<RecordReplyResult> {
    const replyAt = params.message.receivedAt ?? new Date();
    const inboundCandidates = normalizeMessageIdList([params.message.messageId]);
    const inboundMessageId = normalizeMessageId(params.message.messageId) ?? inboundCandidates[0] ?? null;
    const resolvedDeliveryLogId = params.deliveryLogId ?? null;

    return await db.transaction(async (tx) => {
      const [currentStatus] = await tx
        .select({
          id: contactSequenceStatus.id,
          status: contactSequenceStatus.status,
          replyAt: contactSequenceStatus.replyAt
        })
        .from(contactSequenceStatus)
        .where(eq(contactSequenceStatus.id, params.status.id))
        .limit(1);

      if (!currentStatus) {
        return { recorded: false, statusUpdated: false, deliveryLogId: resolvedDeliveryLogId };
      }

      if (currentStatus.status === 'replied' && currentStatus.replyAt) {
        return { recorded: false, statusUpdated: false, deliveryLogId: resolvedDeliveryLogId };
      }

      let stepId = params.status.stepId;
      if (!stepId) {
        const [fallback] = await tx
          .select({ id: sequenceSteps.id })
          .from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, params.status.sequenceId))
          .orderBy(asc(sequenceSteps.order))
          .limit(1);
        stepId = fallback?.id ?? null;
      }

      if (!stepId) {
        return { recorded: false, statusUpdated: false, deliveryLogId: resolvedDeliveryLogId };
      }

      const [updatedStatus] = await tx
        .update(contactSequenceStatus)
        .set({ status: 'replied', replyAt, lastUpdated: new Date() })
        .where(eq(contactSequenceStatus.id, params.status.id))
        .returning({ id: contactSequenceStatus.id });

      const statusUpdated = Boolean(updatedStatus?.id);

      const payload: ReplyLogPayload = {
        inReplyTo: params.message.inReplyTo,
        references: params.message.references,
        subject: params.message.subject,
        via: 'reply-detection-worker',
        messageId: params.message.messageId,
        senderId: params.sender.id,
        deliveryLogId: resolvedDeliveryLogId
      };

      if (resolvedDeliveryLogId) {
        await tx
          .update(deliveryLogs)
          .set({ status: 'replied' })
          .where(eq(deliveryLogs.id, resolvedDeliveryLogId));
      }

      let deliveryLogId = resolvedDeliveryLogId ?? null;
      let recorded = false;

      if (inboundCandidates.length > 0) {
        const [existingReplyLog] = await tx
          .select({ id: deliveryLogs.id })
          .from(deliveryLogs)
          .where(inArray(deliveryLogs.messageId, inboundCandidates))
          .limit(1);

        if (existingReplyLog) {
          deliveryLogId = existingReplyLog.id;
        }
      }

      if (!deliveryLogId) {
        const [inserted] = await tx
          .insert(deliveryLogs)
          .values({
            contactId: params.contact.id,
            sequenceId: params.status.sequenceId,
            stepId,
            statusId: params.status.id,
            status: 'replied',
            type: 'reply',
            messageId: inboundMessageId,
            payload,
            attempts: 0
          })
          .returning({ id: deliveryLogs.id });

        if (inserted?.id) {
          deliveryLogId = inserted.id;
          recorded = true;
        }
      }

      return { recorded, statusUpdated, deliveryLogId };
    });
  }
}

function createDefaultRepository(): ReplyDetectionRepository {
  return new DrizzleReplyDetectionRepository();
}

export async function runReplyDetectionWorker(
  options: ReplyDetectionWorkerOptions = {}
): Promise<{
  metrics: ReplyDetectionMetrics[];
  totals: {
    fetched: number;
    matched: number;
    ignored: number;
    errors: number;
  };
}> {
  const repository = options.repository ?? createDefaultRepository();
  const factory = options.mailClientFactory ?? createMailClient;
  const log = options.log ?? console;
  const debugEnabled = options.debug ?? parseDebugFlag(process.env.DEBUG_INBOUND);
  const emitDebug = (action: string, fields: Record<string, unknown>) => {
    if (!debugEnabled) {
      return;
    }
    const entry = {
      tag: '[ReplyWorker]',
      level: 'debug',
      action,
      ...fields
    };
    if (typeof log.info === 'function') {
      log.info(entry);
    } else {
      console.info(entry);
    }
  };
  const limit = options.messageLimit && options.messageLimit > 0 ? options.messageLimit : undefined;

  if (!options.repository) {
    await ensureDeliveryStatusEnumValues();
  }

  const sendersWithInbound = await repository.listEligibleSenders();
  emitDebug('eligible-senders', { count: sendersWithInbound.length });
  if (sendersWithInbound.length === 0) {
    log.info?.('[ReplyDetectionWorker] No eligible senders found');
  }
  const metrics: ReplyDetectionMetrics[] = [];

  for (const sender of sendersWithInbound) {
    const senderMetrics: ReplyDetectionMetrics = {
      senderId: sender.id,
      fetched: 0,
      matched: 0,
      ignored: 0,
      errors: 0
    };

    const mailClient = factory(sender);

    try {
      emitDebug('sender-connecting', {
        senderId: sender.id,
        inboundHost: sender.inboundHost,
        protocol: sender.inboundProtocol,
        security: sender.inboundSecurity
      });
      await mailClient.connect();
      emitDebug('sender-connected', {
        senderId: sender.id
      });

      for await (const message of mailClient.fetchMessages(limit)) {
        senderMetrics.fetched += 1;

        emitDebug('message-fetched', {
          senderId: sender.id,
          internalId: message.internalId,
          messageId: message.messageId,
          from: message.fromAddress,
          subject: message.subject,
          inReplyTo: message.inReplyTo,
          references: message.references,
          receivedAt: message.receivedAt?.toISOString()
        });

        let matched = false;
        let ignoreReason: string | null = null;
        const fromAddress = extractEmailAddress(message.fromAddress);
        const normalizedMessageId = normalizeMessageId(message.messageId);
        const metadataCandidates = normalizeMessageIdList([
          message.inReplyTo,
          ...(message.references ?? [])
        ]);
        const metadataAvailable = metadataCandidates.length > 0;
        let contactLookupAttempted = false;
        let metadataMatches: DeliveryLogRecord[] = [];
        let deliveryLogMatch: DeliveryLogRecord | null = null;
        let contact: ContactRecord | null = null;

        if (!fromAddress) {
          ignoreReason = 'missing-from-address';
        }

        if (!ignoreReason && metadataAvailable) {
          try {
            metadataMatches = await repository.findDeliveryLogsByMessageIds(metadataCandidates);
          } catch (error) {
            senderMetrics.errors += 1;
            ignoreReason = 'delivery-log-lookup-error';
            log.error?.('[ReplyDetectionWorker] Delivery log lookup failed', {
              senderId: sender.id,
              candidates: metadataCandidates,
              error
            });
          }
        }

        const teamMatches = !ignoreReason
          ? metadataMatches.filter((entry) => entry.contact.teamId === sender.teamId)
          : [];

        emitDebug('metadata-match', {
          senderId: sender.id,
          internalId: message.internalId,
          metadataAvailable,
          candidates: metadataCandidates,
          matchCount: teamMatches.length,
          deliveryLogIds: teamMatches.map((entry) => entry.id)
        });

        if (!ignoreReason && teamMatches.length > 0) {
          const uniqueSequences = Array.from(new Set(teamMatches.map((entry) => entry.sequenceId)));

          if (uniqueSequences.length > 1) {
            ignoreReason = 'ambiguous-sequence';
          } else {
            const candidateLog = teamMatches[0];

            if (candidateLog.sequenceDeletedAt) {
              ignoreReason = 'sequence-deleted';
            } else if (candidateLog.sequenceStatus !== 'active') {
              ignoreReason = 'sequence-inactive';
            } else {
              deliveryLogMatch = candidateLog;
              contact = candidateLog.contact;
              emitDebug('delivery-log-selected', {
                senderId: sender.id,
                internalId: message.internalId,
                deliveryLogId: deliveryLogMatch.id,
                contactId: deliveryLogMatch.contact.id,
                sequenceId: deliveryLogMatch.sequenceId
              });
            }
          }
        } else if (!ignoreReason && metadataAvailable && metadataMatches.length > 0 && teamMatches.length === 0) {
          ignoreReason = 'contact-team-mismatch';
        }

        const allowFallbackToEmail = !metadataAvailable;

        if (!ignoreReason && !deliveryLogMatch && allowFallbackToEmail && fromAddress) {
          try {
            contactLookupAttempted = true;
            contact = await repository.findContactByEmail(sender.teamId, fromAddress);
            emitDebug('contact-lookup', {
              senderId: sender.id,
              internalId: message.internalId,
              from: fromAddress,
              matched: Boolean(contact),
              contactId: contact?.id ?? null,
              via: 'email'
            });
          } catch (error) {
            senderMetrics.errors += 1;
            ignoreReason = 'contact-lookup-error';
            log.error?.('[ReplyDetectionWorker] Contact lookup failed', {
              senderId: sender.id,
              fromAddress,
              error
            });
          }
        }

        if (!ignoreReason && contact && contact.teamId !== sender.teamId) {
          ignoreReason = 'contact-team-mismatch';
          contact = null;
        }

        if (!ignoreReason && !contact) {
          if (deliveryLogMatch) {
            ignoreReason = 'contact-missing-for-message';
          } else if (metadataAvailable && !contactLookupAttempted) {
            ignoreReason = 'delivery-log-not-found';
          } else {
            ignoreReason = 'unknown-contact';
          }
        }

        if (!ignoreReason && contact) {
          const sequenceFilter = deliveryLogMatch ? [deliveryLogMatch.sequenceId] : undefined;
          const statuses = await repository.findActiveSequenceStatuses(contact.id, {
            sequenceIds: sequenceFilter
          });

          emitDebug('sequence-status-check', {
            senderId: sender.id,
            internalId: message.internalId,
            contactId: contact.id,
            statusCount: statuses.length,
            sequenceIds: statuses.map((status) => status.sequenceId)
          });

          const nonRepliedStatuses = statuses.filter((status) => status.status !== 'replied');
          const candidateStatuses = (() => {
            if (deliveryLogMatch) {
              return nonRepliedStatuses.filter(
                (status) => status.sequenceId === deliveryLogMatch!.sequenceId
              );
            }

            if (nonRepliedStatuses.length === 1) {
              return nonRepliedStatuses;
            }

            return [] as SequenceStatusRecord[];
          })();

          if (!candidateStatuses.length) {
            ignoreReason = deliveryLogMatch
              ? 'sequence-inactive'
              : nonRepliedStatuses.length > 1
                ? 'ambiguous-sequence'
                : 'not-enrolled';
          } else {
            const inboundMessage: InboundMessage = {
              ...message,
              messageId: normalizedMessageId ?? message.messageId,
              references: message.references
            };

            for (const status of candidateStatuses) {
              try {
                const recordResult = await repository.recordReply({
                  status,
                  contact,
                  sender,
                  message: inboundMessage,
                  deliveryLogId: deliveryLogMatch?.id ?? null
                });

                emitDebug('record-reply', {
                  senderId: sender.id,
                  internalId: message.internalId,
                  contactId: contact.id,
                  sequenceId: status.sequenceId,
                  statusId: status.id,
                  recorded: recordResult.recorded,
                  statusUpdated: recordResult.statusUpdated,
                  deliveryLogId: recordResult.deliveryLogId
                });

                if (recordResult.statusUpdated) {
                  matched = true;
                  log.info?.('[ReplyDetectionWorker] Reply matched', {
                    senderId: sender.id,
                    contactId: contact.id,
                    sequenceId: status.sequenceId,
                    statusId: status.id,
                    deliveryLogId: recordResult.deliveryLogId,
                    messageId: inboundMessage.messageId ?? null
                  });
                  break;
                }

                if (!recordResult.recorded && recordResult.deliveryLogId && !ignoreReason) {
                  ignoreReason = 'duplicate-message-id';
                }
              } catch (error) {
                senderMetrics.errors += 1;
                log.error?.('[ReplyDetectionWorker] Record reply failed', {
                  senderId: sender.id,
                  statusId: status.id,
                  contactId: contact.id,
                  error
                });
                if (!ignoreReason) {
                  ignoreReason = 'record-reply-error';
                }
              }
            }
          }
        }

        if (matched) {
          senderMetrics.matched += 1;
        } else {
          const reason = ignoreReason ?? 'no-match';
          senderMetrics.ignored += 1;
          emitDebug('message-ignored', {
            senderId: sender.id,
            internalId: message.internalId,
            from: fromAddress,
            reason,
            contactId: contact?.id ?? deliveryLogMatch?.contact.id ?? null,
            sequenceId: deliveryLogMatch?.sequenceId ?? null,
            deliveryLogId: deliveryLogMatch?.id ?? null
          });
          log.info?.('[ReplyDetectionWorker] Reply ignored', {
            senderId: sender.id,
            from: fromAddress,
            reason,
            internalId: message.internalId,
            deliveryLogId: deliveryLogMatch?.id ?? null,
            contactId: contact?.id ?? deliveryLogMatch?.contact.id ?? null,
            sequenceId: deliveryLogMatch?.sequenceId ?? null
          });
        }

        try {
          emitDebug('message-processed', {
            senderId: sender.id,
            internalId: message.internalId
          });
          await mailClient.markAsProcessed(message.internalId);
        } catch (error) {
          senderMetrics.errors += 1;
          log.warn?.('[ReplyDetectionWorker] Failed to mark message processed', {
            senderId: sender.id,
            messageId: message.internalId,
            error
          });
        }
      }
    } catch (error) {
      senderMetrics.errors += 1;
      log.error?.('[ReplyDetectionWorker] Mailbox run failed', {
        senderId: sender.id,
        error
      });
    } finally {
      await mailClient.close();
    }

    metrics.push(senderMetrics);

    log.info?.('[ReplyDetectionWorker] Sender processed', {
      senderId: sender.id,
      fetched: senderMetrics.fetched,
      matched: senderMetrics.matched,
      ignored: senderMetrics.ignored,
      errors: senderMetrics.errors
    });
  }

  const totals = metrics.reduce(
    (acc, metric) => ({
      fetched: acc.fetched + metric.fetched,
      matched: acc.matched + metric.matched,
      ignored: acc.ignored + metric.ignored,
      errors: acc.errors + metric.errors
    }),
    { fetched: 0, matched: 0, ignored: 0, errors: 0 }
  );

  log.info?.('[ReplyDetectionWorker] Run complete', {
    senders: metrics.length,
    totals
  });

  if (metrics.length > 0) {
    const sums = totals;
    log.info?.('[ReplyDetectionWorker] Totals summary', {
      fetched: sums.fetched,
      matched: sums.matched,
      ignored: sums.ignored,
      errors: sums.errors
    });
  }

  return { metrics, totals };
}

if ((import.meta as any).main) {
  runReplyDetectionWorker()
    .then((result) => {
      const debugEnabled = parseDebugFlag(process.env.DEBUG_INBOUND);

      if (debugEnabled) {
        console.info({
          tag: '[ReplyWorker]',
          level: 'debug',
          action: 'run-summary',
          totals: result.totals,
          senderCount: result.metrics.length
        });
      }
    })
    .catch((error) => {
      console.error({ tag: '[ReplyWorker]', level: 'error', action: 'run-failed', error });
      process.exitCode = 1;
    });
}
