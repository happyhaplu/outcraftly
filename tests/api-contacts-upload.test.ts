import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getContactsForTeamMock = vi.fn();
const insertContactsMock = vi.fn();

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getActiveUser: getActiveUserMock,
    getTeamForUser: getTeamForUserMock,
    getContactsForTeam: getContactsForTeamMock,
    insertContacts: insertContactsMock
  };
});

let POST: (request: Request) => Promise<Response>;
let PlanLimitExceededErrorRef: typeof import('@/lib/db/queries').PlanLimitExceededError;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/contacts/upload/route'));
  ({ PlanLimitExceededError: PlanLimitExceededErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 10 });
  getContactsForTeamMock.mockResolvedValue([]);
  insertContactsMock.mockResolvedValue({ inserted: 2, skipped: 0, ids: ['contact-1', 'contact-2'] });
});

describe('POST /api/contacts/upload', () => {
  it('parses CSV and inserts contacts', async () => {
    const csv = `firstName,lastName,email,company,tags\nAvery,Stone,avery@example.com,Stone Inc.,prospect\nJordan,Lee,jordan@example.com,Lee Ventures,"warm,lead"`;
    const formData = new FormData();
    formData.append('file', new File([csv], 'contacts.csv', { type: 'text/csv' }));

    const request = new Request('http://localhost/api/contacts/upload', {
      method: 'POST',
      body: formData
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.summary).toMatchObject({ total: 2, inserted: 2, skipped: 0, duplicates: 0 });
    expect(insertContactsMock).toHaveBeenCalledWith(10, [
      {
        firstName: 'Avery',
        lastName: 'Stone',
        email: 'avery@example.com',
        company: 'Stone Inc.',
        tags: ['prospect']
      },
      {
        firstName: 'Jordan',
        lastName: 'Lee',
        email: 'jordan@example.com',
        company: 'Lee Ventures',
        tags: ['warm', 'lead']
      }
    ]);
  });

  it('skips duplicates across existing contacts and within the file', async () => {
    getContactsForTeamMock.mockResolvedValueOnce([
      { email: 'existing@example.com' }
    ]);
    insertContactsMock.mockResolvedValueOnce({ inserted: 1, skipped: 1, ids: ['contact-1'] });

    const csv = `firstName,lastName,email,company\nAlex,Rowe,existing@example.com,Rowe Co\nBailey,Kay,bailey@example.com,Kay Studio\nAlex,Rowe,alex.rowe@example.com,Rowe Co`;
    const formData = new FormData();
    formData.append('file', new File([csv], 'contacts.csv', { type: 'text/csv' }));

    const request = new Request('http://localhost/api/contacts/upload', {
      method: 'POST',
      body: formData
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.summary).toMatchObject({ total: 3, inserted: 1, skipped: 2, duplicates: 2 });
  });

  it('rejects when the plan prospect limit would be exceeded', async () => {
    insertContactsMock.mockRejectedValueOnce(new PlanLimitExceededErrorRef('prospects', 500, 0));

    const csv = `firstName,lastName,email,company\nJordan,Lee,jordan@example.com,Lee Ventures`;
    const formData = new FormData();
    formData.append('file', new File([csv], 'contacts.csv', { type: 'text/csv' }));

    const request = new Request('http://localhost/api/contacts/upload', {
      method: 'POST',
      body: formData
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.resource).toBe('prospects');
    expect(payload.limit).toBe(500);
  });
});
