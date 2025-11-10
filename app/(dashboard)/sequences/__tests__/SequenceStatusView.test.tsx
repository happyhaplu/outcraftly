import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mutateSpy = vi.fn();

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr');
  return {
    ...actual,
  useSWRConfig: () => ({ mutate: mutateSpy } as unknown as ReturnType<typeof actual.useSWRConfig>)
  } satisfies typeof import('swr');
});

import { SequenceStatusView } from '../SequenceStatusView';
import type {
  SequenceContactStatus,
  SequenceLifecycleSnapshot,
  SequenceStepSummary,
  SequenceStatusSummary,
  SequenceWorkerSnapshot
} from '../types';

vi.mock('../use-sequence-status', () => ({
  useSequenceStatus: vi.fn()
}));

vi.mock('../SequenceDeliveryLogsPanel', () => ({
  SequenceDeliveryLogsPanel: () => <div data-testid="delivery-logs" />
}));

vi.mock('../SequenceEngagementPanel', () => ({
  SequenceEngagementPanel: () => <div data-testid="engagement-panel" />
}));

vi.mock('../SequenceEnrollDialog', () => ({
  SequenceEnrollDialog: () => <div data-testid="enroll-dialog" />
}));

const { useSequenceStatus } = await import('../use-sequence-status');
const mockedUseSequenceStatus = vi.mocked(useSequenceStatus);

const SUMMARY_KEYS = ['total', 'pending', 'sent', 'replied', 'replyCount', 'bounced', 'failed', 'skipped', 'lastActivity'] as const;

type MockSequenceStatusResponse = {
  sequence: SequenceLifecycleSnapshot | null;
  summary: SequenceStatusSummary;
  contacts: SequenceContactStatus[];
  steps: SequenceStepSummary[];
  sentPerStep: Record<string, number>;
  worker: SequenceWorkerSnapshot;
  meta: {
    summaryKeys: readonly string[];
    payloadHasReplyCount: boolean;
    aggregatedReplyCount: number;
    repliedCount: number;
  };
};

describe('SequenceStatusView', () => {
  beforeEach(() => {
    mutateSpy.mockClear();
    mutateSpy.mockResolvedValue(undefined);
    mockedUseSequenceStatus.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders summary cards, filters, and per-step breakdown', () => {
    const mockData: MockSequenceStatusResponse = {
      sequence: {
        id: 'sequence-123',
        name: 'Demo sequence',
        status: 'draft',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        launchAt: null,
        launchedAt: null,
        senderId: 99,
        sender: {
          id: 99,
          name: 'Primary sender',
          email: 'sender@example.com',
          status: 'verified'
        },
        minGapMinutes: 7
      },
      summary: {
        total: 3,
        pending: 1,
        sent: 1,
        replied: 1,
        replyCount: 1,
        bounced: 0,
        failed: 0,
        skipped: 0,
        lastActivity: '2025-01-01T00:01:00.000Z'
      },
      contacts: [
        {
          id: 'status-1',
          contactId: 'contact-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          company: 'Computing Ltd',
          timezone: 'UTC',
          status: 'pending',
          lastUpdated: '2025-01-01T00:00:00.000Z',
          stepOrder: 1,
          stepSubject: 'Intro',
          scheduledAt: '2025-01-01T00:00:00.000Z',
          sentAt: null,
          attempts: 0,
          replyAt: null,
          bounceAt: null,
          skippedAt: null,
          scheduleMode: null,
          scheduleSendTime: null,
          scheduleWindowStart: null,
          scheduleWindowEnd: null,
          scheduleRespectTimezone: true,
          scheduleFallbackTimezone: null,
          scheduleTimezone: null,
          scheduleSendDays: null,
          scheduleSendWindows: null,
          manualTriggeredAt: null,
          manualSentAt: null,
          lastThrottleAt: null
        }
      ],
      steps: [
        { stepId: 'step-1', order: 1, subject: 'Intro', pending: 1, sent: 0, replied: 0, bounced: 0, failed: 0, skipped: 0 }
      ],
      sentPerStep: {
        'step-1': 1
      },
      worker: {
        queueSize: 2,
        lastRunAt: '2025-01-01T00:05:00.000Z',
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      },
      meta: {
        summaryKeys: SUMMARY_KEYS,
        payloadHasReplyCount: true,
        aggregatedReplyCount: 1,
        repliedCount: 1
      }
  };

    mockedUseSequenceStatus.mockReturnValue({
      data: mockData,
      error: null,
      isLoading: false,
      isValidating: false,
      refresh: vi.fn()
    });

    render(<SequenceStatusView sequenceId="sequence-123" />);

    const enrolledContacts = screen.getByText('Enrolled contacts');
    expect(enrolledContacts).toBeInTheDocument();

    const skippedFilter = screen.getByRole('button', { name: 'Skipped' });
    expect(skippedFilter).toBeInTheDocument();

    const pendingLabels = screen.getAllByText('Pending');
    expect(pendingLabels.length).toBeGreaterThan(0);

    const skippedLabels = screen.getAllByText('Skipped');
    expect(skippedLabels.length).toBeGreaterThan(0);

    const pacingMessage = screen.getByText('Worker pacing enforces at least 7 minutes between sends.');
    expect(pacingMessage).toBeInTheDocument();

    const overrideMessage = screen.getByText('Sequence override set to 7 minutes (workspace default 5 minutes).');
    expect(overrideMessage).toBeInTheDocument();

    const perStep = screen.getByText('Per-step breakdown');
    const perStepSection = perStep.closest('div');
    expect(perStepSection).not.toBeNull();
    if (perStepSection) {
      const pendingCountText = within(perStepSection).getByText((content, node) => {
        if (!node?.textContent) {
          return false;
        }
        const normalized = node.textContent.replace(/\s+/g, ' ').trim();
        return normalized === 'Pending: 1';
      });
      expect(pendingCountText).toBeInTheDocument();

      const sentCountText = within(perStepSection).getByText((content, node) => {
        if (!node?.textContent) {
          return false;
        }
        const normalized = node.textContent.replace(/\s+/g, ' ').trim();
        return normalized === 'Sent: 1';
      });
      expect(sentCountText).toBeInTheDocument();

      const progressBar = within(perStepSection).getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '33');
    }
  });

  it('updates displayed counts after refresh/revalidation', async () => {
    const mockedUseSequenceStatus = vi.mocked(useSequenceStatus);

  const initialData: MockSequenceStatusResponse = {
      sequence: {
        id: 'sequence-123',
        name: 'Demo sequence',
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        launchAt: null,
        launchedAt: null,
        senderId: 99,
        sender: { id: 99, name: 'Primary sender', email: 'sender@example.com', status: 'verified' },
        minGapMinutes: 7
      },
      summary: {
        total: 3,
        pending: 1,
        sent: 1,
        replied: 1,
        replyCount: 1,
        bounced: 0,
        failed: 0,
        skipped: 0,
        lastActivity: '2025-01-01T00:01:00.000Z'
      },
      contacts: [],
      steps: [],
      sentPerStep: {},
      worker: { queueSize: 2, lastRunAt: '2025-01-01T00:05:00.000Z', lastFailureAt: null, lastError: null, minSendIntervalMinutes: 5 },
      meta: {
        summaryKeys: SUMMARY_KEYS,
        payloadHasReplyCount: true,
        aggregatedReplyCount: 1,
        repliedCount: 1
      }
  };

    const updatedData: MockSequenceStatusResponse = {
      ...initialData,
      summary: {
        ...initialData.summary,
        total: 4,
        pending: 2,
        sent: 1,
        replied: 1,
        replyCount: 1
      }
  };

    // function that will swap the mocked return value to the updated snapshot
    const performRefresh = async () => {
      mockedUseSequenceStatus.mockReturnValue({
        data: updatedData,
        error: null,
        isLoading: false,
        isValidating: false,
        refresh: async () => Promise.resolve()
      } as any);
      return Promise.resolve(undefined as any);
    };

    mockedUseSequenceStatus.mockReturnValue({
      data: initialData,
      error: null,
      isLoading: false,
      isValidating: false,
      refresh: performRefresh
    } as any);

    const { rerender } = render(<SequenceStatusView sequenceId="sequence-123" />);

    // initial expectation (UI renders without error)
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);

    // simulate a refresh/revalidation event
    await performRefresh();
    rerender(<SequenceStatusView sequenceId="sequence-123" />);

    // now the UI should reflect updated totals; the updated total (4) should be present
    expect(screen.queryAllByText('4').length).toBeGreaterThan(0);
  });

  it('updates status counts after refresh revalidation', async () => {
  const initialData: MockSequenceStatusResponse = {
      sequence: {
        id: 'sequence-123',
        name: 'Demo sequence',
        status: 'active' as const,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        launchAt: null,
        launchedAt: '2025-01-01T00:05:00.000Z',
        senderId: 12,
        sender: {
          id: 12,
          name: 'Primary sender',
          email: 'sender@example.com',
          status: 'verified'
        },
        minGapMinutes: 5
      },
      summary: {
        total: 3,
        pending: 2,
        sent: 1,
        replied: 0,
        replyCount: 0,
        bounced: 0,
        failed: 0,
        skipped: 0,
        lastActivity: '2025-01-01T00:00:00.000Z'
      } as SequenceStatusSummary,
      contacts: [] as SequenceContactStatus[],
      steps: [
        {
          stepId: 'step-1',
          order: 1,
          subject: 'Intro',
          pending: 2,
          sent: 1,
          replied: 0,
          bounced: 0,
          failed: 0,
          skipped: 0
        }
      ] as SequenceStepSummary[],
      sentPerStep: {
        'step-1': 1
      },
      worker: {
        queueSize: 1,
        lastRunAt: '2025-01-01T00:05:00.000Z',
        lastFailureAt: null,
        lastError: null,
        minSendIntervalMinutes: 5
      },
      meta: {
        summaryKeys: SUMMARY_KEYS,
        payloadHasReplyCount: true,
        aggregatedReplyCount: 0,
        repliedCount: 0
      }
    };

    const refreshedSummary: SequenceStatusSummary = {
      ...initialData.summary,
      pending: 1,
      sent: 1,
      replied: 1,
      replyCount: 1,
      lastActivity: '2025-01-01T00:10:00.000Z'
    };

  let currentData: MockSequenceStatusResponse = initialData;
    const refreshMock = vi.fn().mockImplementation(async () => {
      currentData = {
        ...currentData,
        summary: refreshedSummary,
        steps: currentData.steps.map((step) =>
          step.stepId === 'step-1'
            ? { ...step, pending: 1, replied: 1 }
            : step
        ),
        meta: {
          summaryKeys: SUMMARY_KEYS,
          payloadHasReplyCount: true,
          aggregatedReplyCount: refreshedSummary.replyCount ?? 0,
          repliedCount: refreshedSummary.replied
        }
      };
    });

    mockedUseSequenceStatus.mockImplementation(() => ({
      data: currentData,
      error: null,
      isLoading: false,
      isValidating: false,
      refresh: refreshMock
    }));

    const { rerender } = render(<SequenceStatusView sequenceId="sequence-123" />);

    const getStatusCardCount = (label: string) => {
      const labelNode = screen
        .getAllByText(label)
        .find((node) => node.tagName.toLowerCase() === 'p' && Boolean(node.nextElementSibling));
      if (!labelNode?.nextElementSibling) {
        throw new Error(`Count element for ${label} not found`);
      }
      return labelNode.nextElementSibling.textContent;
    };

    expect(getStatusCardCount('Pending')).toBe('2');
    expect(getStatusCardCount('Replied')).toBe('0');

    const refreshButtons = screen.getAllByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshButtons[0]);

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mutateSpy).toHaveBeenCalledWith('/api/sequences/status/sequence-123', undefined, {
        revalidate: true
      });
    });

    await waitFor(() => {
      expect(mutateSpy).toHaveBeenCalledWith('/api/sequences/replies/sequence-123', undefined, {
        revalidate: true
      });
    });

    const refreshResult = refreshMock.mock.results[0]?.value;
    if (refreshResult instanceof Promise) {
      await refreshResult;
    }

    rerender(<SequenceStatusView sequenceId="sequence-123" />);

    expect(getStatusCardCount('Pending')).toBe('1');
    expect(getStatusCardCount('Replied')).toBe('1');
  });
});
