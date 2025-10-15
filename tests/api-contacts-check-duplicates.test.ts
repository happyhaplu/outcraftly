import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const whereMock = vi.fn();
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: selectMock
  }
}));

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/contacts/check-duplicates/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  whereMock.mockResolvedValue([{ email: 'alex@example.com' }]);
});

describe('POST /api/contacts/check-duplicates', () => {
  it('returns duplicates found in the database', async () => {
    const request = new Request('http://localhost/api/contacts/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: ['alex@example.com', 'avery@example.com'] })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.duplicates).toEqual(['alex@example.com']);
    expect(selectMock).toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalled();
    expect(whereMock).toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: ['alex@example.com'] })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('validates payload shape', async () => {
    const request = new Request('http://localhost/api/contacts/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
