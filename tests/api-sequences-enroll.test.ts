import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const enrollContactsMock = vi.fn();

let SequenceEnrollmentErrorRef: typeof import('@/lib/db/queries').SequenceEnrollmentError;

type PostRoute = (request: Request) => Promise<Response>;
let POST: PostRoute;

vi.mock('@/lib/db/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries')>('@/lib/db/queries');
  return {
    ...actual,
    getUser: getUserMock,
    getTeamForUser: getTeamForUserMock,
    enrollContactsInSequence: enrollContactsMock
  };
});

beforeAll(async () => {
  ({ POST } = await import('@/app/api/sequences/enroll/route'));
  ({ SequenceEnrollmentError: SequenceEnrollmentErrorRef } = await import('@/lib/db/queries'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 10 });
  getTeamForUserMock.mockResolvedValue({ id: 55 });
  enrollContactsMock.mockResolvedValue({ enrolled: 2, skipped: 1 });
});

describe('POST /api/sequences/enroll', () => {
  it('enrolls contacts into a sequence and reports skipped duplicates', async () => {
    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: '11111111-2222-3333-4444-555555555555',
        contactIds: [
          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'ffffffff-1111-2222-3333-444444444444'
        ]
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(enrollContactsMock).toHaveBeenCalledWith(
      55,
      '11111111-2222-3333-4444-555555555555',
      [
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'ffffffff-1111-2222-3333-444444444444'
      ],
      undefined
    );

    const payload = await response.json();
    expect(payload.enrolled).toBe(2);
    expect(payload.skipped).toBe(1);
    expect(payload.message).toBe('Contacts enrolled successfully.');
  });

  it('forwards scheduling options to the enrollment handler', async () => {
    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: '11111111-2222-3333-4444-555555555555',
        contactIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
        schedule: {
          mode: 'fixed',
          sendTime: '10:30',
          respectContactTimezone: false
        }
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(enrollContactsMock).toHaveBeenCalledWith(
      55,
      '11111111-2222-3333-4444-555555555555',
      ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
      {
        mode: 'fixed',
        sendTime: '10:30',
        respectContactTimezone: false
      }
    );
  });

  it('returns validation errors for invalid payloads', async () => {
    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequenceId: 'invalid', contactIds: [] })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(enrollContactsMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    getUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: '11111111-2222-3333-4444-555555555555',
        contactIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects requests without a workspace', async () => {
    getTeamForUserMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: '11111111-2222-3333-4444-555555555555',
        contactIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns not found when the sequence is missing', async () => {
    enrollContactsMock.mockRejectedValueOnce(
      new SequenceEnrollmentErrorRef('sequence_not_found', 'Sequence not found for this workspace')
    );

    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: '11111111-2222-3333-4444-555555555555',
        contactIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe('sequence_not_found');
  });

  it('returns validation error when contacts belong to another workspace', async () => {
    enrollContactsMock.mockRejectedValueOnce(
      new SequenceEnrollmentErrorRef('contacts_not_found', 'One or more contacts could not be found in this workspace')
    );

    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: '11111111-2222-3333-4444-555555555555',
        contactIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('contacts_not_found');
  });

  it('returns conflict when sequence is paused', async () => {
    enrollContactsMock.mockRejectedValueOnce(
      new SequenceEnrollmentErrorRef('sequence_paused', 'Sequence is paused and cannot accept enrollments')
    );

    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: '11111111-2222-3333-4444-555555555555',
        contactIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.code).toBe('sequence_paused');
  });

  it('handles invalid JSON payloads', async () => {
    const request = new Request('http://localhost/api/sequences/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json'
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
