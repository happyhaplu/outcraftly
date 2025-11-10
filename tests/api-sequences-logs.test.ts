import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const listLogsMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

let sequenceRows: Array<{ id: string }>; // updated per test run

const dbSelectMock = vi.fn();

const createSelectBuilder = () => {
  const builder: any = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(sequenceRows))
  };
  return builder;
};

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    listSequenceDeliveryLogsForTeam: listLogsMock
  };
});

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: dbSelectMock
  }
}));

let GET: (request: Request, context: { params: { id: string } }) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import('@/app/api/sequences/logs/[id]/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  sequenceRows = [{ id: '11111111-2222-3333-4444-555555555555' }];
  getActiveUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  listLogsMock.mockResolvedValue({
    logs: [
      {
        id: 'log-1',
        status: 'sent',
        attempts: 1,
        createdAt: new Date('2025-10-18T10:00:00.000Z'),
        messageId: 'msg-1',
        errorMessage: null,
        skipReason: null,
        rescheduledFor: null,
        delayReason: null,
        delayMs: null,
        minIntervalMinutes: null,
        contact: {
          id: 'contact-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com'
        },
        step: {
          id: 'step-1',
          order: 1,
          subject: 'Intro'
        }
      }
    ],
    total: 1
  });

  dbSelectMock.mockImplementation(() => createSelectBuilder());
});

describe('GET /api/sequences/logs/:id', () => {
  it('returns paginated delivery logs for the sequence', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555?status=sent&contact=ada&page=2&pageSize=10&from=2025-10-17&to=2025-10-18'
      ),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(200);
    expect(listLogsMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', {
      status: 'sent',
      contact: 'ada',
      from: expect.any(Date),
      to: expect.any(Date),
      page: 2,
      pageSize: 10
    });

    const filters = listLogsMock.mock.calls[0][2];
    expect(filters.from?.toISOString()).toBe('2025-10-17T00:00:00.000Z');
    expect(filters.to?.toISOString()).toBe('2025-10-18T23:59:59.999Z');

    const payload = await response.json();
    expect(payload.totalPages).toBe(1);
    expect(payload.logs).toHaveLength(1);
    expect(payload.logs[0]).toMatchObject({
      id: 'log-1',
      status: 'sent',
      attempts: 1,
      messageId: 'msg-1',
      skipReason: null,
      rescheduledFor: null,
      delayReason: null,
      delayMs: null,
      minIntervalMinutes: null,
      contact: {
        email: 'ada@example.com'
      }
    });
  });

  it('includes delay metadata for delayed logs', async () => {
    listLogsMock.mockResolvedValueOnce({
      logs: [
        {
          id: 'log-delayed',
          status: 'delayed',
          attempts: 2,
          createdAt: new Date('2025-10-18T11:00:00.000Z'),
          messageId: null,
          errorMessage: null,
          skipReason: null,
          rescheduledFor: null,
          delayReason: 'delayed_due_to_min_gap',
          delayMs: 300000,
          minIntervalMinutes: 5,
          contact: {
            id: 'contact-delay',
            firstName: 'Alan',
            lastName: 'Turing',
            email: 'alan@example.com'
          },
          step: null
        }
      ],
      total: 1
    });

    const response = await GET(
      new Request('http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555?status=delayed'),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(200);
    expect(listLogsMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', {
      status: 'delayed',
      contact: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 20
    });

    const payload = await response.json();
    expect(payload.logs).toHaveLength(1);
    expect(payload.logs[0]).toMatchObject({
      id: 'log-delayed',
      status: 'delayed',
      delayReason: 'delayed_due_to_min_gap',
      delayMs: 300000,
      minIntervalMinutes: 5
    });
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await GET(
      new Request('http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555'),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(401);
    expect(listLogsMock).not.toHaveBeenCalled();
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request('http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555'),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(400);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await GET(
      new Request('http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555'),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 when the sequence is not found', async () => {
    sequenceRows = [];

    const response = await GET(
      new Request('http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555'),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(404);
  });

  it('validates query parameters', async () => {
    const response = await GET(
      new Request('http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555?page=0'),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(400);
    expect(listLogsMock).not.toHaveBeenCalled();
  });

  it('validates date ranges', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/sequences/logs/11111111-2222-3333-4444-555555555555?from=2025-10-19&to=2025-10-18'
      ),
      { params: { id: '11111111-2222-3333-4444-555555555555' } }
    );

    expect(response.status).toBe(400);
    expect(listLogsMock).not.toHaveBeenCalled();
  });
});
