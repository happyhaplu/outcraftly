import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SequenceStatusView } from '../SequenceStatusView';
import type { SequenceContactStatus, SequenceStepSummary, SequenceStatusSummary, SequenceWorkerSnapshot } from '../types';

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

describe('SequenceStatusView', () => {
  it('renders summary cards, filters, and per-step breakdown', () => {
    const mockData: {
      summary: SequenceStatusSummary;
      contacts: SequenceContactStatus[];
      steps: SequenceStepSummary[];
      worker: SequenceWorkerSnapshot;
    } = {
      summary: {
        total: 3,
        pending: 1,
        sent: 1,
        replied: 1,
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
          status: 'pending',
          lastUpdated: '2025-01-01T00:00:00.000Z',
          stepOrder: 1,
          stepSubject: 'Intro',
          scheduledAt: '2025-01-01T00:00:00.000Z',
          sentAt: null,
          attempts: 0,
          replyAt: null,
          bounceAt: null,
          skippedAt: null
        }
      ],
      steps: [
  { stepId: 'step-1', order: 1, subject: 'Intro', pending: 1, sent: 0, replied: 0, bounced: 0, failed: 0, skipped: 0 }
      ],
      worker: {
        queueSize: 2,
        lastRunAt: '2025-01-01T00:05:00.000Z',
        lastFailureAt: null,
        lastError: null
      }
    } as const;

    const mockedUseSequenceStatus = vi.mocked(useSequenceStatus);
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
    }
  });
});
