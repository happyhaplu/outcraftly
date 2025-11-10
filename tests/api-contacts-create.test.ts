import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const createContactWithCustomFieldsMock = vi.fn();

let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;
let PlanLimitExceededErrorRef: typeof import('@/lib/db/queries').PlanLimitExceededError;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    createContactWithCustomFields: createContactWithCustomFieldsMock
  };
});

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/contacts/create/route'));
  ({
    UnauthorizedError: UnauthorizedErrorRef,
    InactiveTrialError: InactiveTrialErrorRef,
    PlanLimitExceededError: PlanLimitExceededErrorRef
  } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  createContactWithCustomFieldsMock.mockResolvedValue({
    id: 'contact-1',
    teamId: 42,
    firstName: 'Avery',
    lastName: 'Stone',
    email: 'avery@example.com',
    company: 'Stone Inc.',
    tags: ['prospect'],
    timezone: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z')
  });
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
    expect(createContactWithCustomFieldsMock).toHaveBeenCalledWith(42, {
      firstName: 'Avery',
      lastName: 'Stone',
      email: 'avery@example.com',
      company: 'Stone Inc.',
      tags: ['prospect'],
      timezone: undefined,
      customFields: undefined
    });
  });

  it('rejects duplicate contacts', async () => {
    createContactWithCustomFieldsMock.mockResolvedValueOnce(null);

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
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

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

  it('rejects inactive trial accounts', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

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
    expect(response.status).toBe(403);
  });

  it('rejects when the plan prospect limit would be exceeded', async () => {
    createContactWithCustomFieldsMock.mockRejectedValueOnce(new PlanLimitExceededErrorRef('prospects', 500, 0));

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
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.resource).toBe('prospects');
    expect(payload.limit).toBe(500);
    expect(payload.remaining).toBe(0);
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
