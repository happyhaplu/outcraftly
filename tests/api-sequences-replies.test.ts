import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InboundMessage, ReplyDetectionRepository } from '@/lib/workers/reply-detection-worker';
import { contactSequenceStatus as contactSequenceStatusTable, deliveryLogs as deliveryLogsTable, sequences as sequencesTable } from '@/lib/db/schema';

type SequenceRow = { id: string; teamId: number; deletedAt: Date | null };
type StatusRow = { id: string; contactId: string; sequenceId: string; status: string; replyAt: Date | null; lastUpdated?: Date | null };
type LogRow = { id: string; sequenceId: string; type: string; messageId: string | null };

const mockDbState: { sequences: SequenceRow[]; statuses: StatusRow[]; logs: LogRow[] } = {
  sequences: [],
  statuses: [],
  logs: []
};

const resetMockDbState = () => {
  mockDbState.sequences = [];
  mockDbState.statuses = [];
  mockDbState.logs = [];
};

const mockDbSelect = vi.fn(() => ({
  from: (table: unknown) => ({
    where: async () => {
      if (table === sequencesTable) {
        return mockDbState.sequences.map((row) => ({ id: row.id }));
      }
      if (table === contactSequenceStatusTable) {
        return mockDbState.statuses.map((row) => ({
          id: row.id,
          contactId: row.contactId,
          sequenceId: row.sequenceId,
          replyAt: row.replyAt
        }));
      }
      if (table === deliveryLogsTable) {
        return mockDbState.logs
          .filter((row) => row.type === 'reply')
          .map((row) => ({ id: row.id, sequenceId: row.sequenceId }));
      }
      return [];
    }
  })
}));

const mockDbUpdate = vi.fn((table: unknown) => ({
  set: (values: Record<string, unknown>) => ({
    where: (_condition: unknown) => ({
      returning: async () => {
        if (table === contactSequenceStatusTable) {
          if (values.status === 'sent') {
            const updated = mockDbState.statuses.filter((status) => status.status === 'replied');
            updated.forEach((status) => {
              status.status = 'sent';
              status.replyAt = null;
              status.lastUpdated = (values.lastUpdated as Date | undefined) ?? new Date();
            });
            return updated.map((status) => ({
              statusId: status.id,
              contactId: status.contactId,
              sequenceId: status.sequenceId
            }));
          }

          const updated = mockDbState.statuses.filter((status) => status.status !== 'replied' && status.replyAt !== null);
          updated.forEach((status) => {
            status.replyAt = null;
            status.lastUpdated = (values.lastUpdated as Date | undefined) ?? new Date();
          });
          return updated.map((status) => ({
            statusId: status.id,
            contactId: status.contactId,
            sequenceId: status.sequenceId
          }));
        }

        if (table === deliveryLogsTable) {
          const updated = mockDbState.logs.filter((log) => log.type === 'reply');
          updated.forEach((log) => {
            log.type = 'reply_archived';
          });
          return updated.map((log) => ({ id: log.id, sequenceId: log.sequenceId }));
        }

        return [];
      }
    })
  })
}));

const mockClient = {
  end: vi.fn(async () => {})
};

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    execute: vi.fn()
  },
  client: mockClient
}));

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const listRepliesMock = vi.fn();
const listBouncesMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

type GetRoute = (request: Request, context: { params: { id: string } }) => Promise<Response>;
let GET: GetRoute;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    listSequenceRepliesForTeam: listRepliesMock,
    listSequenceBouncesForTeam: listBouncesMock
  };
});

describe('Reply tracking regression', () => {
  const baseSender = {
    id: 7,
    teamId: 42,
    name: 'Outcraftly Bot',
    email: 'bot@example.com',
    inboundHost: 'imap.example.com',
    inboundPort: 993,
    inboundSecurity: 'SSL/TLS' as const,
    inboundProtocol: 'IMAP' as const,
    username: 'imap-user',
    password: 'secret',
    status: 'active' as const
  };

  type MutableStatus = {
    id: string;
    sequenceId: string;
    stepId: string;
    status: 'pending' | 'replied' | 'paused';
    replyAt: Date | null;
  };

  type DeliveryLogEntry = {
    id: string;
    sequenceId: string;
    statusId: string;
    contactId: string;
    messageId: string | null;
    type: string;
  };

  const createMailClientFactory = (messages: InboundMessage[]) => {
    const client = {
      connect: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      markAsProcessed: vi.fn(async () => {}),
      async *fetchMessages() {
        for (const message of messages) {
          yield message;
        }
      }
    };
    return {
      client,
      factory: () => client
    };
  };

  const createExitTrap = () => {
    const calls: number[] = [];
    const fn = ((code: number) => {
      calls.push(code);
      throw new Error(`exit ${code}`);
    }) as (code: number) => never;
    return { fn, calls };
  };

  it('increments replied count after send and reply flow', async () => {
    const contact = { id: 'contact-1', teamId: baseSender.teamId, email: 'contact@example.com' };
    const sequenceId = 'sequence-1';

    const statuses: MutableStatus[] = [
      { id: 'status-1', sequenceId, stepId: 'step-1', status: 'pending', replyAt: null }
    ];

    const deliveryLogs: DeliveryLogEntry[] = [
      {
        id: 'log-send-1',
        sequenceId,
        statusId: 'status-1',
        contactId: contact.id,
        messageId: 'msg-send-1',
        type: 'send'
      }
    ];

    const metadataRecord = {
      id: 'log-send-1',
      sequenceId,
      statusId: 'status-1',
      messageId: 'msg-send-1',
      stepId: 'step-1',
      sequenceStatus: 'active',
      sequenceDeletedAt: null,
      contact
    } as const;

    const repository: ReplyDetectionRepository = {
      listEligibleSenders: vi.fn(async () => [baseSender]),
      findContactByEmail: vi.fn(async () => contact),
      findContactById: vi.fn(async () => contact),
      findActiveSequenceStatuses: vi.fn(async () =>
        statuses.map(({ id, sequenceId: seqId, stepId, status }) => ({ id, sequenceId: seqId, stepId, status }))
      ),
      findDeliveryLogsByMessageIds: vi.fn(async (candidates) =>
        candidates.includes('msg-send-1') ? [metadataRecord] : []
      ),
      recordReply: vi.fn(async ({ status, message, deliveryLogId }) => {
        const entry = statuses.find((candidate) => candidate.id === status.id);
        if (entry) {
          entry.status = 'replied';
          entry.replyAt = message.receivedAt ?? new Date();
        }
        deliveryLogs.push({
          id: 'log-reply-1',
          sequenceId: status.sequenceId,
          statusId: status.id,
          contactId: contact.id,
          messageId: message.messageId ?? null,
          type: 'reply'
        });
        return { recorded: true, statusUpdated: true, deliveryLogId: deliveryLogId ?? 'log-reply-1' };
      })
    };

    const inbound: InboundMessage = {
      internalId: '1',
      messageId: 'msg-reply-1',
      inReplyTo: 'msg-send-1',
      references: ['msg-send-1'],
      fromAddress: contact.email,
      subject: 'Re: Hello',
      receivedAt: new Date('2025-11-10T08:00:00.000Z')
    };

    const { factory } = createMailClientFactory([inbound]);
    const { runReplyDetectionWorker } = await import('@/lib/workers/reply-detection-worker');

    const result = await runReplyDetectionWorker({ repository, mailClientFactory: factory, debug: true });

    expect(result.metrics[0]?.matched).toBe(1);
    expect(statuses[0].status).toBe('replied');
    expect(statuses[0].replyAt).not.toBeNull();
    expect(deliveryLogs.some((log) => log.type === 'reply')).toBe(true);
  });

  it('cleanup resets replied statuses and archives reply logs for deleted sequences', async () => {
    const now = new Date('2025-12-01T00:00:00.000Z');
    mockDbState.sequences.push({ id: 'sequence-clean', teamId: 42, deletedAt: now });
    mockDbState.statuses.push(
      { id: 'status-replied', contactId: 'contact-1', sequenceId: 'sequence-clean', status: 'replied', replyAt: now },
      { id: 'status-other', contactId: 'contact-2', sequenceId: 'sequence-clean', status: 'paused', replyAt: now }
    );
    mockDbState.logs.push(
      { id: 'log-reply', sequenceId: 'sequence-clean', type: 'reply', messageId: 'reply-msg' },
      { id: 'log-send', sequenceId: 'sequence-clean', type: 'send', messageId: 'send-msg' }
    );

    const module = await import('@/scripts/cleanup-sequence-replies');
    const summary = await module.cleanupSequenceReplies({ dryRun: false }, now);

    expect(summary).toMatchObject({
      sequencesProcessed: 1,
      statusesCleared: 2,
      replyLogsArchived: 1
    });
    expect(mockDbState.statuses.find((status) => status.id === 'status-replied')?.status).toBe('sent');
    expect(mockDbState.statuses.every((status) => status.replyAt === null)).toBe(true);
    expect(mockDbState.logs.find((log) => log.id === 'log-reply')?.type).toBe('reply_archived');
    expect(mockDbState.logs.find((log) => log.id === 'log-send')?.type).toBe('send');
  });

  it('prevents reply bleed across sequences when contact is enrolled twice', async () => {
    const contact = { id: 'contact-1', teamId: baseSender.teamId, email: 'contact@example.com' };
    const sequenceA = 'sequence-A';
    const sequenceB = 'sequence-B';

    const statuses: MutableStatus[] = [
      { id: 'status-A', sequenceId: sequenceA, stepId: 'step-1', status: 'pending', replyAt: null },
      { id: 'status-B', sequenceId: sequenceB, stepId: 'step-1', status: 'pending', replyAt: null }
    ];

    const metadataRecordA = {
      id: 'log-send-A',
      sequenceId: sequenceA,
      statusId: 'status-A',
      messageId: 'msg-seq-a',
      stepId: 'step-1',
      sequenceStatus: 'active',
      sequenceDeletedAt: null,
      contact
    } as const;

    const repository: ReplyDetectionRepository = {
      listEligibleSenders: vi.fn(async () => [baseSender]),
      findContactByEmail: vi.fn(async () => contact),
      findContactById: vi.fn(async () => contact),
      findActiveSequenceStatuses: vi.fn(async () =>
        statuses.map(({ id, sequenceId, stepId, status }) => ({ id, sequenceId, stepId, status }))
      ),
      findDeliveryLogsByMessageIds: vi.fn(async (candidates) =>
        candidates.includes('msg-seq-a') ? [metadataRecordA] : []
      ),
      recordReply: vi.fn(async ({ status, message, deliveryLogId }) => {
        const entry = statuses.find((candidate) => candidate.id === status.id);
        if (entry) {
          entry.status = 'replied';
          entry.replyAt = message.receivedAt ?? new Date();
        }
        return { recorded: true, statusUpdated: true, deliveryLogId: deliveryLogId ?? 'log-reply-A' };
      })
    };

    const inbound: InboundMessage = {
      internalId: '2',
      messageId: 'msg-reply-a',
      inReplyTo: 'msg-seq-a',
      references: ['msg-seq-a'],
      fromAddress: contact.email,
      subject: 'Re: Sequence A',
      receivedAt: new Date('2025-11-11T09:00:00.000Z')
    };

    const { factory } = createMailClientFactory([inbound]);
    const { runReplyDetectionWorker } = await import('@/lib/workers/reply-detection-worker');

    await runReplyDetectionWorker({ repository, mailClientFactory: factory });

    expect(statuses.find((status) => status.id === 'status-A')?.status).toBe('replied');
    expect(statuses.find((status) => status.id === 'status-B')?.status).toBe('pending');
  });

  it('uses non-zero exit code when worker reports errors', async () => {
    const workerModule = await import('@/lib/workers/reply-detection-worker');
    const runWorkerSpy = vi
      .spyOn(workerModule, 'runReplyDetectionWorker')
      .mockResolvedValue({ metrics: [], totals: { fetched: 0, matched: 0, ignored: 0, errors: 2 } });

    const { runReplyWorkerCli } = await import('@/scripts/run-reply-worker');
    const trap = createExitTrap();

    await expect(runReplyWorkerCli([], { exitFn: trap.fn })).rejects.toThrow('exit 1');

    expect(runWorkerSpy).toHaveBeenCalled();
    expect(trap.calls).toEqual([1]);

    runWorkerSpy.mockRestore();
  });

  it('emits debug traces with contact, sequence, and delivery log identifiers', async () => {
    const workerModule = await import('@/lib/workers/reply-detection-worker');
    const runWorkerSpy = vi
      .spyOn(workerModule, 'runReplyDetectionWorker')
      .mockImplementation(async (options) => {
        options?.log?.info?.('[ReplyDetectionWorker] Reply matched', {
          contactId: 'contact-1',
          sequenceId: 'sequence-1',
          deliveryLogId: 'log-1'
        });
        return { metrics: [], totals: { fetched: 1, matched: 1, ignored: 0, errors: 0 } };
      });

    const { runReplyWorkerCli } = await import('@/scripts/run-reply-worker');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const trap = createExitTrap();

    await runReplyWorkerCli(['--debug'], { exitFn: trap.fn }).catch((error) => {
      throw error;
    });

    const logPayload = consoleSpy.mock.calls
      .map(([entry]) => (typeof entry === 'string' ? entry : null))
      .filter(Boolean)
      .map((entry) => {
        try {
          return JSON.parse(entry as string);
        } catch {
          return null;
        }
      })
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));

    const matchLog = logPayload.find((entry) => entry.message === '[ReplyDetectionWorker] Reply matched');
    expect(matchLog).toMatchObject({
      contactId: 'contact-1',
      sequenceId: 'sequence-1',
      deliveryLogId: 'log-1'
    });

    expect(trap.calls).toHaveLength(0);
    consoleSpy.mockRestore();
    runWorkerSpy.mockRestore();
  });
});

beforeAll(async () => {
  ({ GET } = await import('@/app/api/sequences/replies/[id]/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  resetMockDbState();
  mockDbSelect.mockClear();
  mockDbUpdate.mockClear();
  mockClient.end.mockClear();
  getActiveUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  listRepliesMock.mockResolvedValue([
    {
      id: 'reply-1',
      contactId: 'contact-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      company: 'Analytical Engines',
      subject: 'Re: Hello there',
      snippet: 'Thanks for reaching out',
      occurredAt: new Date('2025-10-17T10:00:00.000Z'),
      messageId: 'msg-1',
      stepSubject: 'Intro email'
    }
  ]);
  listBouncesMock.mockResolvedValue([
    {
      id: 'bounce-1',
      contactId: 'contact-2',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      company: 'US Navy',
      reason: 'Mailbox full',
      detail: 'The recipient inbox is full.',
      occurredAt: new Date('2025-10-16T09:00:00.000Z'),
      messageId: 'msg-2',
      stepSubject: 'Follow up'
    }
  ]);
});

describe('GET /api/sequences/replies/:id', () => {
  it('returns recent replies and bounces for the workspace', async () => {
    const response = await GET(new Request('http://localhost/api/sequences/replies/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(200);

    expect(listRepliesMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', 20);
    expect(listBouncesMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', 20);

    const payload = await response.json();
    expect(payload.replies).toHaveLength(1);
    expect(payload.replies[0]).toMatchObject({
      id: 'reply-1',
      contactId: 'contact-1',
      subject: 'Re: Hello there',
      occurredAt: '2025-10-17T10:00:00.000Z'
    });
    expect(payload.bounces).toHaveLength(1);
    expect(payload.bounces[0]).toMatchObject({
      id: 'bounce-1',
      reason: 'Mailbox full',
      occurredAt: '2025-10-16T09:00:00.000Z'
    });
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await GET(new Request('http://localhost/api/sequences/replies/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost/api/sequences/replies/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(400);
  });

  it('validates the sequence identifier', async () => {
    const response = await GET(new Request('http://localhost/api/sequences/replies/invalid'), {
      params: { id: 'invalid' }
    });

    expect(response.status).toBe(400);
    expect(listRepliesMock).not.toHaveBeenCalled();
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await GET(new Request('http://localhost/api/sequences/replies/11111111-2222-3333-4444-555555555555'), {
      params: { id: '11111111-2222-3333-4444-555555555555' }
    });

    expect(response.status).toBe(403);
  });
});
