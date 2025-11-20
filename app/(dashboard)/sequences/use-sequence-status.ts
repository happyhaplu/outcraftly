import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import type {
  SequenceContactStatus,
  SequenceLifecycleSnapshot,
  SequenceStatusSummary,
  SequenceStepSummary,
  SequenceSentPerStep,
  SequenceWorkerSnapshot,
  SequenceSender,
  SequenceLifecycleStatus,
  SequenceStatusSummaryMeta
} from './types';

const DEFAULT_MIN_SEND_INTERVAL_MINUTES = 5;

type SequenceStatusResponse = {
  sequence: SequenceLifecycleSnapshot | null;
  summary: SequenceStatusSummary;
  contacts: SequenceContactStatus[];
  steps: SequenceStepSummary[];
  sentPerStep: SequenceSentPerStep;
  worker: SequenceWorkerSnapshot;
  meta: SequenceStatusSummaryMeta | null;
};

const debugSequenceStatus = (...messages: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[useSequenceStatus]', ...messages);
  }
};

const normaliseOptionalIso = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const normaliseSender = (raw: any): SequenceSender | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = typeof raw.id === 'number' ? raw.id : null;
  if (id == null) {
    debugSequenceStatus('sender missing id', { raw });
    return null;
  }
  const nameMissing = typeof raw.name !== 'string';
  const emailMissing = typeof raw.email !== 'string';
  const statusMissing = typeof raw.status !== 'string';
  if (nameMissing || emailMissing || statusMissing) {
    debugSequenceStatus('sender fields missing', {
      id,
      nameMissing,
      emailMissing,
      statusMissing,
      raw
    });
  }
  const name = !nameMissing ? (raw.name as string) : 'Unknown sender';
  const email = !emailMissing ? (raw.email as string) : '';
  const status = !statusMissing ? (raw.status as string) : 'inactive';
  return {
    id,
    name,
    email,
    status
  };
};

const normaliseLifecycleStatus = (status: unknown): SequenceLifecycleStatus => {
  if (status === 'paused') {
    return 'paused';
  }
  if (status === 'draft') {
    return 'draft';
  }
  return 'active';
};

const normaliseSentPerStep = (raw: unknown): SequenceSentPerStep => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === 'string' && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      result[key] = value;
    }
  }

  return result;
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

  if (process.env.NODE_ENV !== 'production') {
    console.groupCollapsed('[useSequenceStatus] payload', url);
    console.log('raw', payload);
    console.groupEnd();
  }
  const summary = payload.summary as SequenceStatusSummary | undefined;
  const summaryKeys: readonly string[] | undefined = Array.isArray(payload.summaryKeys)
    ? (payload.summaryKeys as string[])
    : Array.isArray((payload.meta as any)?.summaryKeys)
      ? ((payload.meta as any).summaryKeys as string[])
      : undefined;
  const metaPayload = payload.meta as Partial<SequenceStatusSummaryMeta> | undefined;
  const contacts = Array.isArray(payload.contacts) ? (payload.contacts as SequenceContactStatus[]) : [];
  const steps = Array.isArray(payload.steps) ? (payload.steps as SequenceStepSummary[]) : [];
  const sentPerStep = normaliseSentPerStep(payload.sentPerStep);

  const workerPayload = (payload.worker as Partial<SequenceWorkerSnapshot> | undefined) ?? {};
  const worker: SequenceWorkerSnapshot = {
    queueSize: typeof workerPayload.queueSize === 'number' ? workerPayload.queueSize : 0,
    lastRunAt: normaliseOptionalIso((workerPayload as any).lastRunAt),
    lastFailureAt: normaliseOptionalIso((workerPayload as any).lastFailureAt),
    lastError: typeof workerPayload.lastError === 'string' ? workerPayload.lastError : null,
    minSendIntervalMinutes:
      typeof workerPayload.minSendIntervalMinutes === 'number'
        ? workerPayload.minSendIntervalMinutes
        : DEFAULT_MIN_SEND_INTERVAL_MINUTES
  };

  const sequencePayload = payload.sequence as Partial<SequenceLifecycleSnapshot> | undefined;
  const missingCreatedAt = Boolean(sequencePayload) && typeof sequencePayload?.createdAt !== 'string';
  const missingUpdatedAt = Boolean(sequencePayload) && typeof sequencePayload?.updatedAt !== 'string';

  const sequence: SequenceLifecycleSnapshot | null = sequencePayload
    ? {
        id: typeof sequencePayload.id === 'string' ? sequencePayload.id : '',
        name: typeof sequencePayload.name === 'string' ? sequencePayload.name : '',
        status: normaliseLifecycleStatus(sequencePayload.status),
        createdAt: typeof sequencePayload.createdAt === 'string' ? sequencePayload.createdAt : null,
        updatedAt: typeof sequencePayload.updatedAt === 'string' ? sequencePayload.updatedAt : null,
        launchAt: normaliseOptionalIso((sequencePayload as any).launchAt),
        launchedAt: normaliseOptionalIso((sequencePayload as any).launchedAt),
        senderId: typeof sequencePayload.senderId === 'number' ? sequencePayload.senderId : null,
        sender: normaliseSender((payload.sequence as any)?.sender ?? sequencePayload.sender),
        minGapMinutes:
          typeof (sequencePayload as any)?.minGapMinutes === 'number'
            ? (sequencePayload as any).minGapMinutes
            : null,
        hasMissingMetadata:
          typeof (sequencePayload as any)?.hasMissingMetadata === 'boolean'
            ? (sequencePayload as any).hasMissingMetadata
            : undefined
      }
    : null;

  const ensureNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

  // Prefer an explicit replyCount from the payload.summary, but fall back to
  // payload.meta.aggregatedReplyCount when the API provides the computed value
  // there (this happens when replies are inferred from delivery logs and the
  // raw summary.replyCount may be unavailable).
  const resolvedReplyCount = (() => {
    if (summary && typeof summary.replyCount === 'number' && Number.isFinite(summary.replyCount)) {
      return summary.replyCount;
    }
    if (metaPayload && typeof metaPayload.aggregatedReplyCount === 'number' && Number.isFinite(metaPayload.aggregatedReplyCount)) {
      return metaPayload.aggregatedReplyCount;
    }
    // otherwise, default to zero
    return 0;
  })();

  const safeSummary: SequenceStatusSummary = summary
    ? {
        total: ensureNumber(summary.total),
        pending: ensureNumber(summary.pending),
        sent: ensureNumber(summary.sent),
        replied: ensureNumber(summary.replied),
        replyCount: resolvedReplyCount,
        bounced: ensureNumber(summary.bounced),
        failed: ensureNumber(summary.failed),
        skipped: ensureNumber(summary.skipped),
        lastActivity: typeof summary.lastActivity === 'string' ? summary.lastActivity : null
      }
    : {
        total: 0,
        pending: 0,
        sent: 0,
        replied: 0,
        replyCount: 0,
        bounced: 0,
        failed: 0,
        skipped: 0,
        lastActivity: null
      };

  const meta: SequenceStatusSummaryMeta | null = metaPayload
    ? {
        summaryKeys: Array.isArray(metaPayload.summaryKeys) && metaPayload.summaryKeys.length > 0 ? metaPayload.summaryKeys : summaryKeys ?? [],
        payloadHasReplyCount: metaPayload.payloadHasReplyCount !== false,
        aggregatedReplyCount: ensureNumber(metaPayload.aggregatedReplyCount),
        repliedCount: ensureNumber(metaPayload.repliedCount)
      }
    : summaryKeys
      ? {
          summaryKeys,
          payloadHasReplyCount: true,
          aggregatedReplyCount: safeSummary.replyCount ?? 0,
          repliedCount: safeSummary.replied
        }
      : null;

  if (sequence && (missingCreatedAt || missingUpdatedAt)) {
    debugSequenceStatus('sequence missing timestamps', {
      sequenceId: sequence.id,
      missingCreatedAt,
      missingUpdatedAt,
      raw: sequencePayload
    });
  }

  const normalized: SequenceStatusResponse = {
    sequence,
    summary: safeSummary,
    contacts,
    steps,
    sentPerStep,
    worker,
    meta
  };

  if (process.env.NODE_ENV !== 'production') {
    console.groupCollapsed('[useSequenceStatus] normalized', url);
    console.log('summary', normalized.summary);
    console.log('sentPerStep', normalized.sentPerStep);
    // dev logging to compare raw vs normalized replyCount
    try {
      const rawReply = (payload.summary as any)?.replyCount;
      const normReply = (normalized.summary as any)?.replyCount;
      console.log('[useSequenceStatus] replyCount raw vs normalized', { raw: rawReply, normalized: normReply });
    } catch (_e) {
      // ignore
    }
    console.groupEnd();
  }

  return normalized;
};

export function useSequenceStatus(sequenceId: string | null) {
  const swrKey = sequenceId ? `/api/sequences/status/${sequenceId}` : null;
  const { mutate: mutateCache } = useSWRConfig();

  const { data, error, isValidating, mutate } = useSWR<SequenceStatusResponse>(swrKey, fetchStatuses, {
    revalidateOnFocus: true,
    refreshInterval: sequenceId ? 15000 : 0
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
