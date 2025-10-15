import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const insertContactsMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  insertContacts: insertContactsMock
}));

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/contacts/create/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  insertContactsMock.mockResolvedValue(1);
});

describe('POST /api/contacts/create', () => {
  it('creates a contact and normalises the email address', async () => {
    const request = new Request('http://localhost/api/contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Avery',
        lastName: 'Stone',
        email: 'Avery@Example.com',
        company: 'Stone Inc.',
        tags: ['prospect']
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload.message).toBe('Contact created successfully');
    expect(insertContactsMock).toHaveBeenCalledWith(42, [
      {
        firstName: 'Avery',
        lastName: 'Stone',
        email: 'avery@example.com',
        company: 'Stone Inc.',
        tags: ['prospect']
      }
    ]);
  });

  it('rejects duplicate contacts', async () => {
    insertContactsMock.mockResolvedValueOnce(0);

    const request = new Request('http://localhost/api/contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Avery',
        lastName: 'Stone',
        email: 'avery@example.com',
        company: 'Stone Inc.',
        tags: []
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(409);

    const payload = await response.json();
    expect(payload.error).toBe('A contact with this email already exists.');
  });

  it('returns validation errors for missing fields', async () => {
    const request = new Request('http://localhost/api/contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: 'Stone',
        email: 'avery@example.com',
        company: 'Stone Inc.'
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Validation failed');
    expect(payload.fieldErrors?.firstName).toBeDefined();
  });

  it('requires authentication', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Avery',
        lastName: 'Stone',
        email: 'avery@example.com',
        company: 'Stone Inc.'
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('fails gracefully on invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Invalid JSON payload');
  });
});
