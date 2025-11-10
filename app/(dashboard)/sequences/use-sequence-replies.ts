import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';

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

  if (process.env.NODE_ENV !== 'production') {
    console.groupCollapsed('[useSequenceReplies] payload', url);
    console.log('raw', payload);
    console.groupEnd();
  }

  const replies = Array.isArray(payload.replies) ? (payload.replies as SequenceReplyActivity[]) : [];
  const bounces = Array.isArray(payload.bounces) ? (payload.bounces as SequenceBounceActivity[]) : [];

  const normalized = {
    replies,
    bounces
  };

  if (process.env.NODE_ENV !== 'production') {
    console.groupCollapsed('[useSequenceReplies] normalized', url);
    console.log('replies', normalized.replies.length);
    console.log('bounces', normalized.bounces.length);
    console.groupEnd();
  }

  return normalized;
};

export function useSequenceReplies(sequenceId: string | null) {
  const swrKey = sequenceId ? `/api/sequences/replies/${sequenceId}` : null;
  const { mutate: mutateCache } = useSWRConfig();

  const { data, error, isValidating, mutate } = useSWR<SequenceRepliesResponse>(swrKey, fetchReplies, {
    revalidateOnFocus: true,
    refreshInterval: sequenceId ? 20000 : 0
  });

  const isLoading = Boolean(swrKey) && !data && !error;

  const refresh = useCallback(async () => {
    if (!swrKey) {
      return;
    }

    await Promise.allSettled([
      mutate(undefined, { revalidate: true }),
      mutateCache(swrKey, undefined, { revalidate: true })
    ]);
  }, [mutate, mutateCache, swrKey]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    refresh
  } as const;
}
