// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn()
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh
  })
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

import { SequenceEditor } from '@/app/(dashboard)/sequences/[id]/SequenceEditor';

describe('SequenceEditor', () => {
  const fetchMock = vi.fn();

  const senderSnapshot = {
    id: 7,
    name: 'Primary Sender',
    email: 'sender@example.com',
    status: 'verified' as const
  };

  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.toast.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('allows editing sequence details and saving updates', async () => {
    const initialSequence = {
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Warm leads',
      status: 'active' as const,
      launchAt: null,
      launchedAt: '2025-10-15T09:55:00.000Z',
      senderId: senderSnapshot.id,
      sender: senderSnapshot,
      createdAt: '2025-10-15T10:00:00.000Z',
      updatedAt: '2025-10-15T10:00:00.000Z',
      minGapMinutes: 10,
        contactIds: [],
        tracking: {
          trackOpens: true,
          trackClicks: true,
          enableUnsubscribe: true
        },
        schedule: {
          mode: 'immediate' as const,
          sendTime: null,
          sendWindowStart: null,
          sendWindowEnd: null,
          respectContactTimezone: true,
          fallbackTimezone: null,
          timezone: null,
          sendDays: null,
          sendWindows: null
        },
        stopCondition: 'on_reply' as const,
        stopOnBounce: false,
      steps: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          subject: 'Original subject',
          body: 'Initial body',
          delayHours: 24,
          order: 1,
          skipIfReplied: false,
          skipIfBounced: false,
          delayIfReplied: null
        }
      ]
    };

    const updatedSequence = {
      ...initialSequence,
      status: 'active' as const,
      updatedAt: '2025-10-15T11:00:00.000Z',
      minGapMinutes: 12,
      steps: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          subject: 'Updated subject',
          body: 'Initial body',
          delayHours: 48,
          order: 1,
          skipIfReplied: false,
          skipIfBounced: true,
          delayIfReplied: 6
        }
      ]
    };

    fetchMock.mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ email: 'owner@example.com' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }

      if (url.endsWith('/api/senders')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              senders: [
                {
                  id: senderSnapshot.id,
                  name: senderSnapshot.name,
                  email: senderSnapshot.email,
                  status: senderSnapshot.status
                }
              ]
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      if (url.endsWith('/api/sequences/update')) {
        return Promise.resolve(
          new Response(JSON.stringify({ sequence: updatedSequence }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled fetch call: ${url}`));
    });

    render(<SequenceEditor sequenceId={initialSequence.id} initialSequence={initialSequence} />);

    const subjectInput = screen.getByLabelText('Subject');
    fireEvent.change(subjectInput, { target: { value: ' Updated subject ' } });

    const delayInput = screen.getByLabelText('Delay before sending');
    fireEvent.change(delayInput, { target: { value: '2' } });

    const showOptionsButton = screen.getByRole('button', { name: /show options/i });
    fireEvent.click(showOptionsButton);

    const skipBounceCheckbox = screen.getByLabelText('Skip step when an email bounces');
    fireEvent.click(skipBounceCheckbox);

    const pauseAfterReplyInput = screen.getByLabelText('Pause after a reply');
    fireEvent.change(pauseAfterReplyInput, { target: { value: '6' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => typeof input === 'string' && input.endsWith('/api/sequences/update'));
      expect(call).toBeDefined();
    });

    const updateCall = fetchMock.mock.calls.find(([input]) => typeof input === 'string' && input.endsWith('/api/sequences/update'));
    if (!updateCall) {
      throw new Error('Expected PATCH request to /api/sequences/update');
    }
    const [, requestInit] = updateCall;
    expect(requestInit?.method).toBe('PATCH');

    const parsedBody = JSON.parse((requestInit?.body ?? '{}') as string);
    expect(parsedBody).toMatchObject({
      id: initialSequence.id,
      name: 'Warm leads',
      senderId: senderSnapshot.id,
      minGapMinutes: 10,
      steps: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          subject: 'Updated subject',
          delay: 48,
          order: 1,
          skipIfReplied: false,
          skipIfBounced: true,
          delayIfReplied: 6
        }
      ]
    });

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sequence updated' })));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('enrolls contacts from the status view modal', async () => {
    const sequenceId = '11111111-2222-3333-4444-555555555555';

    const initialSequence = {
      id: sequenceId,
      name: 'Warm leads',
      status: 'active' as const,
      launchAt: '2025-10-20T10:00:00.000Z',
      launchedAt: null,
      senderId: senderSnapshot.id,
      sender: senderSnapshot,
      createdAt: '2025-10-15T10:00:00.000Z',
      updatedAt: '2025-10-15T10:00:00.000Z',
      contactIds: [],
      tracking: {
        trackOpens: true,
        trackClicks: false,
        enableUnsubscribe: true
      },
      schedule: {
        mode: 'fixed' as const,
        sendTime: '09:00',
        sendWindowStart: null,
        sendWindowEnd: null,
        respectContactTimezone: true,
        fallbackTimezone: 'UTC',
        timezone: null,
        sendDays: null,
        sendWindows: null
      },
      stopCondition: 'manual' as const,
      stopOnBounce: false,
      minGapMinutes: 6,
      steps: [
        {
          id: 'step-1',
          subject: 'Original subject',
          body: 'Initial body',
          delayHours: 24,
          order: 1,
          skipIfReplied: false,
          skipIfBounced: false,
          delayIfReplied: null
        }
      ]
    };

    const contact = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      firstName: 'Alex',
      lastName: 'Sender',
      email: 'alex@example.com',
      company: 'Northwind',
      tags: ['Warm']
    };

    const statusAfterEnrollment = {
      sequence: {
        id: sequenceId,
        name: 'Warm leads',
        status: 'active' as const,
        launchAt: '2025-10-20T10:00:00.000Z',
        launchedAt: null,
        senderId: senderSnapshot.id,
        sender: senderSnapshot,
        createdAt: '2025-10-15T10:00:00.000Z',
        updatedAt: '2025-10-15T10:00:00.000Z',
        tracking: {
          trackOpens: true,
          trackClicks: true,
          enableUnsubscribe: true
        },
        schedule: {
          mode: 'immediate' as const,
          sendTime: null,
          sendWindowStart: null,
          sendWindowEnd: null,
          respectContactTimezone: true,
          fallbackTimezone: null,
          timezone: null,
          sendDays: null,
          sendWindows: null
        },
        stopCondition: 'on_reply' as const,
        stopOnBounce: false,
        minGapMinutes: 6
      },
      summary: {
        total: 1,
        pending: 1,
        sent: 0,
        replied: 0,
        bounced: 0,
        skipped: 0,
        failed: 0,
        lastActivity: '2025-10-15T10:00:00.000Z'
      },
      contacts: [
        {
          id: 'status-1',
          contactId: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          company: contact.company,
          status: 'pending',
          lastUpdated: '2025-10-15T10:00:00.000Z',
          stepOrder: 1,
          stepSubject: 'Original subject'
        }
      ]
    };

    let statusCallCount = 0;
    const fetchHistory: Array<{ url: string; init?: RequestInit }> = [];

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetchHistory.push({ url, init });

      if (url.endsWith('/api/user')) {
        return new Response(JSON.stringify({ email: 'owner@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.endsWith('/api/senders')) {
        return new Response(JSON.stringify({ senders: [senderSnapshot] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.endsWith(`/api/sequences/status/${sequenceId}`)) {
        statusCallCount += 1;
        if (statusCallCount === 1) {
          return new Response(
            JSON.stringify({
              sequence: {
                id: sequenceId,
                name: 'Warm leads',
                status: 'active' as const,
                launchAt: '2025-10-20T10:00:00.000Z',
                launchedAt: null,
                senderId: senderSnapshot.id,
                sender: senderSnapshot,
                createdAt: '2025-10-15T10:00:00.000Z',
                updatedAt: '2025-10-15T10:00:00.000Z',
                tracking: {
                  trackOpens: true,
                  trackClicks: true,
                  enableUnsubscribe: true
                },
                schedule: {
                  mode: 'immediate' as const,
                  sendTime: null,
                  sendWindowStart: null,
                  sendWindowEnd: null,
                  respectContactTimezone: true,
                  fallbackTimezone: null,
                  timezone: null,
                  sendDays: null,
                  sendWindows: null
                },
                stopCondition: 'on_reply' as const,
                stopOnBounce: false,
                minGapMinutes: 6
              },
              summary: {
                total: 0,
                pending: 0,
                sent: 0,
                replied: 0,
                bounced: 0,
                skipped: 0,
                failed: 0,
                lastActivity: null
              },
              contacts: []
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify(statusAfterEnrollment), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('/api/contacts')) {
        return new Response(
          JSON.stringify({
            contacts: [
              {
                ...contact,
                createdAt: '2025-10-15T10:00:00.000Z'
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/sequences/enroll')) {
        return new Response(JSON.stringify({ message: 'Contacts enrolled successfully.', enrolled: 1, skipped: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unhandled fetch call: ${url}`);
    });

    render(<SequenceEditor sequenceId={sequenceId} initialSequence={initialSequence} />);

    // Switch to the status tab
    const statusTab = screen.getByRole('button', { name: /sequence status/i });
    fireEvent.click(statusTab);

    // Wait for the initial status fetch to resolve
    await waitFor(() => expect(statusCallCount).toBeGreaterThan(0));

    const enrollButton = screen.getByRole('button', { name: /enroll contacts/i });
    fireEvent.click(enrollButton);

    // Wait for contacts to load into the dialog
    await waitFor(() => expect(screen.getByText('Alex Sender')).toBeTruthy());

    const checkbox = screen.getByLabelText(/select contact alex sender/i);
    fireEvent.click(checkbox);

    const confirmButton = screen.getByRole('button', { name: /enroll selected/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetchHistory.some(({ url }) => url.endsWith('/api/sequences/enroll'))).toBe(true);
    });

    const enrollRequest = fetchHistory.find(({ url }) => url.endsWith('/api/sequences/enroll'));
    expect(enrollRequest?.init?.method).toBe('POST');
    expect(enrollRequest?.init?.body).toBeDefined();

    const parsedBody = JSON.parse((enrollRequest?.init?.body ?? '{}') as string);
    expect(parsedBody).toEqual({
      sequenceId,
      contactIds: [contact.id]
    });

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('Contacts enrolled') })
      )
    );

    await waitFor(() => expect(screen.getByText('Alex Sender')).toBeTruthy());
    expect(screen.getByText('Northwind')).toBeTruthy();
  });
});
