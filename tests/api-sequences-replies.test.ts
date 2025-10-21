import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const listRepliesMock = vi.fn();
const listBouncesMock = vi.fn();

type GetRoute = (request: Request, context: { params: { id: string } }) => Promise<Response>;
let GET: GetRoute;

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  listSequenceRepliesForTeam: listRepliesMock,
  listSequenceBouncesForTeam: listBouncesMock
}));

beforeAll(async () => {
  ({ GET } = await import('@/app/api/sequences/replies/[id]/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 7 });
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
    getUserMock.mockResolvedValueOnce(null);

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
});
