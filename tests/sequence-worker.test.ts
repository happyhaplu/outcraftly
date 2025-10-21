import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/drizzle', () => ({ db: {} }));

const { sendMailMock, closeMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn();
  const close = vi.fn();
  const createTransport = vi.fn(() => ({
    sendMail,
    close
  }));

  return {
    sendMailMock: sendMail,
    closeMock: close,
    createTransportMock: createTransport
  } as const;
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock
  }
}));

import { runSequenceWorker } from '@/lib/workers/sequence-worker';

function createSelectBuilder(rows: Array<Record<string, unknown>>) {
  const builder: any = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => Promise.resolve(rows)
  };
  return builder;
}

type TxQueue = Array<Array<Record<string, unknown>>>;

type FakeDbConfig = {
  pendingRows: Array<Record<string, unknown>>;
  txQueuesPerTask?: TxQueue[];
  insertLog?: Array<Record<string, unknown>>;
  updateLog?: Array<Record<string, unknown>>;
};

function createFakeDb(config: FakeDbConfig) {
  const inserts: Array<Record<string, unknown>> = config.insertLog ?? [];
  const updates: Array<Record<string, unknown>> = config.updateLog ?? [];
  const txQueues = config.txQueuesPerTask ?? [];
  let transactionIndex = 0;

  const fakeDb = {
    select: vi.fn(() => createSelectBuilder(config.pendingRows)),
    transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
      const queue = txQueues[transactionIndex] ? [...txQueues[transactionIndex]] : [];
      transactionIndex += 1;
      let selectIndex = 0;
      const tx = {
        select: vi.fn(() => {
          selectIndex += 1;
          const next = queue.shift();
          if (next) {
            return createSelectBuilder(next);
          }

          if (selectIndex === 2) {
            return createSelectBuilder([{ status: 'active' }]);
          }

          return createSelectBuilder([]);
        }),
        insert: vi.fn(() => ({
          values: (value: Record<string, unknown>) => {
            inserts.push(value);
            return Promise.resolve([]);
          }
        })),
        update: vi.fn(() => ({
          set: (value: Record<string, unknown>) => ({
            where: () => {
              updates.push(value);
              return Promise.resolve([]);
            }
          })
        }))
      };

      await callback(tx);
    })
  } as const;

  return { fakeDb, inserts, updates };
}

const basePendingRow = {
  sequenceStatus: 'active',
  replyAt: null,
  bounceAt: null,
  sequenceSenderId: 10,
  senderId: 10,
  senderName: 'Primary Sender',
  senderEmail: 'sender@example.com',
  senderStatus: 'verified',
  senderHost: 'smtp.example.com',
  senderPort: 587,
  senderUsername: 'smtp-user',
  senderPassword: 'smtp-pass',
  contactTimezone: null,
  scheduleMode: null,
  scheduleSendTime: null,
  scheduleWindowStart: null,
  scheduleWindowEnd: null,
  scheduleRespectTimezone: true,
  scheduleFallbackTimezone: null
} as const;

function makePendingRow(overrides: Record<string, unknown>) {
  return {
    ...basePendingRow,
    ...overrides
  };
}

describe('runSequenceWorker', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    closeMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockResolvedValue({
      messageId: 'mock-id',
      accepted: ['contact@example.com'],
      rejected: [],
      response: '250 2.0.0 OK'
    });
  });

  it('returns empty metrics when no deliveries are pending', async () => {
    const { fakeDb } = createFakeDb({ pendingRows: [] });

    const result = await runSequenceWorker({}, fakeDb as any);

    expect(result).toEqual({ scanned: 0, sent: 0, failed: 0, retried: 0, skipped: 0 });
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  it('processes a pending delivery and records success', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-1',
        contactId: 'contact-1',
        sequenceId: 'sequence-1',
        stepId: 'step-1',
        attempts: 0,
        scheduledAt: now,
        teamId: 42,
        stepOrder: 1,
        stepSubject: 'Subject {{firstName}}',
        stepBody: 'Body {{company}}',
        stepDelayHours: 24,
        contactFirstName: 'Ada',
        contactLastName: 'Lovelace',
        contactEmail: 'ada@example.com',
        contactCompany: 'Analytical Engines',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-1' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const { fakeDb, inserts, updates } = createFakeDb({ pendingRows, txQueuesPerTask: txQueues });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result).toEqual({ scanned: 1, sent: 1, failed: 0, retried: 0, skipped: 0 });
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Primary Sender <sender@example.com>',
      to: 'ada@example.com',
      subject: 'Subject Ada',
      html: 'Body Analytical Engines',
      text: 'Body Analytical Engines'
    }));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      contactId: 'contact-1',
      sequenceId: 'sequence-1',
      stepId: 'step-1',
      status: 'sent',
      errorMessage: null,
      messageId: 'mock-id',
      attempts: 1
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: 'sent',
      stepId: null,
      scheduledAt: null,
      sentAt: now,
      attempts: 0
    });
  });

  it('marks delivery as failed when no verified sender is available', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-2',
        contactId: 'contact-2',
        sequenceId: 'sequence-2',
        stepId: 'step-2',
        attempts: 0,
        scheduledAt: now,
        teamId: 99,
        stepOrder: 1,
        stepSubject: 'Follow up',
        stepBody: 'Checking in',
        stepDelayHours: 24,
        contactFirstName: 'Grace',
        contactLastName: 'Hopper',
        contactEmail: 'grace@example.com',
        contactCompany: 'US Navy',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null,
        senderStatus: 'disabled'
      })
    ];

    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-2' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const { fakeDb, inserts, updates } = createFakeDb({ pendingRows, txQueuesPerTask: txQueues });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 1, retried: 0, skipped: 0 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      contactId: 'contact-2',
      sequenceId: 'sequence-2',
      stepId: 'step-2',
      status: 'failed',
      attempts: 1
    });
    expect(typeof inserts[0].errorMessage).toBe('string');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      attempts: 1,
      status: 'failed',
      scheduledAt: null
    });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('logs a retry when the transport fails', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    sendMailMock.mockRejectedValueOnce(new Error('SMTP outage'));

    const pendingRows = [
      makePendingRow({
        statusId: 'status-10',
        contactId: 'contact-10',
        sequenceId: 'sequence-10',
        stepId: 'step-10',
        attempts: 0,
        scheduledAt: now,
        teamId: 52,
        stepOrder: 1,
        stepSubject: 'Intro',
        stepBody: 'Body text',
        stepDelayHours: 24,
        contactFirstName: 'Marie',
        contactLastName: 'Curie',
        contactEmail: 'marie@example.com',
        contactCompany: 'Rad Labs',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-10' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const { fakeDb, inserts, updates } = createFakeDb({ pendingRows, txQueuesPerTask: txQueues });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 0, retried: 1, skipped: 0 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      status: 'retrying',
      attempts: 1,
      errorMessage: 'SMTP outage'
    });
    expect(updates[0]).toMatchObject({
      attempts: 1,
      scheduledAt: expect.any(Date)
    });
  });

  it('marks delivery as failed after exhausting retries', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    sendMailMock.mockRejectedValueOnce(new Error('SMTP outage persists'));

    const pendingRows = [
      makePendingRow({
        statusId: 'status-final',
        contactId: 'contact-final',
        sequenceId: 'sequence-final',
        stepId: 'step-final',
        attempts: 2,
        scheduledAt: now,
        teamId: 88,
        stepOrder: 1,
        stepSubject: 'Final attempt',
        stepBody: 'Body',
        stepDelayHours: 24,
        contactFirstName: 'Rosalind',
        contactLastName: 'Franklin',
        contactEmail: 'rosalind@example.com',
        contactCompany: 'X-Ray Labs',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 2, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-final' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const { fakeDb, inserts, updates } = createFakeDb({ pendingRows, txQueuesPerTask: txQueues });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 1, retried: 0, skipped: 0 });
    expect(inserts[0]).toMatchObject({
      status: 'failed',
      attempts: 3,
      errorMessage: 'SMTP outage persists'
    });
    expect(updates[0]).toMatchObject({
      attempts: 3,
      status: 'failed',
      scheduledAt: null
    });
  });

  it('records retries across multiple attempts until a final failure', async () => {
    const firstAttemptAt = new Date('2025-10-17T12:00:00Z');
    const retryDelayMs = 15 * 60 * 1000;

    sendMailMock.mockImplementation(() => Promise.reject(new Error('SMTP outage continues')));

    const sharedInserts: Array<Record<string, unknown>> = [];
    const sharedUpdates: Array<Record<string, unknown>> = [];

    // Attempt 1
    const attemptOneRows = [
      makePendingRow({
        statusId: 'status-chain',
        contactId: 'contact-chain',
        sequenceId: 'sequence-chain',
        stepId: 'step-chain',
        attempts: 0,
        scheduledAt: firstAttemptAt,
        teamId: 101,
        stepOrder: 1,
        stepSubject: 'Intro',
        stepBody: 'Body',
        stepDelayHours: 12,
        contactFirstName: 'Ada',
        contactLastName: 'Byron',
        contactEmail: 'ada.byron@example.com',
        contactCompany: 'Analytical Engines',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const attemptOneQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: firstAttemptAt, stepId: 'step-chain' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const attemptOneDb = createFakeDb({
      pendingRows: attemptOneRows,
      txQueuesPerTask: attemptOneQueues,
      insertLog: sharedInserts,
      updateLog: sharedUpdates
    });

  const attemptOneResult = await runSequenceWorker({ now: firstAttemptAt }, attemptOneDb.fakeDb as any);
  expect(attemptOneResult).toEqual({ scanned: 1, sent: 0, failed: 0, retried: 1, skipped: 0 });
  const updateAfterAttemptOne = sharedUpdates[sharedUpdates.length - 1] as Record<string, unknown>;
  expect(updateAfterAttemptOne).toMatchObject({ attempts: 1, scheduledAt: expect.any(Date) });
  const scheduledAtAfterAttemptOne = updateAfterAttemptOne.scheduledAt as Date;
  const secondAttemptAt = new Date(scheduledAtAfterAttemptOne.getTime() + retryDelayMs);

    // Attempt 2
    const attemptTwoRows = [
      {
        ...attemptOneRows[0],
        attempts: 1,
        scheduledAt: secondAttemptAt
      }
    ];

    const attemptTwoQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 1, replyAt: null, bounceAt: null, scheduledAt: secondAttemptAt, stepId: 'step-chain' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const attemptTwoDb = createFakeDb({
      pendingRows: attemptTwoRows,
      txQueuesPerTask: attemptTwoQueues,
      insertLog: sharedInserts,
      updateLog: sharedUpdates
    });

  const attemptTwoResult = await runSequenceWorker({ now: secondAttemptAt }, attemptTwoDb.fakeDb as any);
  expect(attemptTwoResult).toEqual({ scanned: 1, sent: 0, failed: 0, retried: 1, skipped: 0 });
  const updateAfterAttemptTwo = sharedUpdates[sharedUpdates.length - 1] as Record<string, unknown>;
  expect(updateAfterAttemptTwo).toMatchObject({ attempts: 2, scheduledAt: expect.any(Date) });
  const scheduledAtAfterAttemptTwo = updateAfterAttemptTwo.scheduledAt as Date;
  const finalAttemptAt = new Date(scheduledAtAfterAttemptTwo.getTime() + retryDelayMs);

    // Attempt 3
    const attemptThreeRows = [
      {
        ...attemptOneRows[0],
        attempts: 2,
        scheduledAt: finalAttemptAt
      }
    ];

    const attemptThreeQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 2, replyAt: null, bounceAt: null, scheduledAt: finalAttemptAt, stepId: 'step-chain' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const attemptThreeDb = createFakeDb({
      pendingRows: attemptThreeRows,
      txQueuesPerTask: attemptThreeQueues,
      insertLog: sharedInserts,
      updateLog: sharedUpdates
    });

    const attemptThreeResult = await runSequenceWorker({ now: finalAttemptAt }, attemptThreeDb.fakeDb as any);
    expect(attemptThreeResult).toEqual({ scanned: 1, sent: 0, failed: 1, retried: 0, skipped: 0 });

    const statuses = sharedInserts.map((entry) => entry.status as string);
    expect(statuses).toEqual(['retrying', 'retrying', 'failed']);
    const finalUpdate = sharedUpdates[sharedUpdates.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ attempts: 3, status: 'failed', scheduledAt: null });
  });

  it('skips sending when a reply was recorded and the step opts out', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const replyAt = new Date('2025-10-17T11:00:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-3',
        contactId: 'contact-3',
        sequenceId: 'sequence-3',
        stepId: 'step-3',
        attempts: 0,
        scheduledAt: now,
        teamId: 55,
        stepOrder: 2,
        stepSubject: 'Follow up',
        stepBody: 'Just checking in again',
        stepDelayHours: 24,
        contactFirstName: 'Alan',
        contactLastName: 'Turing',
        contactEmail: 'alan@example.com',
        contactCompany: 'Bletchley Park',
        skipIfReplied: true,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const updatesLog: Array<Record<string, unknown>> = [];
    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt, bounceAt: null, scheduledAt: now, stepId: 'step-3' }],
        [{ status: 'active' }],
        [{ skipIfReplied: true, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const { fakeDb, updates } = createFakeDb({ pendingRows, txQueuesPerTask: txQueues, updateLog: updatesLog });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 0, retried: 0, skipped: 1 });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: 'replied',
        stepId: null,
        scheduledAt: null
      })
    );
  });

  it('defers sending when delay after reply has not elapsed', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const replyAt = new Date('2025-10-17T10:30:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-4',
        contactId: 'contact-4',
        sequenceId: 'sequence-4',
        stepId: 'step-4',
        attempts: 0,
        scheduledAt: now,
        teamId: 77,
        stepOrder: 3,
        stepSubject: 'Checking back',
        stepBody: 'Wanted to follow up on your reply',
        stepDelayHours: 48,
        contactFirstName: 'Margaret',
        contactLastName: 'Hamilton',
        contactEmail: 'margaret@example.com',
        contactCompany: 'MIT',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: 4
      })
    ];

    const updatesLog: Array<Record<string, unknown>> = [];
    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt, bounceAt: null, scheduledAt: now, stepId: 'step-4' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: 4 }]
      ]
    ];

    const { fakeDb, updates } = createFakeDb({ pendingRows, txQueuesPerTask: txQueues, updateLog: updatesLog });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 0, retried: 0, skipped: 1 });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        scheduledAt: expect.any(Date)
      })
    );
    const rescheduleUpdate = updates.find((entry) => entry.scheduledAt instanceof Date);
    expect(rescheduleUpdate).toBeTruthy();
    if (rescheduleUpdate && rescheduleUpdate.scheduledAt instanceof Date) {
      expect(rescheduleUpdate.scheduledAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
