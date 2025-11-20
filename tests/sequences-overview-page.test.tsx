/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const dbMocks = vi.hoisted(() => ({
  getTeamForUser: vi.fn(),
  listSequencesForTeam: vi.fn()
}));

vi.mock('@/lib/db/queries', () => ({
  getTeamForUser: dbMocks.getTeamForUser,
  listSequencesForTeam: dbMocks.listSequencesForTeam
}));

import SequencesPage from '@/app/(dashboard)/sequences/page';

describe('SequencesPage overview', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    dbMocks.getTeamForUser.mockResolvedValue({ id: 'team-123' });
    dbMocks.listSequencesForTeam.mockResolvedValue([
      {
        id: 'seq-1',
        name: 'Initial Outreach',
        status: 'draft',
        createdAt: new Date('2025-10-22T10:00:00Z'),
        updatedAt: new Date('2025-10-23T10:00:00Z'),
        launchAt: null,
        launchedAt: null,
        senderId: null,
        sender: null,
        stepCount: 3,
        stepSendSummary: [],
        sentPerStep: {}
      }
    ] as any);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ sequences: [] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    dbMocks.getTeamForUser.mockReset();
    dbMocks.listSequencesForTeam.mockReset();
  });

  it('renders list and create CTA without builder', async () => {
    const page = await SequencesPage();
    render(page);

    expect(screen.getByRole('heading', { name: 'Sequences' })).toBeInTheDocument();

  const createLink = screen.getByRole('link', { name: /Create a new sequence/i });
    expect(createLink).toHaveAttribute('href', '/sequences/create');

    expect(screen.getByText('Initial Outreach')).toBeInTheDocument();
    expect(screen.queryByText(/Sequence setup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sequence steps/i)).not.toBeInTheDocument();
  });
});
