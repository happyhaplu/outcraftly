/* @vitest-environment jsdom */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';

import { SequenceList } from '@/app/(dashboard)/sequences/SequenceList';
import type { SequenceSummary, SequenceSchedulePreferences } from '@/app/(dashboard)/sequences/types';

const baseSchedule: SequenceSchedulePreferences = {
  mode: 'immediate',
  sendTime: null,
  sendWindowStart: null,
  sendWindowEnd: null,
  respectContactTimezone: true,
  fallbackTimezone: null,
  timezone: null,
  sendDays: null,
  sendWindows: null
};

const sampleSequence: SequenceSummary = {
  id: 'seq-123',
  name: 'Warm leads',
  status: 'active' as const,
  createdAt: '2025-10-20T12:00:00.000Z',
  updatedAt: '2025-10-23T08:00:00.000Z',
  launchAt: null,
  launchedAt: '2025-10-22T09:00:00.000Z',
  deletedAt: null,
  senderId: null,
  sender: null,
  stepCount: 4,
  stepSendSummary: [
    { id: 'step-1', order: 1, subject: 'Intro', sent: 18 },
    { id: 'step-2', order: 2, subject: 'Follow up', sent: 11 }
  ],
  sentPerStep: {
    'step-1': 18,
    'step-2': 11
  },
  tracking: {
    trackOpens: true,
    trackClicks: true,
    enableUnsubscribe: true
  },
  schedule: baseSchedule,
  stopCondition: 'manual' as const,
  stopOnBounce: false,
  minGapMinutes: null,
  replyCount: 5,
  hasMissingMetadata: false
};

const scheduledSequence: SequenceSummary = {
  id: 'seq-456',
  name: 'Follow-up',
  status: 'draft' as const,
  createdAt: '2025-10-21T10:00:00.000Z',
  updatedAt: '2025-10-23T09:00:00.000Z',
  launchAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  launchedAt: null,
  deletedAt: null,
  senderId: null,
  sender: null,
  stepCount: 2,
  stepSendSummary: [
    { id: 'step-7', order: 1, subject: 'Check-in', sent: 0 },
    { id: 'step-8', order: 2, subject: 'Reminder', sent: 0 }
  ],
  sentPerStep: {
    'step-7': 0,
    'step-8': 0
  },
  tracking: {
    trackOpens: true,
    trackClicks: false,
    enableUnsubscribe: true
  },
  schedule: {
    mode: 'fixed' as const,
    sendTime: '10:00',
    sendWindowStart: null,
    sendWindowEnd: null,
    respectContactTimezone: true,
    fallbackTimezone: 'America/New_York',
    timezone: 'America/New_York',
    sendDays: ['Mon', 'Wed'],
    sendWindows: null
  },
  stopCondition: 'on_reply' as const,
  stopOnBounce: true,
  minGapMinutes: 30,
  replyCount: 0,
  hasMissingMetadata: false
};

const deletedSequence: SequenceSummary = {
  ...sampleSequence,
  id: 'seq-789',
  name: 'Archived sequence',
  deletedAt: '2025-10-01T00:00:00.000Z'
};

function renderSequenceList(sequences: SequenceSummary[] = [sampleSequence]) {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SequenceList sequences={sequences} isLoading={false} />
    </SWRConfig>
  );
}

function renderScheduledSequence() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SequenceList sequences={[scheduledSequence]} isLoading={false} />
    </SWRConfig>
  );
}

describe('Sequence navigation actions', () => {
  it('links Create Sequence to the builder route', () => {
    renderSequenceList();
    const createLink = screen.getByRole('link', { name: /Create a new sequence/i });
    expect(createLink).toHaveAttribute('href', '/sequences/create');
  });

  it('links Edit action to the dedicated edit route', () => {
    renderSequenceList();
    const editLink = screen.getByRole('link', { name: 'Edit Warm leads' });
    expect(editLink).toHaveAttribute('href', '/sequences/seq-123/edit');
  });

  it('renders a scheduled launch badge for draft sequences', () => {
    renderScheduledSequence();
    const badge = screen.getByText((content) => content.startsWith('Scheduled for'));
    expect(badge).toBeInTheDocument();
  });

  it('displays per-step sent counters in the overview list', () => {
    renderSequenceList();
    const container = screen.getByLabelText('Sent emails per step for Warm leads');
    expect(container).toBeInTheDocument();
    expect(within(container).getByText('Step 1')).toBeInTheDocument();
    expect(within(container).getByText('18 sent')).toBeInTheDocument();
  });

  it('does not render sequences flagged as deleted', () => {
    renderSequenceList([sampleSequence, deletedSequence]);
    expect(screen.getByText('Warm leads')).toBeInTheDocument();
    expect(screen.queryByText('Archived sequence')).not.toBeInTheDocument();
  });
});
