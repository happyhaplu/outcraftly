import useSWR from 'swr';

import type {
  SequenceContactStatus,
  SequenceLifecycleSnapshot,
  SequenceStatusSummary,
  SequenceStepSummary,
  SequenceWorkerSnapshot,
  SequenceSender
} from './types';

type SequenceStatusResponse = {
  sequence: SequenceLifecycleSnapshot | null;
  summary: SequenceStatusSummary;
  contacts: SequenceContactStatus[];
  steps: SequenceStepSummary[];
  worker: SequenceWorkerSnapshot;
};

const normaliseSender = (raw: any): SequenceSender | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = typeof raw.id === 'number' ? raw.id : null;
  if (id == null) {
    return null;
  }
  const name = typeof raw.name === 'string' ? raw.name : 'Unknown sender';
  const email = typeof raw.email === 'string' ? raw.email : '';
  const status = typeof raw.status === 'string' ? raw.status : 'inactive';
  return {
    id,
    name,
    email,
    status
  };
};

const fetchStatuses = async (url: string): Promise<SequenceStatusResponse> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) {
    throw new Error('Sequence not found');
  }
  if (!response.ok) {
    throw new Error('Failed to load status');
  }

  const payload = await response.json();
  const summary = payload.summary as SequenceStatusSummary | undefined;
  const contacts = Array.isArray(payload.contacts) ? (payload.contacts as SequenceContactStatus[]) : [];
  const steps = Array.isArray(payload.steps) ? (payload.steps as SequenceStepSummary[]) : [];

  const worker = (payload.worker as SequenceWorkerSnapshot | undefined) ?? {
    queueSize: 0,
    lastRunAt: null,
    lastFailureAt: null,
    lastError: null
  };

  const sequencePayload = payload.sequence as Partial<SequenceLifecycleSnapshot> | undefined;
  const sequence: SequenceLifecycleSnapshot | null = sequencePayload
    ? {
        id: typeof sequencePayload.id === 'string' ? sequencePayload.id : '',
        name: typeof sequencePayload.name === 'string' ? sequencePayload.name : '',
        status: sequencePayload.status === 'paused' ? 'paused' : 'active',
        createdAt:
          typeof sequencePayload.createdAt === 'string'
            ? sequencePayload.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof sequencePayload.updatedAt === 'string'
            ? sequencePayload.updatedAt
            : new Date().toISOString(),
        senderId: typeof sequencePayload.senderId === 'number' ? sequencePayload.senderId : null,
        sender: normaliseSender((payload.sequence as any)?.sender ?? sequencePayload.sender)
      }
    : null;

  const safeSummary = summary
    ? {
        ...summary,
        skipped: typeof summary.skipped === 'number' ? summary.skipped : 0
      }
    : {
        total: 0,
        pending: 0,
        sent: 0,
        replied: 0,
        bounced: 0,
        failed: 0,
        skipped: 0,
        lastActivity: null
      };

  return {
    sequence,
    summary: safeSummary,
    contacts,
    steps,
    worker
  };
};

export function useSequenceStatus(sequenceId: string | null) {
  const swrKey = sequenceId ? `/api/sequences/status/${sequenceId}` : null;

  const { data, error, isValidating, mutate } = useSWR<SequenceStatusResponse>(swrKey, fetchStatuses, {
    revalidateOnFocus: false,
    refreshInterval: sequenceId ? 15000 : 0
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
