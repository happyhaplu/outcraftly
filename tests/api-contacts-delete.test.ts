import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const deleteContactMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    deleteContact: deleteContactMock
  };
});

type DeleteRoute = (request: Request) => Promise<Response>;

let DELETE: DeleteRoute;

beforeAll(async () => {
  ({ DELETE } = await import('@/app/api/contacts/delete/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 5 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  deleteContactMock.mockResolvedValue(1);
});

describe('DELETE /api/contacts/delete', () => {
  it('removes a contact', async () => {
    const request = new Request('http://localhost/api/contacts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' })
    });

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(deleteContactMock).toHaveBeenCalledWith(42, '11111111-2222-3333-4444-555555555555');

    const payload = await response.json();
    expect(payload.message).toBe('Contact deleted successfully');
  });

  it('returns 404 when no contact is removed', async () => {
    deleteContactMock.mockResolvedValueOnce(0);

    const request = new Request('http://localhost/api/contacts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(404);

    const payload = await response.json();
    expect(payload.error).toBe('Contact not found');
  });

  it('validates payload structure', async () => {
    const request = new Request('http://localhost/api/contacts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/contacts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(403);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/contacts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json'
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });
});
