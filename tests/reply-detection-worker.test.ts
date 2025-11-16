import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  runReplyDetectionWorker,
  type InboundMessage,
  type MailClient,
  type ReplyDetectionMetrics,
  type ReplyDetectionRepository
} from '@/lib/workers/reply-detection-worker';

const baseSender = {
  id: 1,
  teamId: 42,
  name: 'Reply Bot',
  email: 'reply@example.com',
  inboundHost: 'imap.example.com',
  inboundPort: 993,
  inboundSecurity: 'SSL/TLS' as const,
  inboundProtocol: 'IMAP' as const,
  username: 'imap-user',
  password: 'secret',
  status: 'active' as const
};

function createInboundMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    internalId: '1',
    messageId: 'msg-1',
    inReplyTo: null,
    references: [],
    fromAddress: 'contact@example.com',
    subject: 'Re: Hello',
    receivedAt: new Date('2025-11-10T06:30:00.000Z'),
    ...overrides
  };
}

class StubMailClient implements MailClient {
  connect = vi.fn(async () => {});
  close = vi.fn(async () => {});
  markAsProcessed = vi.fn(async () => {});

  constructor(private readonly messages: InboundMessage[]) {}

  async *fetchMessages(limit?: number) {
    const effective = typeof limit === 'number' && limit > 0 ? this.messages.slice(0, limit) : this.messages;
    for (const message of effective) {
      yield message;
    }
  }
}

function createMailClientFactory(messages: InboundMessage[]) {
  const client = new StubMailClient(messages);
  const factory = vi.fn(() => client);
  return { client, factory };
}

describe('runReplyDetectionWorker', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores inbound messages from unknown contacts', async () => {
    const { client, factory } = createMailClientFactory([
      createInboundMessage({ fromAddress: 'unknown@example.com' })
    ]);

    const repository: ReplyDetectionRepository = {
      listEligibleSenders: vi.fn(async () => [baseSender]),
      findContactByEmail: vi.fn(async () => null),
      findContactById: vi.fn(async () => null),
      findActiveSequenceStatuses: vi.fn(async () => []),
      findDeliveryLogsByMessageIds: vi.fn(async () => []),
      recordReply: vi.fn(async () => ({ recorded: false, statusUpdated: false, deliveryLogId: null }))
    };

    const { metrics } = await runReplyDetectionWorker({
      repository,
      mailClientFactory: factory,
      log
    });

    expect(repository.listEligibleSenders).toHaveBeenCalledTimes(1);
    expect(repository.findContactByEmail).toHaveBeenCalledWith(baseSender.teamId, 'unknown@example.com');
    expect(repository.findActiveSequenceStatuses).not.toHaveBeenCalled();
    expect(repository.recordReply).not.toHaveBeenCalled();
    expect(client.markAsProcessed).toHaveBeenCalledWith('1');

    expect(factory).toHaveBeenCalledTimes(1);

    expect(metrics).toHaveLength(1);
    const [senderMetrics] = metrics as ReplyDetectionMetrics[];
    expect(senderMetrics).toMatchObject({
      fetched: 1,
      matched: 0,
      ignored: 1,
      errors: 0
    });
  });

  it('records replies for contacts enrolled in active sequences', async () => {
    const { client, factory } = createMailClientFactory([createInboundMessage()]);

    const repository: ReplyDetectionRepository = {
      listEligibleSenders: vi.fn(async () => [baseSender]),
      findContactByEmail: vi.fn(async () => ({
        id: 'contact-1',
        teamId: baseSender.teamId,
        email: 'contact@example.com'
      })),
      findContactById: vi.fn(async () => null),
      findActiveSequenceStatuses: vi.fn(async () => [
        { id: 'status-1', sequenceId: 'sequence-1', stepId: 'step-1', status: 'pending' }
      ]),
      findDeliveryLogsByMessageIds: vi.fn(async () => []),
      recordReply: vi.fn(async () => ({ recorded: true, statusUpdated: true, deliveryLogId: 'log-1' }))
    };

    const { metrics } = await runReplyDetectionWorker({
      repository,
      mailClientFactory: factory,
      log
    });

    expect(repository.findContactByEmail).toHaveBeenCalledWith(baseSender.teamId, 'contact@example.com');
  expect(repository.findActiveSequenceStatuses).toHaveBeenCalledWith('contact-1', { sequenceIds: undefined });
  expect(repository.recordReply).toHaveBeenCalledTimes(1);

    const [recordCall] = (repository.recordReply as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(recordCall?.[0]).toMatchObject({
      contact: { id: 'contact-1' },
      status: { id: 'status-1' }
    });

    expect(client.markAsProcessed).toHaveBeenCalledWith('1');

    const [senderMetrics] = metrics as ReplyDetectionMetrics[];
    expect(senderMetrics).toMatchObject({
      fetched: 1,
      matched: 1,
      ignored: 0,
      errors: 0
    });
  });

  it('creates delivery log entries of type reply through the repository', async () => {
    const inboundMessage = createInboundMessage();
    const { factory } = createMailClientFactory([inboundMessage]);

    const createdLogs: Array<{ statusId: string; type: string; messageId: string | null }> = [];

    const repository: ReplyDetectionRepository = {
      listEligibleSenders: vi.fn(async () => [baseSender]),
      findContactByEmail: vi.fn(async () => ({
        id: 'contact-1',
        teamId: baseSender.teamId,
        email: 'contact@example.com'
      })),
      findContactById: vi.fn(async () => null),
      findActiveSequenceStatuses: vi.fn(async () => [
        { id: 'status-1', sequenceId: 'sequence-1', stepId: 'step-1', status: 'sent' }
      ]),
      findDeliveryLogsByMessageIds: vi.fn(async () => []),
      recordReply: vi.fn(async ({ status, message }) => {
        createdLogs.push({ statusId: status.id, type: 'reply', messageId: message.messageId });
        return { recorded: true, statusUpdated: true, deliveryLogId: 'log-1' };
      })
    };

    await runReplyDetectionWorker({
      repository,
      mailClientFactory: factory,
      log
    });

    expect(createdLogs).toEqual([
      {
        statusId: 'status-1',
        type: 'reply',
        messageId: inboundMessage.messageId
      }
    ]);
  });
});
