import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const bulkDeleteContactsMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  bulkDeleteContacts: bulkDeleteContactsMock
}));

type DeleteRoute = (request: Request) => Promise<Response>;

let DELETE: DeleteRoute;

beforeAll(async () => {
  ({ DELETE } = await import('@/app/api/contacts/bulk-delete/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 9 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  bulkDeleteContactsMock.mockResolvedValue(2);
});

describe('DELETE /api/contacts/bulk-delete', () => {
  it('removes multiple contacts and returns summary', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [
          '11111111-2222-3333-4444-555555555555',
          '66666666-7777-8888-9999-000000000000'
        ]
      })
    });

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(bulkDeleteContactsMock).toHaveBeenCalledWith(42, [
      '11111111-2222-3333-4444-555555555555',
      '66666666-7777-8888-9999-000000000000'
    ]);

    const payload = await response.json();
    expect(payload.removed).toBe(2);
    expect(payload.message).toBe('2 contacts deleted');
  });

  it('enforces at least one id', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe('Validation failed');
  });

  it('rejects unauthenticated requests', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555']
      })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555']
      })
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('Invalid JSON payload');
  });
});
