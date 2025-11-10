import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSendersForTeamMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getSendersForTeam: getSendersForTeamMock
  };
});

let GET: () => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import('@/app/api/senders/stats/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 10 });
  getSendersForTeamMock.mockResolvedValue([
    {
      id: 1,
      name: 'Sales',
      email: 'sales@example.com',
      status: 'verified',
      bounceRate: 1.2,
      quotaUsed: 320,
      quotaLimit: 1000
    }
  ]);
});

describe('GET /api/senders/stats', () => {
  it('returns sender stats for workspace', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.senders).toHaveLength(1);
    expect(payload.senders[0]).toMatchObject({
      id: 1,
      bounceRate: 1.2,
      quotaUsed: 320,
      quotaLimit: 1000
    });
  });

  it('returns unauthorized when user missing', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());
    const response = await GET();
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
  });
});
