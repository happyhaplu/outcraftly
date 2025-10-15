import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getContactsForTeamMock = vi.fn();
const insertContactsMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getContactsForTeam: getContactsForTeamMock,
  insertContacts: insertContactsMock
}));

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/contacts/upload/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 10 });
  getContactsForTeamMock.mockResolvedValue([]);
  insertContactsMock.mockResolvedValue(2);
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
    insertContactsMock.mockResolvedValueOnce(1);

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
});
