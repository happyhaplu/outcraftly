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

const queryMocks = vi.hoisted(() => {
  const trackEmailsSent = vi.fn();
  const assertCanSendEmails = vi.fn();
  const activateScheduledSequences = vi.fn();
  return {
    trackEmailsSent,
    assertCanSendEmails,
    activateScheduledSequences
  } as const;
});

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    trackEmailsSent: queryMocks.trackEmailsSent,
    assertCanSendEmails: queryMocks.assertCanSendEmails,
    activateScheduledSequences: queryMocks.activateScheduledSequences
  };
});

import { runSequenceWorker } from '@/lib/workers/sequence-worker';

function createSelectBuilder(rows: Array<Record<string, unknown>>) {
  const builder: any = {
    select: () => builder,
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    groupBy: () => builder,
    orderBy: () => builder,
    limit: () => Promise.resolve(rows)
  };
  return builder;
}

type TxQueue = Array<Array<Record<string, unknown>>>;

type FakeDbConfig = {
  pendingRows: Array<Record<string, unknown>>;
  diagnosticsRows?: Array<Record<string, unknown>>;
  customFieldRows?: Array<Record<string, unknown>>;
  txQueuesPerTask?: TxQueue[];
  insertLog?: Array<Record<string, unknown>>;
  updateLog?: Array<Record<string, unknown>>;
  contactExistsByTx?: boolean[];
};

function createFakeDb(config: FakeDbConfig) {
  const inserts: Array<Record<string, unknown>> = config.insertLog ?? [];
  const updates: Array<Record<string, unknown>> = config.updateLog ?? [];
  const txQueues = config.txQueuesPerTask ?? [];
  const contactFlags = Array.isArray(config.contactExistsByTx) ? config.contactExistsByTx : [];
  let transactionIndex = 0;
  let rootSelectCount = 0;

  const fakeDb = {
    select: vi.fn(() => {
      let rows: Array<Record<string, unknown>>;
      if (rootSelectCount === 0) {
        rows = config.pendingRows;
      } else if (rootSelectCount === 1 && (config.pendingRows?.length ?? 0) > 0) {
        rows = config.customFieldRows ?? [];
      } else {
        rows = config.diagnosticsRows ?? [];
      }
      rootSelectCount += 1;
      return createSelectBuilder(rows);
    }),
    transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
      const queue = txQueues[transactionIndex] ? [...txQueues[transactionIndex]] : [];
      transactionIndex += 1;
  const taskRow = (config.pendingRows[transactionIndex - 1] ?? config.pendingRows[0] ?? {}) as Record<string, any>;
      const contactExists = contactFlags[transactionIndex - 1] ?? false;
      let selectIndex = 0;
      const tx = {
        select: vi.fn(() => {
          selectIndex += 1;
          const next = queue.shift();
          if (next) {
            return createSelectBuilder(next);
          }

          if (selectIndex === 1) {
            return createSelectBuilder([
              {
                status: taskRow?.status ?? 'pending',
                attempts: taskRow?.attempts ?? 0,
                replyAt: taskRow?.replyAt ?? null,
                bounceAt: taskRow?.bounceAt ?? null,
                scheduledAt: taskRow?.scheduledAt ?? undefined,
                stepId: taskRow?.stepId ?? null
              }
            ]);
          }

          if (selectIndex === 2) {
            return createSelectBuilder([
              {
                status: taskRow?.sequenceStatus ?? 'active'
              }
            ]);
          }

          if (selectIndex === 3) {
            return createSelectBuilder([
              {
                skipIfReplied: taskRow?.skipIfReplied ?? false,
                skipIfBounced: taskRow?.skipIfBounced ?? false,
                delayIfReplied: taskRow?.delayIfReplied ?? null
              }
            ]);
          }

          if (selectIndex === 4) {
            if (taskRow?.statusId) {
              return createSelectBuilder([
                {
                  id: taskRow.statusId,
                  contactId: taskRow.contactId,
                  sequenceId: taskRow.sequenceId
                }
              ]);
            }
            return createSelectBuilder([]);
          }

          if (selectIndex === 5) {
            if (contactExists && taskRow?.contactId) {
              return createSelectBuilder([
                { id: taskRow.contactId }
              ]);
            }
            return createSelectBuilder([]);
          }

          return createSelectBuilder([]);
        }),
        insert: vi.fn(() => ({
          values: (value: Record<string, unknown>) => {
            inserts.push(value);
            const result: any = {
              onConflictDoNothing: () => Promise.resolve([])
            };
            return result;
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
  sequenceMinGapMinutes: null,
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
    queryMocks.trackEmailsSent.mockReset();
    queryMocks.trackEmailsSent.mockResolvedValue(undefined);
    queryMocks.assertCanSendEmails.mockReset();
    queryMocks.assertCanSendEmails.mockResolvedValue(undefined);
    queryMocks.activateScheduledSequences.mockReset();
    queryMocks.activateScheduledSequences.mockResolvedValue([]);
  });

  it('returns empty metrics when no deliveries are pending', async () => {
    const { fakeDb } = createFakeDb({ pendingRows: [] });

    const result = await runSequenceWorker({}, fakeDb as any);

    expect(result.scanned).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.details).toEqual([]);
    expect(result.diagnostics).toBeNull();
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  it('captures diagnostics when pending contacts are blocked by lifecycle status', async () => {
    const nextAt = new Date('2025-10-18T09:00:00Z');
    const { fakeDb } = createFakeDb({
      pendingRows: [],
      diagnosticsRows: [
        {
          sequenceId: 'sequence-blocked',
          status: 'draft',
          pending: 3,
          nextScheduledAt: nextAt
        }
      ]
    });

    const result = await runSequenceWorker({}, fakeDb as any);

    expect(result.scanned).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.details).toEqual([]);
    expect(result.diagnostics).toEqual({
      pendingSequences: [
        {
          sequenceId: 'sequence-blocked',
          status: 'draft',
          pending: 3,
          nextScheduledAt: nextAt.toISOString()
        }
      ]
    });
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

    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({
      statusId: 'status-1',
      sequenceId: 'sequence-1',
      contactId: 'contact-1',
      outcome: 'sent',
      attempts: 1,
      messageId: 'mock-id'
    });
    expect(result.diagnostics).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Primary Sender <sender@example.com>',
      to: 'ada@example.com',
      subject: 'Subject Ada',
      html: 'Body Analytical Engines',
      text: 'Body Analytical Engines'
    }));
    const deliveryInserts = inserts.filter((entry) => typeof entry.status === 'string');
    expect(deliveryInserts).toHaveLength(1);
    expect(deliveryInserts[0]).toMatchObject({
      contactId: 'contact-1',
      sequenceId: 'sequence-1',
      stepId: 'step-1',
      status: 'sent',
      errorMessage: null,
      messageId: 'mock-id',
      attempts: 1
    });
    const statusUpdates = updates.filter((entry) => typeof entry.status === 'string');
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0]).toMatchObject({
      status: 'sent',
      stepId: null,
      scheduledAt: null,
      sentAt: now,
      attempts: 0
    });
  });

  it('records throttle delays when respecting the minimum send interval', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-throttle-1',
        contactId: 'contact-throttle-1',
        sequenceId: 'sequence-throttle',
        stepId: 'step-throttle-1',
        attempts: 0,
        scheduledAt: now,
        teamId: 7,
        stepOrder: 1,
        stepSubject: 'First touch',
        stepBody: 'Intro message',
        stepDelayHours: 12,
        contactFirstName: 'Ida',
        contactLastName: 'Rhodes',
        contactEmail: 'ida@example.com',
        contactCompany: 'Numerical Labs',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      }),
      makePendingRow({
        statusId: 'status-throttle-2',
        contactId: 'contact-throttle-2',
        sequenceId: 'sequence-throttle',
        stepId: 'step-throttle-2',
        attempts: 0,
        scheduledAt: now,
        teamId: 7,
        stepOrder: 1,
        stepSubject: 'Second touch',
        stepBody: 'Follow-up message',
        stepDelayHours: 12,
        contactFirstName: 'Mary',
        contactLastName: 'Keller',
        contactEmail: 'mary@example.com',
        contactCompany: 'Numerical Labs',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-throttle-1' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ],
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-throttle-2' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const insertLog: Array<Record<string, unknown>> = [];
    const sleepMock = vi.fn(() => Promise.resolve());
    const { fakeDb, inserts } = createFakeDb({
      pendingRows,
      txQueuesPerTask: txQueues,
      insertLog
    });

    const result = await runSequenceWorker(
      { now, minSendIntervalMinutes: 5, sleep: sleepMock },
      fakeDb as any
    );

    expect(result.sent).toBe(2);
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'delayed', reason: 'min_send_interval' })
      ])
    );
    expect(sleepMock).toHaveBeenCalledWith(300000);
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'delayed',
          payload: expect.objectContaining({
            reason: 'delayed_due_to_min_gap',
            delayMs: 300000,
            minIntervalMinutes: 5
          })
        })
      ])
    );
  });

  it('prefers the sequence-specific pacing override when throttling sends', async () => {
    const now = new Date('2025-10-18T09:45:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-override-1',
        contactId: 'contact-override-1',
        sequenceId: 'sequence-override',
        stepId: 'step-override-1',
        attempts: 0,
        scheduledAt: now,
        teamId: 11,
        stepOrder: 1,
        stepSubject: 'Intro note',
        stepBody: 'Hello there',
        stepDelayHours: 6,
        contactFirstName: 'Taylor',
        contactLastName: 'Reeves',
        contactEmail: 'taylor@example.com',
        contactCompany: 'Override Labs',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null,
        sequenceMinGapMinutes: 12
      }),
      makePendingRow({
        statusId: 'status-override-2',
        contactId: 'contact-override-2',
        sequenceId: 'sequence-override',
        stepId: 'step-override-2',
        attempts: 0,
        scheduledAt: now,
        teamId: 11,
        stepOrder: 2,
        stepSubject: 'Follow-up note',
        stepBody: 'Still here',
        stepDelayHours: 6,
        contactFirstName: 'Jamie',
        contactLastName: 'Stone',
        contactEmail: 'jamie@example.com',
        contactCompany: 'Override Labs',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null,
        sequenceMinGapMinutes: 12
      })
    ];

    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-override-1' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ],
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-override-2' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }]
      ]
    ];

    const insertLog: Array<Record<string, unknown>> = [];
    const sleepMock = vi.fn(() => Promise.resolve());
    const { fakeDb, inserts } = createFakeDb({
      pendingRows,
      txQueuesPerTask: txQueues,
      insertLog
    });

    const result = await runSequenceWorker({ now, sleep: sleepMock }, fakeDb as any);

    expect(result.sent).toBe(2);
    expect(sleepMock).toHaveBeenCalledWith(720000);
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'delayed',
          payload: expect.objectContaining({
            reason: 'delayed_due_to_min_gap',
            delayMs: 720000,
            minIntervalMinutes: 12
          })
        })
      ])
    );
  });

  it('defaults to a 2 minute gap when no step delay is configured', async () => {
    const now = new Date('2025-10-20T15:00:00Z');
    const nextStepId = 'step-gap-default';
    const defaultGapMinutes = 2;
    const defaultGapHours = defaultGapMinutes / 60;

    const pendingRows = [
      makePendingRow({
        statusId: 'status-gap-default',
        contactId: 'contact-gap-default',
        sequenceId: 'sequence-gap-default',
        stepId: 'step-gap-default-1',
        attempts: 0,
        scheduledAt: now,
        teamId: 15,
        stepOrder: 1,
        stepSubject: 'Intro {{firstName}}',
        stepBody: 'Body {{company}}',
        stepDelayHours: 0,
        contactFirstName: 'Sam',
        contactLastName: 'Case',
        contactEmail: 'sam@example.com',
        contactCompany: 'Gap Corp',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const rootSelectResponses = [pendingRows, [] as Array<Record<string, unknown>>];
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];

    const fakeDb = {
      select: vi.fn(() => createSelectBuilder(rootSelectResponses.shift() ?? [])),
      transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
        let selectIndex = 0;
        const txSelectRows = [
          [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-gap-default-1' }],
          [{ status: 'active' }],
          [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }],
          [{ id: 'status-gap-default', contactId: 'contact-gap-default', sequenceId: 'sequence-gap-default' }],
          [],
          [{ id: nextStepId, delay: 0 }]
        ];

        const tx = {
          select: vi.fn(() => {
            const rows = txSelectRows[selectIndex] ?? [];
            selectIndex += 1;
            return createSelectBuilder(rows);
          }),
          insert: vi.fn(() => ({
            values: (value: Record<string, unknown>) => {
              inserts.push(value);
              const result: any = {
                onConflictDoNothing: () => Promise.resolve([])
              };
              return result;
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
    };

    const result = await runSequenceWorker({ now, minSendIntervalMinutes: 0 }, fakeDb as any);

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);

    const expectedNextAt = new Date(now.getTime() + defaultGapMinutes * 60 * 1000);

    const pendingUpdate = updates.find((entry) => entry.status === 'pending') as
      | { stepId: string; scheduledAt: Date }
      | undefined;
    expect(pendingUpdate).toBeDefined();
    expect(pendingUpdate?.stepId).toBe(nextStepId);
    expect(Math.abs(pendingUpdate!.scheduledAt.getTime() - expectedNextAt.getTime())).toBeLessThanOrEqual(1);

    const deliveryInserts = inserts.filter((entry) => typeof entry.status === 'string');
    const delayedEntry = deliveryInserts.find((entry) => entry.status === 'delayed');
    expect(delayedEntry).toBeDefined();
    expect(delayedEntry?.type).toBe('delay');
    const payload = delayedEntry?.payload as
      | { reason?: string; rescheduledFor?: string; stepDelayHours?: number }
      | undefined;
    expect(payload?.reason).toBe('step_delay');
    if (typeof payload?.stepDelayHours === 'number') {
      expect(payload.stepDelayHours).toBeCloseTo(defaultGapHours, 5);
    } else {
      throw new Error('Expected stepDelayHours in delay payload');
    }
    if (!payload?.rescheduledFor) {
      throw new Error('Expected rescheduledFor timestamp in delay payload');
    }
    expect(Math.abs(new Date(payload.rescheduledFor).getTime() - expectedNextAt.getTime())).toBeLessThanOrEqual(1);

    const sentEntry = deliveryInserts.find((entry) => entry.status === 'sent');
    expect(sentEntry).toBeDefined();
  });

  it('respects a 5 minute step delay when configured', async () => {
    const now = new Date('2025-10-20T16:00:00Z');
    const nextStepId = 'step-gap-five-min';
    const delayMinutes = 5;
    const delayHours = delayMinutes / 60;

    const pendingRows = [
      makePendingRow({
        statusId: 'status-gap-five',
        contactId: 'contact-gap-five',
        sequenceId: 'sequence-gap-five',
        stepId: 'step-gap-five-1',
        attempts: 0,
        scheduledAt: now,
        teamId: 42,
        stepOrder: 1,
        stepSubject: 'Intro Five',
        stepBody: 'Body Five',
        stepDelayHours: 0,
        contactFirstName: 'Alex',
        contactLastName: 'Five',
        contactEmail: 'alex@example.com',
        contactCompany: 'Five Corp',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const rootSelectResponses = [pendingRows, [] as Array<Record<string, unknown>>];
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];

    const fakeDb = {
      select: vi.fn(() => createSelectBuilder(rootSelectResponses.shift() ?? [])),
      transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
        let selectIndex = 0;
        const txSelectRows = [
          [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-gap-five-1' }],
          [{ status: 'active' }],
          [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }],
          [{ id: 'status-gap-five', contactId: 'contact-gap-five', sequenceId: 'sequence-gap-five' }],
          [],
          [{ id: nextStepId, delay: delayHours }]
        ];

        const tx = {
          select: vi.fn(() => {
            const rows = txSelectRows[selectIndex] ?? [];
            selectIndex += 1;
            return createSelectBuilder(rows);
          }),
          insert: vi.fn(() => ({
            values: (value: Record<string, unknown>) => {
              inserts.push(value);
              const result: any = {
                onConflictDoNothing: () => Promise.resolve([])
              };
              return result;
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
    };

    const result = await runSequenceWorker({ now, minSendIntervalMinutes: 0 }, fakeDb as any);

    expect(result.sent).toBe(1);
    const expectedNextAt = new Date(now.getTime() + delayMinutes * 60 * 1000);
    const pendingUpdate = updates.find((entry) => entry.status === 'pending') as
      | { stepId: string; scheduledAt: Date }
      | undefined;
    expect(pendingUpdate).toBeDefined();
    expect(pendingUpdate?.stepId).toBe(nextStepId);
    expect(Math.abs(pendingUpdate!.scheduledAt.getTime() - expectedNextAt.getTime())).toBeLessThanOrEqual(1);

    const delayedEntry = inserts.filter((entry) => entry.status === 'delayed')[0];
    expect(delayedEntry).toBeDefined();
    const payload = delayedEntry?.payload as { reason?: string; rescheduledFor?: string; stepDelayHours?: number } | undefined;
    expect(payload?.reason).toBe('step_delay');
    expect(payload?.stepDelayHours).toBeCloseTo(delayHours, 5);
    if (!payload?.rescheduledFor) {
      throw new Error('Expected rescheduledFor timestamp in delay payload');
    }
    expect(Math.abs(new Date(payload.rescheduledFor).getTime() - expectedNextAt.getTime())).toBeLessThanOrEqual(1);
  });

  it('respects a day-long step delay when configured', async () => {
    const now = new Date('2025-10-20T17:30:00Z');
    const nextStepId = 'step-gap-day';
    const delayHours = 24;

    const pendingRows = [
      makePendingRow({
        statusId: 'status-gap-day',
        contactId: 'contact-gap-day',
        sequenceId: 'sequence-gap-day',
        stepId: 'step-gap-day-1',
        attempts: 0,
        scheduledAt: now,
        teamId: 51,
        stepOrder: 1,
        stepSubject: 'Intro Day',
        stepBody: 'Body Day',
        stepDelayHours: 0,
        contactFirstName: 'Casey',
        contactLastName: 'Day',
        contactEmail: 'casey@example.com',
        contactCompany: 'Day Corp',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const rootSelectResponses = [pendingRows, [] as Array<Record<string, unknown>>];
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];

    const fakeDb = {
      select: vi.fn(() => createSelectBuilder(rootSelectResponses.shift() ?? [])),
      transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
        let selectIndex = 0;
        const txSelectRows = [
          [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-gap-day-1' }],
          [{ status: 'active' }],
          [{ skipIfReplied: false, skipIfBounced: false, delayIfReplied: null }],
          [{ id: 'status-gap-day', contactId: 'contact-gap-day', sequenceId: 'sequence-gap-day' }],
          [],
          [{ id: nextStepId, delay: delayHours }]
        ];

        const tx = {
          select: vi.fn(() => {
            const rows = txSelectRows[selectIndex] ?? [];
            selectIndex += 1;
            return createSelectBuilder(rows);
          }),
          insert: vi.fn(() => ({
            values: (value: Record<string, unknown>) => {
              inserts.push(value);
              const result: any = {
                onConflictDoNothing: () => Promise.resolve([])
              };
              return result;
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
    };

    const result = await runSequenceWorker({ now, minSendIntervalMinutes: 0 }, fakeDb as any);

    expect(result.sent).toBe(1);
    const expectedNextAt = new Date(now.getTime() + delayHours * 60 * 60 * 1000);
    const pendingUpdate = updates.find((entry) => entry.status === 'pending') as
      | { stepId: string; scheduledAt: Date }
      | undefined;
    expect(pendingUpdate).toBeDefined();
    expect(pendingUpdate?.stepId).toBe(nextStepId);
    expect(Math.abs(pendingUpdate!.scheduledAt.getTime() - expectedNextAt.getTime())).toBeLessThanOrEqual(1);

    const delayedEntry = inserts.filter((entry) => entry.status === 'delayed')[0];
    expect(delayedEntry).toBeDefined();
    const payload = delayedEntry?.payload as { reason?: string; rescheduledFor?: string; stepDelayHours?: number } | undefined;
    expect(payload?.reason).toBe('step_delay');
    expect(payload?.stepDelayHours).toBeCloseTo(delayHours, 5);
    if (!payload?.rescheduledFor) {
      throw new Error('Expected rescheduledFor timestamp in delay payload');
    }
    expect(Math.abs(new Date(payload.rescheduledFor).getTime() - expectedNextAt.getTime())).toBeLessThanOrEqual(1);
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

    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({
      statusId: 'status-2',
      sequenceId: 'sequence-2',
      contactId: 'contact-2',
      outcome: 'failed',
      reason: 'sender_inactive',
      attempts: 1
    });
    expect(typeof result.details[0].error).toBe('string');
    expect(result.diagnostics).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
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

    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({
      statusId: 'status-10',
      outcome: 'retry',
      reason: 'SMTP outage continues',
      attempts: 1,
      error: 'SMTP outage continues'
    });
    expect(result.diagnostics).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const retryInserts = inserts.filter((entry) => typeof entry.status === 'string');
    expect(retryInserts).toHaveLength(1);
    expect(retryInserts[0]).toMatchObject({
      status: 'retrying',
      attempts: 1,
      errorMessage: 'SMTP outage continues'
    });
    const retryUpdates = updates.filter((entry) => typeof entry.attempts === 'number');
    expect(retryUpdates[0]).toMatchObject({
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

    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({
      statusId: 'status-final',
      outcome: 'failed',
      reason: 'SMTP outage continues',
      attempts: 3,
      error: 'SMTP outage continues'
    });
    expect(result.diagnostics).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const failureInserts = inserts.filter((entry) => typeof entry.status === 'string');
    expect(failureInserts[0]).toMatchObject({
      status: 'failed',
      attempts: 3,
      errorMessage: 'SMTP outage continues'
    });
    const failureUpdates = updates.filter((entry) => typeof entry.status === 'string');
    expect(failureUpdates[0]).toMatchObject({
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
  expect(attemptOneResult.scanned).toBe(1);
  expect(attemptOneResult.sent).toBe(0);
  expect(attemptOneResult.failed).toBe(0);
  expect(attemptOneResult.retried).toBe(1);
  expect(attemptOneResult.skipped).toBe(0);
  expect(attemptOneResult.details).toHaveLength(1);
  expect(attemptOneResult.details[0]).toMatchObject({
    statusId: 'status-chain',
    outcome: 'retry',
    reason: 'SMTP outage continues',
    attempts: 1,
    error: 'SMTP outage continues'
  });
  expect(attemptOneResult.diagnostics).toBeNull();
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
  expect(attemptTwoResult.scanned).toBe(1);
  expect(attemptTwoResult.sent).toBe(0);
  expect(attemptTwoResult.failed).toBe(0);
  expect(attemptTwoResult.retried).toBe(1);
  expect(attemptTwoResult.skipped).toBe(0);
  expect(attemptTwoResult.details).toHaveLength(1);
  expect(attemptTwoResult.details[0]).toMatchObject({
    statusId: 'status-chain',
    outcome: 'retry',
    reason: 'SMTP outage continues',
    attempts: 2,
    error: 'SMTP outage continues'
  });
  expect(attemptTwoResult.diagnostics).toBeNull();
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
    expect(attemptThreeResult.scanned).toBe(1);
    expect(attemptThreeResult.sent).toBe(0);
    expect(attemptThreeResult.failed).toBe(1);
    expect(attemptThreeResult.retried).toBe(0);
    expect(attemptThreeResult.skipped).toBe(0);
    expect(attemptThreeResult.details).toHaveLength(1);
    expect(attemptThreeResult.details[0]).toMatchObject({
      statusId: 'status-chain',
      outcome: 'failed',
      reason: 'SMTP outage continues',
      attempts: 3,
      error: 'SMTP outage continues'
    });
    expect(attemptThreeResult.diagnostics).toBeNull();

    const statuses = sharedInserts
      .map((entry) => entry.status)
      .filter((status): status is string => typeof status === 'string');
    expect(statuses).toEqual(['retrying', 'retrying', 'failed']);
    const statusUpdates = sharedUpdates.filter((entry) => typeof entry.status === 'string');
    const finalUpdate = statusUpdates[statusUpdates.length - 1] as Record<string, unknown>;
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

    const insertLog: Array<Record<string, unknown>> = [];
    const { fakeDb, updates, inserts } = createFakeDb({
      pendingRows,
      txQueuesPerTask: txQueues,
      updateLog: updatesLog,
      insertLog
    });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({
      statusId: 'status-3',
      outcome: 'skipped',
      reason: 'reply_policy',
      attempts: 0
    });
    expect(result.diagnostics).toBeNull();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: 'replied',
        stepId: null,
        scheduledAt: null
      })
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        skipReason: 'reply_stop',
        attempts: 0
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

    const insertLog: Array<Record<string, unknown>> = [];
    const { fakeDb, updates, inserts } = createFakeDb({
      pendingRows,
      txQueuesPerTask: txQueues,
      updateLog: updatesLog,
      insertLog
    });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({
      statusId: 'status-4',
      outcome: 'skipped',
      reason: 'reply_delay',
      attempts: 0
    });
    expect(result.details[0]?.rescheduledFor).toEqual(expect.any(String));
    expect(result.diagnostics).toBeNull();
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
    const skipInsert = inserts.find((entry) => entry.skipReason === 'reply_delay');
    expect(skipInsert).toBeTruthy();
    if (skipInsert) {
      expect(skipInsert).toMatchObject({ status: 'skipped', attempts: 0 });
      expect(skipInsert.payload).toEqual(
        expect.objectContaining({ rescheduledFor: expect.any(String) })
      );
    }
  });

  it('skips when a bounce is recorded and the step is configured to skip bounces', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const bounceAt = new Date('2025-10-16T09:30:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-bounce',
        contactId: 'contact-bounce',
        sequenceId: 'sequence-bounce',
        stepId: 'step-bounce',
        attempts: 1,
        scheduledAt: now,
        teamId: 12,
        stepOrder: 1,
        stepSubject: 'Intro',
        stepBody: 'Hello there',
        stepDelayHours: 24,
        contactFirstName: 'Hedy',
        contactLastName: 'Lamarr',
        contactEmail: 'hedy@example.com',
        contactCompany: 'Signals Inc',
        skipIfReplied: false,
        skipIfBounced: true,
        delayIfReplied: null
      })
    ];

    const insertLog: Array<Record<string, unknown>> = [];
    const updateLog: Array<Record<string, unknown>> = [];
    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 1, replyAt: null, bounceAt, scheduledAt: now, stepId: 'step-bounce' }],
        [{ status: 'active' }],
        [{ skipIfReplied: false, skipIfBounced: true, delayIfReplied: null }]
      ]
    ];

    const { fakeDb, updates, inserts } = createFakeDb({
      pendingRows,
      txQueuesPerTask: txQueues,
      insertLog,
      updateLog
    });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.details[0]).toMatchObject({
      statusId: 'status-bounce',
      outcome: 'skipped',
      reason: 'bounce_policy',
      attempts: 1
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: 'bounced',
        scheduledAt: null,
        stepId: null
      })
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        skipReason: 'bounce_policy',
        attempts: 1
      })
    );
  });

  it('records skipped deliveries when the sequence lifecycle is not active', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-paused',
        contactId: 'contact-paused',
        sequenceId: 'sequence-paused',
        stepId: 'step-paused',
        attempts: 0,
        scheduledAt: now,
        teamId: 33,
        stepOrder: 1,
        stepSubject: 'Hello',
        stepBody: 'Checking in',
        stepDelayHours: 24,
        contactFirstName: 'Radia',
        contactLastName: 'Perlman',
        contactEmail: 'radia@example.com',
        contactCompany: 'Net Tech',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const insertLog: Array<Record<string, unknown>> = [];
    const txQueues: TxQueue[] = [
      [
        [{ status: 'pending', attempts: 0, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-paused' }],
        [{ status: 'paused' }]
      ]
    ];

    const { fakeDb, inserts } = createFakeDb({
      pendingRows,
      txQueuesPerTask: txQueues,
      insertLog
    });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.details[0]).toMatchObject({
      outcome: 'skipped',
      reason: 'sequence_not_active'
    });
    expect(inserts).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        skipReason: 'paused',
        attempts: 0
      })
    );
  });

  it('records status change skips when the pending task is already updated', async () => {
    const now = new Date('2025-10-17T12:00:00Z');
    const pendingRows = [
      makePendingRow({
        statusId: 'status-out-of-sync',
        contactId: 'contact-out-of-sync',
        sequenceId: 'sequence-out-of-sync',
        stepId: 'step-out-of-sync',
        attempts: 2,
        scheduledAt: now,
        teamId: 41,
        stepOrder: 2,
        stepSubject: 'Follow up',
        stepBody: 'Just checking in again',
        stepDelayHours: 24,
        contactFirstName: 'Joan',
        contactLastName: 'Clarke',
        contactEmail: 'joan@example.com',
        contactCompany: 'GC&CS',
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      })
    ];

    const insertLog: Array<Record<string, unknown>> = [];
    const txQueues: TxQueue[] = [
      [
        [{ status: 'sent', attempts: 2, replyAt: null, bounceAt: null, scheduledAt: now, stepId: 'step-out-of-sync' }]
      ]
    ];

    const { fakeDb, inserts } = createFakeDb({
      pendingRows,
      txQueuesPerTask: txQueues,
      insertLog
    });

    const result = await runSequenceWorker({ now }, fakeDb as any);

    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.details[0]).toMatchObject({
      outcome: 'skipped',
      reason: 'status_changed',
      attempts: 2
    });
    expect(inserts).toContainEqual(
      expect.objectContaining({
        status: 'skipped',
        skipReason: 'status_changed',
        attempts: 2
      })
    );
  });
});
