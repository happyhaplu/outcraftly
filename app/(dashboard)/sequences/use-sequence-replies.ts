import useSWR from 'swr';

import type { SequenceBounceActivity, SequenceReplyActivity } from './types';

type SequenceRepliesResponse = {
  replies: SequenceReplyActivity[];
  bounces: SequenceBounceActivity[];
};

const fetchReplies = async (url: string): Promise<SequenceRepliesResponse> => {
  const response = await fetch(url, { cache: 'no-store' });

  if (response.status === 404) {
    throw new Error('Sequence not found');
  }

  if (!response.ok) {
    throw new Error('Failed to load sequence engagement');
  }

  const payload = await response.json().catch(() => ({}));

  const replies = Array.isArray(payload.replies) ? (payload.replies as SequenceReplyActivity[]) : [];
  const bounces = Array.isArray(payload.bounces) ? (payload.bounces as SequenceBounceActivity[]) : [];

  return {
    replies,
    bounces
  };
};

export function useSequenceReplies(sequenceId: string | null) {
  const swrKey = sequenceId ? `/api/sequences/replies/${sequenceId}` : null;

  const { data, error, isValidating, mutate } = useSWR<SequenceRepliesResponse>(swrKey, fetchReplies, {
    revalidateOnFocus: false,
    refreshInterval: sequenceId ? 20000 : 0
  });

  const isLoading = Boolean(swrKey) && !data && !error;

  return {
    data,
    error,
    isLoading,
    isValidating,
    refresh: () => mutate(undefined, { revalidate: true })
  } as const;
}
