import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const updateContactMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    updateContact: updateContactMock
  };
});

type PatchRoute = (request: Request) => Promise<Response>;

let PATCH: PatchRoute;

beforeAll(async () => {
  ({ PATCH } = await import('@/app/api/contacts/update/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 7 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  updateContactMock.mockResolvedValue({
    id: '11111111-2222-3333-4444-555555555555',
    firstName: 'Avery',
    lastName: 'Stone',
    email: 'avery@example.com',
    company: 'Stone Inc.',
    tags: ['Enterprise'],
    createdAt: new Date('2024-01-01T00:00:00.000Z')
  });
});

describe('PATCH /api/contacts/update', () => {
  it('updates a contact and trims payload values', async () => {
    const request = new Request('http://localhost/api/contacts/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-2222-3333-4444-555555555555',
        firstName: ' Avery ',
        company: ' Stone Inc. ',
        tags: [' Enterprise ', 'enterprise']
      })
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(updateContactMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555', {
      firstName: 'Avery',
      company: 'Stone Inc.',
      tags: ['Enterprise']
    });

    const payload = await response.json();
    expect(payload.message).toBe('Contact updated successfully');
    expect(payload.contact).toMatchObject({
      id: '11111111-2222-3333-4444-555555555555',
      firstName: 'Avery',
      tags: ['Enterprise']
    });
  });

  it('returns validation errors when no fields are provided', async () => {
    const request = new Request('http://localhost/api/contacts/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' })
    });

    const response = await PATCH(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('Validation failed');
  });

  it('returns 404 when the contact cannot be found', async () => {
    updateContactMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-2222-3333-4444-555555555555',
        company: 'Stone Inc.'
      })
    });

    const response = await PATCH(request);

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe('Contact not found');
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/contacts/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-2222-3333-4444-555555555555',
        company: 'Stone Inc.'
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-2222-3333-4444-555555555555',
        company: 'Stone Inc.'
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/contacts/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{ bad json'
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Invalid JSON payload');
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-2222-3333-4444-555555555555',
        company: 'Stone Inc.'
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(403);
  });
});
