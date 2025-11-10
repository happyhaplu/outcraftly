import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const listContactCustomFieldDefinitionsMock = vi.fn();
const createContactCustomFieldDefinitionMock = vi.fn();
const findContactByEmailMock = vi.fn();
const createContactWithCustomFieldsMock = vi.fn();
const updateContactMock = vi.fn();

let POST: (request: Request) => Promise<Response>;
let UnauthorizedErrorRef: typeof import('@/lib/db/queries').UnauthorizedError;
let InactiveTrialErrorRef: typeof import('@/lib/db/queries').InactiveTrialError;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    listContactCustomFieldDefinitions: listContactCustomFieldDefinitionsMock,
    createContactCustomFieldDefinition: createContactCustomFieldDefinitionMock,
    findContactByEmail: findContactByEmailMock,
    createContactWithCustomFields: createContactWithCustomFieldsMock,
    updateContact: updateContactMock
  };
});

beforeAll(async () => {
  ({ POST } = await import('@/app/api/contacts/import/route'));
  ({ UnauthorizedError: UnauthorizedErrorRef, InactiveTrialError: InactiveTrialErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();

  getActiveUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 42 });
  listContactCustomFieldDefinitionsMock.mockResolvedValue([]);
  createContactCustomFieldDefinitionMock.mockResolvedValue({
    id: 'cf-123',
    key: 'linkedin-url',
    name: 'LinkedIn URL',
    type: 'text',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  });
  findContactByEmailMock.mockResolvedValue(null);
  createContactWithCustomFieldsMock.mockResolvedValue({ id: 'contact-1' });
  updateContactMock.mockResolvedValue({ id: 'contact-1' });
});

describe('POST /api/contacts/import', () => {
  it('creates contacts when they do not already exist', async () => {
    const request = new Request('http://localhost/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [
          {
            firstName: 'Taylor',
            lastName: 'Reed',
            email: 'taylor@example.com',
            company: 'Acme Co',
            jobTitle: 'VP of Sales',
            tags: ['prospect']
          }
        ],
        options: { dedupeBy: 'email' }
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(createContactWithCustomFieldsMock).toHaveBeenCalledWith(42, {
      firstName: 'Taylor',
      lastName: 'Reed',
      email: 'taylor@example.com',
      company: 'Acme Co',
      jobTitle: 'VP of Sales',
      tags: ['prospect'],
      timezone: undefined,
      customFields: undefined
    });

    const payload = await response.json();
    expect(payload.summary).toMatchObject({
      total: 1,
      imported: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      duplicates: 0
    });
  });

  it('updates existing contacts and maps custom fields by key', async () => {
    listContactCustomFieldDefinitionsMock.mockResolvedValueOnce([
      {
        id: 'field-1',
        key: 'favorite_color',
        name: 'Favorite color',
        type: 'text'
      }
    ]);
    findContactByEmailMock.mockResolvedValueOnce({ id: 'contact-99' });

    const request = new Request('http://localhost/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [
          {
            email: 'jamie@example.com',
            company: 'Nova Labs',
            jobTitle: 'CTO',
            customFields: {
              favorite_color: 'Blue'
            }
          }
        ],
        options: { dedupeBy: 'email' }
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(createContactWithCustomFieldsMock).not.toHaveBeenCalled();
    expect(updateContactMock).toHaveBeenCalledWith(42, 'contact-99', {
      company: 'Nova Labs',
      jobTitle: 'CTO',
      customFields: {
        'field-1': 'Blue'
      }
    });

    const payload = await response.json();
    expect(payload.summary).toMatchObject({
      total: 1,
      imported: 1,
      created: 0,
      updated: 1,
      skipped: 0,
      duplicates: 0
    });
  });

  it('creates missing custom fields when metadata is provided', async () => {
    listContactCustomFieldDefinitionsMock.mockResolvedValueOnce([]);
    createContactCustomFieldDefinitionMock.mockResolvedValueOnce({
      id: 'cf-new',
      key: 'custom-key',
      name: 'Custom Field',
      type: 'text',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z')
    });

    const request = new Request('http://localhost/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [
          {
            email: 'alex@example.com',
            customFields: {
              linkedin: 'https://linkedin.com/in/alex'
            }
          }
        ],
        options: {
          dedupeBy: 'email',
          createMissingCustomFields: true,
          customFieldMetadata: [
            {
              key: 'linkedin',
              name: 'LinkedIn',
              type: 'text'
            }
          ]
        }
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(createContactCustomFieldDefinitionMock).toHaveBeenCalledWith(42, {
      name: 'LinkedIn',
      type: 'text'
    });

    expect(createContactWithCustomFieldsMock).toHaveBeenCalledWith(42, {
      firstName: '',
      lastName: '',
      email: 'alex@example.com',
      company: '',
      jobTitle: null,
      tags: [],
      customFields: {
        'cf-new': 'https://linkedin.com/in/alex'
      }
    });

    const payload = await response.json();
    expect(payload.summary).toMatchObject({
      total: 1,
      imported: 1,
      created: 1,
      updated: 0,
      createdCustomFields: [
        expect.objectContaining({ id: 'cf-new', name: 'Custom Field' })
      ]
    });
  });

  it('returns 401 when request is unauthenticated', async () => {
    getActiveUserMock.mockRejectedValueOnce(new UnauthorizedErrorRef());

    const request = new Request('http://localhost/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [], options: {} })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 403 when trial is inactive', async () => {
    getActiveUserMock.mockRejectedValueOnce(new InactiveTrialErrorRef());

    const request = new Request('http://localhost/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [], options: {} })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
