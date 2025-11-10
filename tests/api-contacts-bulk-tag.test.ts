import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const addTagsToContactsMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let TRIAL_EXPIRED_ERROR_MESSAGE_REF: typeof import('@/lib/db/queries').TRIAL_EXPIRED_ERROR_MESSAGE;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    addTagsToContacts: addTagsToContactsMock
  };
});

type PatchRoute = (request: Request) => Promise<Response>;

let PATCH: PatchRoute;

beforeAll(async () => {
  ({ PATCH } = await import('@/app/api/contacts/bulk-tag/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    TRIAL_EXPIRED_ERROR_MESSAGE: TRIAL_EXPIRED_ERROR_MESSAGE_REF
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 11 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  addTagsToContactsMock.mockResolvedValue({ updated: 2, applied: 3 });
});

describe('PATCH /api/contacts/bulk-tag', () => {
  it('adds tags to multiple contacts', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-tag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [
          '11111111-2222-3333-4444-555555555555',
          'aaaa1111-bbbb-2222-cccc-333333333333'
        ],
        tags: [' Prospect ', 'enterprise', 'prospect']
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);

    expect(addTagsToContactsMock).toHaveBeenCalledWith(42, [
      '11111111-2222-3333-4444-555555555555',
      'aaaa1111-bbbb-2222-cccc-333333333333'
    ], ['Prospect', 'enterprise']);

    const payload = await response.json();
    expect(payload.applied).toBe(3);
    expect(payload.updated).toBe(2);
    expect(payload.message).toBe('3 tags added across 2 contacts.');
  });

  it('returns validation error when no tags are provided', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-tag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555'],
        tags: []
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('returns validation error when tags normalise to empty', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-tag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555'],
        tags: ['   ']
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/contacts/bulk-tag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555'],
        tags: ['prospect']
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts/bulk-tag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555'],
        tags: ['prospect']
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.error).toBe(TRIAL_EXPIRED_ERROR_MESSAGE_REF);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/contacts/bulk-tag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['11111111-2222-3333-4444-555555555555'],
        tags: ['prospect']
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/contacts/bulk-tag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });
});
