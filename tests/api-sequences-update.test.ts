import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSenderForTeamMock = vi.fn();
const updateSequenceMock = vi.fn();

type PatchRoute = (request: Request) => Promise<Response>;
let PATCH: PatchRoute;

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getSenderForTeam: getSenderForTeamMock,
  updateSequence: updateSequenceMock
}));

beforeAll(async () => {
  ({ PATCH } = await import('@/app/api/sequences/update/route'));
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
  updateSequenceMock.mockResolvedValue({
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
    updatedAt: '2025-10-15T11:00:00.000Z',
    steps: [
      {
        id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
        subject: 'Hey there',
        body: 'Hi {{firstName}}',
        delayHours: 24,
        order: 1,
        skipIfReplied: false,
        skipIfBounced: true,
        delayIfReplied: 12
      }
    ]
  });
});

describe('PATCH /api/sequences/update', () => {
  it('updates a sequence with sanitized input and normalized order', async () => {
    const request = new Request('http://localhost/api/sequences/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-2222-3333-4444-555555555555',
        name: '  Warm leads  ',
        senderId: 9,
        steps: [
          {
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            order: 5,
            subject: '  Follow up   ',
            body: 'Checking in',
            delay: 72
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

    const response = await PATCH(request);
    expect(response.status).toBe(200);

    expect(getSenderForTeamMock).toHaveBeenCalledWith(42, 9);

    expect(updateSequenceMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', {
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
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          subject: 'Follow up',
          body: 'Checking in',
          delay: 72,
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
      skipIfBounced: true,
      delayIfReplied: 12
    });
  });

  it('returns 404 when sequence is not found', async () => {
    updateSequenceMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Missing sequence',
        senderId: 9,
        steps: [
          {
            order: 1,
            subject: 'Test',
            body: 'Body',
            delay: 0
          }
        ]
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(404);
  });

  it('returns validation errors when payload is invalid', async () => {
    const request = new Request('http://localhost/api/sequences/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '', name: '', steps: [] })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555', name: 'Test', steps: [] })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555', name: 'Test', steps: [] })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/sequences/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });
});
