import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const whereMock = vi.fn();
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock
  };
});

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: selectMock
  }
}));
let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/contacts/check-duplicates/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 1 });
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
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/contacts/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: ['alex@example.com'] })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: ['alex@example.com'] })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
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
