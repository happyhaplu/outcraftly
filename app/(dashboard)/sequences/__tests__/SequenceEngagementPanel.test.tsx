import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SequenceEngagementPanel } from '../SequenceEngagementPanel';
import type { SequenceBounceActivity, SequenceReplyActivity } from '../types';

vi.mock('../use-sequence-replies', () => ({
  useSequenceReplies: vi.fn()
}));

const { useSequenceReplies } = await import('../use-sequence-replies');
const mockedUseSequenceReplies = vi.mocked(useSequenceReplies);

function mockHookReturn(payload: {
  replies: SequenceReplyActivity[];
  bounces: SequenceBounceActivity[];
  isLoading?: boolean;
  error?: Error | null;
  isValidating?: boolean;
}) {
  mockedUseSequenceReplies.mockReturnValue({
    data: {
      replies: payload.replies,
      bounces: payload.bounces
    },
    error: payload.error ?? null,
    isLoading: payload.isLoading ?? false,
    isValidating: payload.isValidating ?? false,
    refresh: vi.fn()
  });
}

describe('SequenceEngagementPanel', () => {
  beforeEach(() => {
    mockedUseSequenceReplies.mockReset();
  });

  const baseReply: SequenceReplyActivity = {
    id: 'reply-1',
    contactId: 'contact-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    company: 'Analytical Engines',
    subject: 'Re: Let\'s talk',
    snippet: 'Thanks for reaching out!',
    occurredAt: '2025-10-20T12:00:00.000Z',
    messageId: 'message-1',
    stepSubject: 'Intro email'
  };

  const baseBounce: SequenceBounceActivity = {
    id: 'bounce-1',
    contactId: 'contact-2',
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    company: 'Compilers Inc',
    reason: 'Mailbox full',
    detail: 'Inbox is full',
    occurredAt: '2025-10-19T09:30:00.000Z',
    messageId: 'message-2',
    stepSubject: 'Follow up'
  };

  it('renders recent replies and bounces with counts', () => {
    mockHookReturn({ replies: [baseReply], bounces: [baseBounce] });

    render(<SequenceEngagementPanel sequenceId="sequence-123" />);

    const repliesTitle = screen.getByText('Recent replies');
    expect(repliesTitle).toBeInTheDocument();

    const repliesContainer = repliesTitle.closest('div');
    expect(repliesContainer).not.toBeNull();
    if (repliesContainer) {
      expect(within(repliesContainer).getByText('1')).toBeInTheDocument();
    }

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Replied to:\s+Intro email/)).toBeInTheDocument();
    expect(screen.getByText('Thanks for reaching out!')).toBeInTheDocument();

    const bouncesTitle = screen.getByText('Recent bounces');
    expect(bouncesTitle).toBeInTheDocument();

    const bouncesContainer = bouncesTitle.closest('div');
    expect(bouncesContainer).not.toBeNull();
    if (bouncesContainer) {
      expect(within(bouncesContainer).getByText('1')).toBeInTheDocument();
    }

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText(/Reason: Mailbox full/)).toBeInTheDocument();
  });

  it('shows empty states when no activity captured', () => {
    mockHookReturn({ replies: [], bounces: [] });

    render(<SequenceEngagementPanel sequenceId="sequence-123" />);

    expect(screen.getByText('No replies yet')).toBeInTheDocument();
    expect(screen.getByText('No bounces detected')).toBeInTheDocument();
  });

  it('renders replies after a refresh/revalidation', async () => {
    const mockedHook = vi.mocked(useSequenceReplies);

    const initial = {
      replies: [],
      bounces: []
    } as const;

    const reply = {
      id: 'reply-2',
      contactId: 'contact-3',
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan@example.com',
      company: 'Computing',
      subject: 'Re: Hi',
      snippet: 'I can help',
      occurredAt: '2025-10-21T10:00:00.000Z',
      messageId: 'message-3',
      stepSubject: 'Follow up'
    } as const;

    const updated = {
      replies: [reply],
      bounces: []
    } as const;

    const performRefresh = vi.fn().mockImplementation(async () => {
      mockedHook.mockReturnValue({
        data: { replies: updated.replies as any, bounces: updated.bounces as any },
        error: null,
        isLoading: false,
        isValidating: false,
        refresh: performRefresh
      } as any);
    });

    mockedHook.mockReturnValue({
      data: { replies: initial.replies as any, bounces: initial.bounces as any },
      error: null,
      isLoading: false,
      isValidating: false,
      refresh: performRefresh
    } as any);

    const { rerender } = render(<SequenceEngagementPanel sequenceId="sequence-123" />);

    // empty state initially
    expect(screen.getByText('No replies yet')).toBeInTheDocument();

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(performRefresh).toHaveBeenCalledTimes(1);
    });

    const refreshResult = performRefresh.mock.results[0]?.value;
    if (refreshResult instanceof Promise) {
      await refreshResult;
    }

    rerender(<SequenceEngagementPanel sequenceId="sequence-123" />);

    // now the reply should be visible
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
  });
});
