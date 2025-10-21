import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSenderForTeamMock = vi.fn();
const createSequenceMock = vi.fn();

type PostRoute = (request: Request) => Promise<Response>;
let POST: PostRoute;

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getSenderForTeam: getSenderForTeamMock,
  createSequence: createSequenceMock
}));

beforeAll(async () => {
  ({ POST } = await import('@/app/api/sequences/create/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  getSenderForTeamMock.mockResolvedValue({
    id: 9,
    name: 'Primary Sender',
    email: 'sender@example.com',
    status: 'verified'
  });
  createSequenceMock.mockResolvedValue({
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Warm leads',
    status: 'active',
    senderId: 9,
    sender: {
      id: 9,
      name: 'Primary Sender',
      email: 'sender@example.com',
      status: 'verified'
    },
    createdAt: '2025-10-15T10:00:00.000Z',
    updatedAt: '2025-10-15T10:00:00.000Z',
    steps: [
      {
        id: 'step-1',
        subject: 'Hey there',
        body: 'Hi {{firstName}}',
        delayHours: 0,
        order: 1,
        skipIfReplied: false,
        skipIfBounced: false,
        delayIfReplied: null
      }
    ]
  });
});

describe('POST /api/sequences/create', () => {
  it('creates a sequence with trimmed inputs and sequential order', async () => {
    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '  Warm leads  ',
        senderId: 9,
        steps: [
          {
            order: 2,
            subject: '  Follow up   ',
            body: 'Checking in',
            delay: 48
          },
          {
            order: 1,
            subject: ' Intro ',
            body: 'Hello there',
            delay: 0
          }
        ]
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(getSenderForTeamMock).toHaveBeenCalledWith(42, 9);

    expect(createSequenceMock).toHaveBeenCalledWith(42, 7, {
      name: 'Warm leads',
      senderId: 9,
      steps: [
        {
          subject: 'Intro',
          body: 'Hello there',
          delay: 0,
          order: 1,
          skipIfReplied: false,
          skipIfBounced: false,
          delayIfReplied: null
        },
        {
          subject: 'Follow up',
          body: 'Checking in',
          delay: 48,
          order: 2,
          skipIfReplied: false,
          skipIfBounced: false,
          delayIfReplied: null
        }
      ]
    });

    const payload = await response.json();
    expect(payload.sequence).toMatchObject({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Warm leads',
      status: 'active',
      senderId: 9,
      sender: {
        id: 9,
        name: 'Primary Sender',
        email: 'sender@example.com',
        status: 'verified'
      }
    });
    expect(payload.sequence.steps[0]).toMatchObject({
      skipIfReplied: false,
      skipIfBounced: false,
      delayIfReplied: null
    });
  });

  it('returns validation errors when payload is invalid', async () => {
    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', steps: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Validation failed');
  });

  it('rejects unauthenticated requests', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', steps: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', steps: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/sequences/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
