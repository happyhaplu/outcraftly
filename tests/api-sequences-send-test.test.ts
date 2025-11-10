import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSequenceStepForTeamMock = vi.fn();
const assertCanSendEmailsMock = vi.fn();
const trackEmailsSentMock = vi.fn();

const renderSequenceContentMock = vi.fn();
const dispatchSequenceEmailMock = vi.fn();

let POST: (request: Request, context: { params: { id: string; stepId: string } }) => Promise<Response>;

type QueriesModule = typeof import('@/lib/db/queries');

type MailerModule = typeof import('@/lib/mail/sequence-mailer');

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let PlanLimitExceededErrorRef: typeof import('@/lib/db/queries').PlanLimitExceededError;

vi.mock('@/lib/db/queries', async () => {
  const actual = (await vi.importActual<QueriesModule>('@/lib/db/queries')) as QueriesModule;
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getSequenceStepForTeam: getSequenceStepForTeamMock,
    assertCanSendEmails: assertCanSendEmailsMock,
    trackEmailsSent: trackEmailsSentMock
  } satisfies QueriesModule;
});

vi.mock('@/lib/mail/sequence-mailer', (): MailerModule => ({
  renderSequenceContent: renderSequenceContentMock,
  dispatchSequenceEmail: dispatchSequenceEmailMock
}));

beforeAll(async () => {
  ({ POST } = await import('@/app/api/sequences/[id]/steps/[stepId]/send-test/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    PlanLimitExceededError: PlanLimitExceededErrorRef
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();

  getActiveUserMock.mockResolvedValue({ id: 99, email: 'owner@example.com', name: 'Owner Example' });
  getTeamForUserMock.mockResolvedValue({ id: 77, name: 'Example Corp' });
  getSequenceStepForTeamMock.mockResolvedValue({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sequenceId: '11111111-2222-3333-4444-555555555555',
    subject: 'Hello {{firstName}}',
    body: 'Body for {{company}}',
    order: 1,
    sequenceSenderId: 10,
    senderId: 10,
    senderName: 'Primary Sender',
    senderEmail: 'sender@example.com',
    senderStatus: 'verified',
    senderHost: 'smtp.example.com',
    senderPort: 587,
    senderUsername: 'smtp-user',
    senderPassword: 'smtp-pass'
  });
  renderSequenceContentMock.mockReturnValue({
    subject: 'Rendered subject',
    text: 'Rendered text',
    html: '<p>Rendered html</p>'
  });
  dispatchSequenceEmailMock.mockResolvedValue({
    messageId: 'test-id',
    accepted: ['test@example.com'],
    rejected: [],
    response: '250 2.0.0 OK'
  });
  assertCanSendEmailsMock.mockResolvedValue(undefined);
  trackEmailsSentMock.mockResolvedValue(undefined);
});

describe('POST /api/sequences/[id]/steps/[stepId]/send-test', () => {
  const buildRequest = (body: unknown) =>
    new Request('http://localhost/api/sequences/11111111-2222-3333-4444-555555555555/steps/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body)
    });

  it('sends a test email to the provided recipient', async () => {
    const response = await POST(buildRequest({ recipientEmail: 'test@example.com' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(200);
  expect(assertCanSendEmailsMock).toHaveBeenCalledWith(77, 1);
    expect(renderSequenceContentMock).toHaveBeenCalledWith(
      'Hello {{firstName}}',
      'Body for {{company}}',
      expect.objectContaining({ email: 'test@example.com' })
    );
    expect(dispatchSequenceEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'test@example.com',
        isTest: true,
        shouldVerify: true,
        subject: 'Rendered subject'
      })
    );
  expect(trackEmailsSentMock).toHaveBeenCalledWith(77, 1);
  });

  it('defaults to the user email when recipient is omitted', async () => {
    const response = await POST(buildRequest({}), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(200);
    expect(assertCanSendEmailsMock).toHaveBeenCalledTimes(1);
    expect(dispatchSequenceEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'owner@example.com', shouldVerify: true })
    );
    expect(trackEmailsSentMock).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the step is not found', async () => {
    getSequenceStepForTeamMock.mockResolvedValueOnce(null);

    const response = await POST(buildRequest({ recipientEmail: 'test@example.com' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'ffffffff-1111-2222-3333-444444444444'
      }
    });

    expect(response.status).toBe(404);
    expect(assertCanSendEmailsMock).not.toHaveBeenCalled();
    expect(dispatchSequenceEmailMock).not.toHaveBeenCalled();
    expect(trackEmailsSentMock).not.toHaveBeenCalled();
  });

  it('returns 409 when no sender is configured', async () => {
    getSequenceStepForTeamMock.mockResolvedValueOnce({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sequenceId: '11111111-2222-3333-4444-555555555555',
      subject: 'Hello {{firstName}}',
      body: 'Body for {{company}}',
      order: 1,
      sequenceSenderId: null,
      senderId: null,
      senderName: null,
      senderEmail: null,
      senderStatus: null,
      senderHost: null,
      senderPort: null,
      senderUsername: null,
      senderPassword: null
    });

    const response = await POST(buildRequest({ recipientEmail: 'test@example.com' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(409);
    expect(assertCanSendEmailsMock).not.toHaveBeenCalled();
    expect(dispatchSequenceEmailMock).not.toHaveBeenCalled();
    expect(trackEmailsSentMock).not.toHaveBeenCalled();
  });

  it('returns 409 when sender is inactive', async () => {
    getSequenceStepForTeamMock.mockResolvedValueOnce({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sequenceId: '11111111-2222-3333-4444-555555555555',
      subject: 'Hello {{firstName}}',
      body: 'Body for {{company}}',
      order: 1,
      sequenceSenderId: 10,
      senderId: 10,
      senderName: 'Inactive Sender',
      senderEmail: 'sender@example.com',
      senderStatus: 'disabled',
      senderHost: 'smtp.example.com',
      senderPort: 587,
      senderUsername: 'smtp-user',
      senderPassword: 'smtp-pass'
    });

    const response = await POST(buildRequest({ recipientEmail: 'test@example.com' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(409);
    expect(assertCanSendEmailsMock).not.toHaveBeenCalled();
    expect(dispatchSequenceEmailMock).not.toHaveBeenCalled();
    expect(trackEmailsSentMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid recipient email', async () => {
    const response = await POST(buildRequest({ recipientEmail: 'not-an-email' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(400);
    expect(assertCanSendEmailsMock).not.toHaveBeenCalled();
    expect(dispatchSequenceEmailMock).not.toHaveBeenCalled();
    expect(trackEmailsSentMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const response = await POST(buildRequest({ recipientEmail: 'test@example.com' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(401);
    expect(assertCanSendEmailsMock).not.toHaveBeenCalled();
    expect(trackEmailsSentMock).not.toHaveBeenCalled();
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const response = await POST(buildRequest({ recipientEmail: 'test@example.com' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(403);
    expect(assertCanSendEmailsMock).not.toHaveBeenCalled();
    expect(trackEmailsSentMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the monthly email limit would be exceeded', async () => {
    assertCanSendEmailsMock.mockRejectedValueOnce(new PlanLimitExceededErrorRef('emails', 2000, 0));

    const response = await POST(buildRequest({ recipientEmail: 'test@example.com' }), {
      params: {
        id: '11111111-2222-3333-4444-555555555555',
        stepId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      }
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.resource).toBe('emails');
    expect(payload.limit).toBe(2000);
    expect(payload.remaining).toBe(0);
    expect(trackEmailsSentMock).not.toHaveBeenCalled();
    expect(dispatchSequenceEmailMock).not.toHaveBeenCalled();
  });
});
