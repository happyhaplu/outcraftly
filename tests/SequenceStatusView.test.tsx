import React from 'react';
import { describe, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../app/(dashboard)/sequences/use-sequence-status', () => ({
  useSequenceStatus: vi.fn()
}));

import { useSequenceStatus } from '../app/(dashboard)/sequences/use-sequence-status';
import { SequenceStatusView } from '../app/(dashboard)/sequences/SequenceStatusView';

const mockUseSequenceStatus = vi.mocked(useSequenceStatus);
const SUMMARY_KEYS = ['total', 'pending', 'sent', 'replied', 'replyCount', 'bounced', 'failed', 'skipped', 'lastActivity'] as const;

describe('SequenceStatusView replied counts', () => {
  beforeEach(() => {
    mockUseSequenceStatus.mockReset();
  });

  it('shows replied count when replyCount provided by backend', () => {
    mockUseSequenceStatus.mockImplementation(() => ({
      data: {
        sequence: null,
        summary: {
          total: 3,
          pending: 0,
          sent: 2,
          replied: 0,
          replyCount: 1,
          bounced: 0,
          failed: 0,
          skipped: 0,
          lastActivity: null
        },
        contacts: [],
        steps: [],
        sentPerStep: {},
        worker: { queueSize: 0, lastRunAt: null, lastFailureAt: null, lastError: null, minSendIntervalMinutes: 5 },
        meta: {
          summaryKeys: SUMMARY_KEYS,
          payloadHasReplyCount: true,
          aggregatedReplyCount: 1,
          repliedCount: 0
        }
      },
      error: null,
      isLoading: false,
      isValidating: false,
      refresh: async () => {}
    }));

    render(<SequenceStatusView sequenceId="sequence-1" />);

    const label = screen
      .getAllByText(/Replied/i, { selector: 'p' })
      .find((element) => element.textContent?.trim() === 'Replied');
    expect(label).toBeTruthy();

  const container = label?.parentElement;
  expect(container).toBeTruthy();

  const countElement = within(container as HTMLElement).getByText('1', { selector: 'p' });
  expect(countElement).toBeTruthy();
  });

  it('shows 0 when replyCount missing and replied is 0', () => {
    mockUseSequenceStatus.mockImplementation(() => ({
      data: {
        sequence: null,
        summary: {
          total: 2,
          pending: 0,
          sent: 2,
          replied: 0,
          // replyCount omitted => should be null in normalized payload
          replyCount: null,
          bounced: 0,
          failed: 0,
          skipped: 0,
          lastActivity: null
        },
        contacts: [],
        steps: [],
        sentPerStep: {},
        worker: { queueSize: 0, lastRunAt: null, lastFailureAt: null, lastError: null, minSendIntervalMinutes: 5 },
        meta: {
          summaryKeys: SUMMARY_KEYS,
          payloadHasReplyCount: false,
          aggregatedReplyCount: 0,
          repliedCount: 0
        }
      },
      error: null,
      isLoading: false,
      isValidating: false,
      refresh: async () => {}
    }));

    render(<SequenceStatusView sequenceId="sequence-2" />);

    const label = screen
      .getAllByText(/Replied/i, { selector: 'p' })
      .find((element) => element.textContent?.trim() === 'Replied');
    expect(label).toBeTruthy();

    const container = label?.parentElement;
    expect(container).toBeTruthy();

    const countElement = within(container as HTMLElement).getByText('0', { selector: 'p' });
    expect(countElement).toBeTruthy();
  });
});
