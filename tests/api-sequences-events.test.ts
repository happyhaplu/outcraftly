import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordSequenceEventsMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  recordSequenceEvents: recordSequenceEventsMock
}));

let POST: (request: Request) => Promise<Response>;

const ORIGINAL_SECRET = process.env.SEQUENCE_EVENTS_SECRET;

describe('POST /api/sequences/events', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SEQUENCE_EVENTS_SECRET = 'test-secret';
    ({ POST } = await import('@/app/api/sequences/events/route'));
  });

  afterEach(() => {
    process.env.SEQUENCE_EVENTS_SECRET = ORIGINAL_SECRET;
  });

  it('fails with 500 when the secret is not configured', async () => {
    vi.resetModules();
    process.env.SEQUENCE_EVENTS_SECRET = '';
    ({ POST } = await import('@/app/api/sequences/events/route'));

    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify({ type: 'reply', messageId: 'msg-1' })
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(recordSequenceEventsMock).not.toHaveBeenCalled();
  });

  it('rejects requests without a valid bearer token', async () => {
    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      body: JSON.stringify({ type: 'reply', messageId: 'msg-1' })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(recordSequenceEventsMock).not.toHaveBeenCalled();
  });

  it('returns validation errors when the payload is invalid', async () => {
    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify({ type: 'reply', messageId: '' })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(recordSequenceEventsMock).not.toHaveBeenCalled();
  });

  it('processes events and returns their outcome', async () => {
    recordSequenceEventsMock.mockResolvedValueOnce([
      { type: 'reply', status: 'processed', contactId: 'contact-1', sequenceId: 'sequence-1' }
    ]);

    const request = new Request('http://localhost/api/sequences/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
      body: JSON.stringify({
        events: [
          {
            type: 'reply',
            messageId: 'msg-1',
            contactId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            sequenceId: '11111111-2222-3333-4444-555555555555',
            occurredAt: '2025-10-17T10:00:00.000Z',
            payload: { snippet: 'Thanks for reaching out!' }
          }
        ]
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(recordSequenceEventsMock).toHaveBeenCalledTimes(1);

    const [[events]] = recordSequenceEventsMock.mock.calls;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'reply',
      messageId: 'msg-1',
      contactId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sequenceId: '11111111-2222-3333-4444-555555555555'
    });

    const payload = await response.json();
    expect(payload.processed).toEqual([
      { type: 'reply', status: 'processed', contactId: 'contact-1', sequenceId: 'sequence-1' }
    ]);
  });
});
