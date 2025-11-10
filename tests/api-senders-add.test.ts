import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyMock = vi.fn();
const closeMock = vi.fn();
const createTransportMock = vi.fn(() => ({
  verify: verifyMock,
  close: closeMock
}));

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const findSenderByEmailMock = vi.fn();
const addSenderMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock
  }
}));

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    findSenderByEmail: findSenderByEmailMock,
    addSender: addSenderMock
  };
});

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.SENDER_CREDENTIALS_KEY ||= '01234567890123456789012345678901';
  ({ POST } = await import('@/app/api/senders/add/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  verifyMock.mockResolvedValue(undefined);
  getActiveUserMock.mockResolvedValue({ id: 1, email: 'owner@example.com' });
  getTeamForUserMock.mockResolvedValue({
    id: 1,
    name: 'Demo Team',
    createdAt: new Date(),
    updatedAt: new Date(),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeProductId: null,
    planName: null,
    subscriptionStatus: null
  });
  findSenderByEmailMock.mockResolvedValue(null);
  addSenderMock.mockResolvedValue({
    id: 10,
    teamId: 1,
    name: 'Sales Team',
    email: 'sales@example.com',
    host: 'smtp.example.com',
    port: 587,
    username: 'sales',
    password: 'encrypted',
    status: 'active',
    createdAt: new Date()
  });
});

describe('POST /api/senders/add', () => {
  it('stores sender when SMTP verification succeeds', async () => {
    const response = await POST(
      new Request('http://localhost/api/senders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sales Team',
          email: 'sales@example.com',
          host: 'smtp.example.com',
          port: 587,
          username: 'sales',
          password: 'secret'
        })
      })
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.sender.email).toBe('sales@example.com');
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'sales', pass: 'secret' }
    });
    expect(addSenderMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ email: 'sales@example.com' })
    );
  });

  it('returns error when SMTP verification fails', async () => {
    verifyMock.mockRejectedValueOnce(new Error('invalid credentials'));

    const response = await POST(
      new Request('http://localhost/api/senders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sales Team',
          email: 'sales@example.com',
          host: 'smtp.example.com',
          port: 587,
          username: 'sales',
          password: 'secret'
        })
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('SMTP connection failed');
    expect(addSenderMock).not.toHaveBeenCalled();
  });

  it('returns configuration error when encryption key is missing', async () => {
    const originalKey = process.env.SENDER_CREDENTIALS_KEY;
    delete process.env.SENDER_CREDENTIALS_KEY;

    const response = await POST(
      new Request('http://localhost/api/senders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sales Team',
          email: 'sales@example.com',
          host: 'smtp.example.com',
          port: 587,
          username: 'sales',
          password: 'secret'
        })
      })
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error).toContain('SENDER_CREDENTIALS_KEY');

    if (originalKey === undefined) {
      delete process.env.SENDER_CREDENTIALS_KEY;
    } else {
      process.env.SENDER_CREDENTIALS_KEY = originalKey;
    }
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await POST(
      new Request('http://localhost/api/senders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sales Team',
          email: 'sales@example.com',
          host: 'smtp.example.com',
          port: 587,
          username: 'sales',
          password: 'secret'
        })
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await POST(
      new Request('http://localhost/api/senders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sales Team',
          email: 'sales@example.com',
          host: 'smtp.example.com',
          port: 587,
          username: 'sales',
          password: 'secret'
        })
      })
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
  });
});
