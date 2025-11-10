'use client';

import useSWR from 'swr';

import { mapSequenceSummary } from '@/lib/sequences/utils';

import { SequenceList } from './SequenceList';
import type { SequenceSummary } from './types';

const listFetcher = async (url: string): Promise<SequenceSummary[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load sequences');
  }
  const payload = await response.json();
  const sequences = Array.isArray(payload.sequences) ? payload.sequences : [];
  return sequences
    .map(mapSequenceSummary)
    .filter((sequence: SequenceSummary) => !sequence.deletedAt);
};

type SequenceOverviewProps = {
  initialSequences: SequenceSummary[];
};

export function SequenceOverview({ initialSequences }: SequenceOverviewProps) {
  const { data: sequences = initialSequences, isValidating } = useSWR<SequenceSummary[]>(
    '/api/sequences/list',
    listFetcher,
    {
      fallbackData: initialSequences
    }
  );

  const showLoadingState = isValidating && sequences.length === 0;

  return <SequenceList sequences={sequences} isLoading={showLoadingState} />;
}
