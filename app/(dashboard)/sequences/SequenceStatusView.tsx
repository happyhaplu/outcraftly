"use client";

import { useCallback, useMemo, useState, useEffect, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { AlertCircle, AlertTriangle, CheckCircle2, Inbox, Loader2, PauseCircle, PlayCircle, RefreshCcw, Reply, Send, Timer, Users, XCircle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

import { SequenceStatusBadge } from './SequenceStatusBadge';
import { SequenceLifecycleBadge } from './SequenceLifecycleBadge';
import { useSequenceStatus } from './use-sequence-status';
import type {
  SequenceContactStatus,
  SequenceDeliveryStatus,
  SequenceLifecycleSnapshot,
  SequenceStatusSummary
} from './types';
import { SequenceEnrollDialog } from './SequenceEnrollDialog';
import { SequenceEngagementPanel } from './SequenceEngagementPanel';
import { SequenceDeliveryLogsPanel } from './SequenceDeliveryLogsPanel';

const STATUS_FILTERS: Array<{ value: SequenceDeliveryStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' }
];

const STATUS_ICONS: Record<SequenceDeliveryStatus, typeof Send> = {
  pending: Timer,
  sent: Send,
  replied: Reply,
  bounced: XCircle,
  failed: AlertTriangle,
  skipped: AlertCircle
};

const STATUS_COLORS: Record<SequenceDeliveryStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  sent: 'bg-sky-500/10 text-sky-600',
  replied: 'bg-emerald-500/10 text-emerald-600',
  bounced: 'bg-rose-500/10 text-rose-600',
  failed: 'bg-red-500/10 text-red-600',
  skipped: 'bg-slate-500/10 text-slate-600'
};

const launchToneClasses = {
  scheduled: 'border-sky-400/60 bg-sky-500/10 text-sky-700',
  launched: 'border-emerald-400/60 bg-emerald-500/10 text-emerald-700',
  paused: 'border-amber-400/70 bg-amber-500/15 text-amber-800'
} as const;

const DEFAULT_MIN_SEND_INTERVAL_MINUTES = 5;

type SequenceStatusViewProps = {
  sequenceId: string;
};

const DEFAULT_DATE_LOCALE = 'en-US';
const DEFAULT_TIMEZONE = 'UTC';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat(DEFAULT_DATE_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DEFAULT_TIMEZONE
  }).format(date);
}

function formatDateTimeWithTime(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(DEFAULT_DATE_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DEFAULT_TIMEZONE
  }).format(parsed);
}

function formatRelativeToNow(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return 'just now';
  }
  if (Math.abs(diffMinutes) < 60) {
    const minutes = Math.abs(diffMinutes);
    return diffMinutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'} ago` : `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    const hours = Math.abs(diffHours);
    return diffHours > 0 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : `in ${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    const days = Math.abs(diffDays);
    return diffDays > 0 ? `${days} day${days === 1 ? '' : 's'} ago` : `in ${days} day${days === 1 ? '' : 's'}`;
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    const months = Math.abs(diffMonths);
    return diffMonths > 0 ? `${months} month${months === 1 ? '' : 's'} ago` : `in ${months} month${months === 1 ? '' : 's'}`;
  }

  const diffYears = Math.round(diffMonths / 12);
  const years = Math.abs(diffYears);
  return diffYears > 0 ? `${years} year${years === 1 ? '' : 's'} ago` : `in ${years} year${years === 1 ? '' : 's'}`;
}

function buildDisplayName(contact: SequenceContactStatus) {
  const name = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return name.length > 0 ? name : contact.email;
}

function determineScheduleZone(contact: SequenceContactStatus): string | undefined {
  if (contact.scheduleMode) {
    if (contact.scheduleRespectTimezone && contact.timezone) {
      return contact.timezone;
    }
    return contact.scheduleFallbackTimezone ?? undefined;
  }

  return contact.timezone ?? undefined;
}

function formatScheduledDate(contact: SequenceContactStatus) {
  if (!contact.scheduledAt) {
    return '—';
  }

  const zone = determineScheduleZone(contact);
  const options: Intl.DateTimeFormatOptions = zone
    ? {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: zone
      }
    : {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: DEFAULT_TIMEZONE
      };

  try {
    return new Intl.DateTimeFormat(DEFAULT_DATE_LOCALE, options).format(new Date(contact.scheduledAt));
  } catch (error) {
    console.warn('Unable to format scheduled date for contact', contact.id, error);
    return formatDateTime(contact.scheduledAt);
  }
}

function buildScheduleFootnote(contact: SequenceContactStatus): string | null {
  if (!contact.scheduleMode) {
    return null;
  }

  const modeLabel = contact.scheduleMode === 'fixed' ? 'Fixed time' : 'Time window';

  if (contact.scheduleRespectTimezone) {
    if (contact.timezone) {
      return `${modeLabel} · Local (${contact.timezone})`;
    }
    const fallback = contact.scheduleFallbackTimezone ?? 'UTC';
    return `${modeLabel} · Fallback (${fallback})`;
  }

  const fallback = contact.scheduleFallbackTimezone ?? 'UTC';
  return `${modeLabel} · ${fallback}`;
}

function getStatusCount(summary: SequenceStatusSummary, status: SequenceDeliveryStatus): number {
  if (status === 'pending') {
    return summary.pending;
  }
  if (status === 'sent') {
    return summary.sent;
  }
  if (status === 'replied') {
    return typeof summary.replyCount === 'number' && Number.isFinite(summary.replyCount)
      ? summary.replyCount
      : summary.replied;
  }
  if (status === 'bounced') {
    return summary.bounced;
  }
  if (status === 'skipped') {
    return summary.skipped;
  }
  return summary.failed;
}

function formatMinutesLabel(value: number): string {
  return `${value} minute${value === 1 ? '' : 's'}`;
}

export function SequenceStatusView({ sequenceId }: SequenceStatusViewProps) {
  const { data, error, isLoading, isValidating, refresh } = useSequenceStatus(sequenceId);
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [filter, setFilter] = useState<'all' | SequenceDeliveryStatus>('all');
  const [isEnrollOpen, setEnrollOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview');
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState<'pause' | 'resume' | null>(null);
  const [isLifecycleUpdating, setLifecycleUpdating] = useState(false);
  const [manualSendTarget, setManualSendTarget] = useState<SequenceContactStatus | null>(null);
  const [isManualSendPending, setManualSendPending] = useState(false);

  const revalidateSequenceData = useCallback(
    async (options?: { includeLogs?: boolean }) => {
      if (!sequenceId) {
        return;
      }

      const tasks: Array<Promise<unknown>> = [
        refresh(),
        mutate(`/api/sequences/status/${sequenceId}`, undefined, { revalidate: true }),
        mutate(`/api/sequences/replies/${sequenceId}`, undefined, { revalidate: true })
      ];

      if (options?.includeLogs) {
        tasks.push(
          mutate(
            (key) => typeof key === 'string' && key.startsWith(`/api/sequences/logs/${sequenceId}`),
            undefined,
            { revalidate: true }
          )
        );
      }

      await Promise.allSettled(tasks);
    },
    [mutate, refresh, sequenceId]
  );

  // Track whether the component is mounted on the client to avoid rendering
  // relative-time strings during SSR; this replaces the previously missing
  // `mounted` identifier.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed('[SequenceStatusView] snapshot', sequenceId);
        console.log('loading', { isLoading, isValidating, error: error?.message ?? null });
        console.log('summary', {
          total: data?.summary?.total ?? null,
          replied: data?.summary?.replied ?? null,
          pending: data?.summary?.pending ?? null,
          sent: data?.summary?.sent ?? null,
          replyCount: (data?.summary as any)?.replyCount ?? null
        });
        console.log('contacts', data?.contacts?.length ?? null);
        console.log('workerQueueSize', data?.worker?.queueSize ?? null);
        // additional dev grouping: compare sent vs replied counts
        try {
          console.groupCollapsed('sent vs replied');
          console.log('sent', data?.summary?.sent ?? null);
          console.log('replied (raw)', (data?.summary as any)?.replyCount ?? null);
          console.log('replied (agg)', data?.summary?.replied ?? null);
          const normalizedReply = typeof data?.summary?.replyCount === 'number' ? data.summary.replyCount : null;
          console.log('replied (normalized)', normalizedReply);
          console.groupEnd();
        } catch (e) {
          // ignore
        }
        console.groupEnd?.();
      } else {
        console.log('[SequenceStatusView] snapshot', {
          sequenceId,
          isLoading,
          isValidating,
          error: error?.message ?? null,
          summary: data?.summary,
          contacts: data?.contacts?.length ?? null,
          workerQueueSize: data?.worker?.queueSize ?? null
        });
      }
    }
  }, [sequenceId, data?.summary, data?.contacts, data?.worker, error, isLoading, isValidating]);

  const lifecycle: SequenceLifecycleSnapshot | null = data?.sequence ?? null;
  const lifecycleStatus = lifecycle?.status ?? 'active';
  const isDraft = lifecycleStatus === 'draft';
  const isPaused = lifecycleStatus === 'paused';
  const isActive = lifecycleStatus === 'active';

  const contacts = data?.contacts ?? [];
  const steps = data?.steps ?? [];
  const sentPerStep = data?.sentPerStep ?? {};
  const worker = data?.worker ?? {
    queueSize: 0,
    lastRunAt: null,
    lastFailureAt: null,
    lastError: null,
    minSendIntervalMinutes: DEFAULT_MIN_SEND_INTERVAL_MINUTES
  };

  const effectiveMinGapMinutes =
    lifecycle?.minGapMinutes != null
      ? lifecycle.minGapMinutes
      : typeof worker.minSendIntervalMinutes === 'number'
        ? worker.minSendIntervalMinutes
        : DEFAULT_MIN_SEND_INTERVAL_MINUTES;
  const effectiveMinGapLabel = formatMinutesLabel(effectiveMinGapMinutes);
  const sequenceOverrideLabel =
    lifecycle?.minGapMinutes != null ? formatMinutesLabel(lifecycle.minGapMinutes) : null;
  const workspaceDefaultLabel = formatMinutesLabel(DEFAULT_MIN_SEND_INTERVAL_MINUTES);

  const filteredContacts = useMemo(() => {
    if (filter === 'all') {
      return contacts;
    }
    return contacts.filter((contact) => contact.status === filter);
  }, [contacts, filter]);

  const deliverySummary: SequenceStatusSummary = data?.summary ?? {
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

  const expectedSummaryKeys = data?.meta?.summaryKeys ?? ['total', 'pending', 'sent', 'replied', 'replyCount', 'bounced', 'failed', 'skipped', 'lastActivity'];
  const missingSummaryKeys = expectedSummaryKeys.filter((key) => !(key in (deliverySummary as Record<string, unknown>)));
  const numericSummaryKeys: Array<keyof SequenceStatusSummary> = ['total', 'pending', 'sent', 'replied', 'replyCount', 'bounced', 'failed', 'skipped'];
  const invalidNumericKeys = numericSummaryKeys.filter((key) => typeof deliverySummary[key] !== 'number' || Number.isNaN(deliverySummary[key] as number));
  const metadataIncomplete = missingSummaryKeys.length > 0 || invalidNumericKeys.length > 0;

  const totalContactCount = Math.max(deliverySummary.total, contacts.length);

  const aggregateSummary = useMemo(() => {
    const totalContacts = deliverySummary.total || contacts.length;
    const activeContacts = deliverySummary.pending + deliverySummary.sent;
    const pausedContacts = deliverySummary.skipped;
    const repliedTotal =
      typeof deliverySummary.replyCount === 'number' && Number.isFinite(deliverySummary.replyCount)
        ? deliverySummary.replyCount
        : deliverySummary.replied;
    const completedContacts = repliedTotal + deliverySummary.bounced + deliverySummary.failed;
    const lastTouched = deliverySummary.lastActivity;

    return {
      totalContacts,
      activeContacts,
      pausedContacts,
      completedContacts,
      lastTouched
    };
  }, [deliverySummary, contacts.length]);

  const mostRecentThrottleAt = useMemo(() => {
    let latest: string | null = null;

    for (const contact of contacts) {
      if (!contact.lastThrottleAt) {
        continue;
      }

      const currentTs = new Date(contact.lastThrottleAt).getTime();
      if (Number.isNaN(currentTs)) {
        continue;
      }

      if (!latest) {
        latest = contact.lastThrottleAt;
        continue;
      }

      const latestTs = new Date(latest).getTime();

      if (Number.isNaN(latestTs) || currentTs > latestTs) {
        latest = contact.lastThrottleAt;
      }
    }

    return latest;
  }, [contacts]);

  const mostRecentThrottleRelative =
    mounted && mostRecentThrottleAt ? formatRelativeToNow(mostRecentThrottleAt) : null;

  const lifecycleActionIntent: 'pause' | 'resume' = isDraft || isPaused ? 'resume' : 'pause';
  const lifecycleActionLabel = isDraft ? 'Launch sequence' : isPaused ? 'Resume sequence' : 'Pause sequence';
  const lifecycleButtonVariant = isDraft ? 'default' : 'outline';
  const enrollDisabledTitle = isDraft
    ? 'Launch the sequence to enroll new contacts'
    : isPaused
      ? 'Resume the sequence to enroll new contacts'
      : undefined;
  const pendingLaunch = pendingLifecycleAction === 'resume' && isDraft;

  const launchNotice = useMemo(() => {
    if (!lifecycle) {
      return null;
    }

    if (isDraft && lifecycle.launchAt) {
      const formatted = formatDateTimeWithTime(lifecycle.launchAt);
      if (!formatted) {
        return null;
      }
      return {
        tone: 'scheduled' as const,
        icon: Timer,
        message: `Scheduled for ${formatted}`,
        title: formatted
      };
    }

    if ((isActive || isPaused) && lifecycle.launchedAt) {
      const formatted = formatDateTimeWithTime(lifecycle.launchedAt);
      const relative = mounted ? formatRelativeToNow(lifecycle.launchedAt) ?? 'recently' : null;

      if (isPaused) {
        return {
          tone: 'paused' as const,
          icon: PauseCircle,
          message: relative
            ? `Launched ${relative} · Paused`
            : formatted
              ? `Launched ${formatted} · Paused`
              : 'Launched · Paused',
          title: formatted ?? undefined
        };
      }

      return {
        tone: 'launched' as const,
        icon: PlayCircle,
        message: relative
          ? `Live since ${relative}`
          : formatted
            ? `Live since ${formatted}`
            : 'Live',
        title: formatted ?? undefined
      };
    }

    return null;
  }, [isActive, isDraft, isPaused, lifecycle, mounted]);

  const LaunchNoticeIcon = launchNotice?.icon;

  const handleEnrollmentCompleted = (result: { enrolled: number; skipped: number }) => {
    if (result.enrolled === 0) {
      toast({
        title: 'No contacts enrolled',
        description: 'Every selected contact was already part of this sequence.'
      });
    }

    if (result.skipped > 0 && result.enrolled > 0) {
      toast({
        title: 'Some contacts were skipped',
        description: `${result.skipped} ${result.skipped === 1 ? 'contact was' : 'contacts were'} already enrolled.`,
        variant: 'default'
      });
    }

  void revalidateSequenceData();
  };

  const handleEnrollmentError = (message: string) => {
    toast({
      title: 'Unable to enroll contacts',
      description: message,
      variant: 'destructive'
    });
  };

  const handleLifecycleChange = async (action: 'pause' | 'resume') => {
    if (!sequenceId) {
      return;
    }

    setLifecycleUpdating(true);
    const endpoint = action === 'pause' ? 'pause' : 'resume';
    const launching = action === 'resume' && isDraft;

    try {
      const response = await fetch(`/api/sequences/${sequenceId}/${endpoint}`, {
        method: 'POST'
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast({
          title: 'Unable to update sequence status',
          description:
            typeof payload.error === 'string'
              ? payload.error
              : 'Please try again in a moment.',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: launching
          ? 'Sequence launched'
          : action === 'pause'
            ? 'Sequence paused'
            : 'Sequence resumed',
        description: launching
          ? 'Enroll contacts when you are ready. Once active, the worker will process new enrollments automatically.'
          : action === 'pause'
            ? 'All scheduled sends are on hold until you resume this sequence.'
            : 'Scheduling has resumed and pending sends will be processed.'
      });

      await revalidateSequenceData();

      await Promise.all([
        mutate(
          (key) =>
            typeof key === 'string' &&
            (key === '/api/sequences/list' || key.startsWith('/api/sequences/list?')),
          undefined,
          { revalidate: true }
        ),
        mutate(
          (key) => typeof key === 'string' && key.startsWith(`/api/sequences/get/${sequenceId}`),
          undefined,
          { revalidate: true }
        ),
        // also refresh the status endpoint so delivery counts update immediately
        mutate(`/api/sequences/status/${sequenceId}`, undefined, { revalidate: true })
      ]);
    } catch (error) {
      console.error('Failed to update sequence lifecycle status', error);
      toast({
        title: 'Unable to update sequence status',
        description: 'Please try again in a moment.',
        variant: 'destructive'
      });
    } finally {
      setLifecycleUpdating(false);
      setPendingLifecycleAction(null);
    }
  };

  const handleLifecycleDialogChange = (open: boolean) => {
    if (!open && !isLifecycleUpdating) {
      setPendingLifecycleAction(null);
    }
  };

  const manualSendContactName = manualSendTarget ? buildDisplayName(manualSendTarget) : null;
  const manualSendStepInfo = manualSendTarget?.stepSubject
    ?? (manualSendTarget?.stepOrder != null ? `Step ${manualSendTarget.stepOrder}` : null);

  const closeManualSendDialog = () => {
    if (!isManualSendPending) {
      setManualSendTarget(null);
    }
  };

  const handleManualSendDialogChange = (open: boolean) => {
    if (!open) {
      closeManualSendDialog();
    }
  };

  const confirmManualSend = async () => {
    if (!manualSendTarget) {
      return;
    }

    const contactName = buildDisplayName(manualSendTarget);
    setManualSendPending(true);

    try {
      const response = await fetch(`/api/sequences/${manualSendTarget.id}/send-now`, {
        method: 'POST'
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || (payload as any)?.success !== true) {
        const message =
          typeof (payload as any)?.error === 'string' && (payload as any).error.length > 0
            ? (payload as any).error
            : 'Unable to send step immediately.';

        toast({
          title: 'Manual send failed',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Step sent immediately.',
        description: `We queued the next touchpoint for ${contactName}.`
      });

      await revalidateSequenceData({ includeLogs: true });
    } catch (error) {
      console.error('Failed to trigger manual send', error);
      toast({
        title: 'Unable to send step immediately',
        description: 'Please try again in a moment.',
        variant: 'destructive'
      });
    } finally {
      setManualSendPending(false);
      setManualSendTarget(null);
    }
  };

  let tableContent: ReactNode;

  if (isLoading) {
    tableContent = (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading status...
      </div>
    );
  } else if (filteredContacts.length === 0) {
    tableContent = (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No contacts found</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {contacts.length === 0
            ? 'No contacts have been enrolled in this sequence yet.'
            : 'No contacts currently match this filter.'}
        </p>
      </div>
    );
  } else {
    tableContent = (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border/60 text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Current step</th>
              <th className="px-4 py-3 font-semibold">Next send</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 bg-background">
            {filteredContacts.map((contact) => {
              const scheduleFootnote = buildScheduleFootnote(contact);
              const lastThrottleRelative = formatRelativeToNow(contact.lastThrottleAt);
              const throttleRelativeLabel = mounted && lastThrottleRelative ? `${lastThrottleRelative} · ` : '';
              const manualSentTimestamp = contact.manualSentAt ?? null;
              const manualTriggerTimestamp = contact.manualTriggeredAt ?? null;
              const manualSentDisplay = manualSentTimestamp ? formatDateTimeWithTime(manualSentTimestamp) : null;
              const manualSentRelative = mounted && manualSentTimestamp ? formatRelativeToNow(manualSentTimestamp) : null;
              const manualQueuedRelative = mounted && manualTriggerTimestamp ? formatRelativeToNow(manualTriggerTimestamp) : null;
              const manualQueuedAbsolute = manualTriggerTimestamp ? formatDateTime(manualTriggerTimestamp) : null;
              const isManualCandidate = isActive && contact.status === 'pending';
              const isManualInFlight = manualSendTarget?.id === contact.id;

              return (
                <tr key={contact.id}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{buildDisplayName(contact)}</span>
                      <span className="text-xs text-muted-foreground">{contact.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.company && contact.company.trim().length > 0 ? contact.company : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.stepOrder == null ? '—' : `Step ${contact.stepOrder}`}
                    {contact.stepSubject ? (
                      <div className="text-xs text-muted-foreground/80">{contact.stepSubject}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span suppressHydrationWarning>{formatScheduledDate(contact)}</span>
                    {scheduleFootnote ? (
                      <div className="text-xs text-muted-foreground/70">{scheduleFootnote}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <SequenceStatusBadge status={contact.status} />
                    {manualSentDisplay ? (
                      <div className="mt-1 text-xs text-sky-600">
                        Sent (Manual)
                        {manualSentRelative ? ` · ${manualSentRelative}` : null}
                        {!manualSentRelative ? (
                          <span suppressHydrationWarning>{` · ${manualSentDisplay}`}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {contact.manualTriggeredAt && contact.status === 'pending' ? (
                      <div className="mt-1 text-xs text-primary/70" title={manualQueuedAbsolute ?? undefined}>
                        Manual send queued{manualQueuedRelative ? ` · ${manualQueuedRelative}` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span suppressHydrationWarning>{formatDateTime(contact.lastUpdated)}</span>
                    {contact.lastThrottleAt ? (
                      <div className="text-xs text-muted-foreground/70">
                        Throttled {throttleRelativeLabel}
                        <span suppressHydrationWarning>{formatDateTime(contact.lastThrottleAt)}</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isManualCandidate ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => setManualSendTarget(contact)}
                        disabled={isManualSendPending}
                      >
                        {isManualSendPending && isManualInFlight ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            Sending...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Send className="h-3.5 w-3.5" aria-hidden />
                            Send now
                          </span>
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">
              {activeTab === 'overview' ? 'Delivery status' : 'Delivery logs'}
            </h2>
            <SequenceLifecycleBadge status={lifecycleStatus} />
            {metadataIncomplete ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-amber-800"
                title="We could not reconcile all activity data for this sequence. Delivery counts or reply totals may be incomplete."
              >
                <AlertTriangle className="h-3 w-3" aria-hidden />
                <span>Metadata incomplete</span>
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {activeTab === 'overview'
              ? 'Monitor where each contact is in the sequence and react to replies quickly.'
              : 'Inspect every send attempt, retries, and failures so you can resolve deliverability issues fast.'}
          </p>
          {lifecycle?.sender ? (
            <p className="text-xs text-muted-foreground/80">
              Sender: {lifecycle.sender.name} · {lifecycle.sender.email}
            </p>
          ) : (
            <p className="text-xs text-destructive">
              No sender assigned. Contacts will not receive emails until an active sender is selected.
            </p>
          )}
          <p className="text-xs text-muted-foreground/70">
            Worker pacing enforces at least {effectiveMinGapLabel} between sends.
          </p>
          {sequenceOverrideLabel ? (
            <p className="text-xs text-muted-foreground/70">
              Sequence override set to {sequenceOverrideLabel} (workspace default {workspaceDefaultLabel}).
            </p>
          ) : null}
          {mostRecentThrottleAt ? (
            <p className="text-xs text-muted-foreground/70">
              Most recent throttle:{' '}
              <span suppressHydrationWarning>{formatDateTime(mostRecentThrottleAt)}</span>
              {mostRecentThrottleRelative ? <span>{` · ${mostRecentThrottleRelative}`}</span> : null}
            </p>
          ) : null}
          {launchNotice ? (
            <span
              className={cn(
                'mt-2 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium shadow-sm',
                launchToneClasses[launchNotice.tone]
              )}
              title={launchNotice.title}
            >
              {LaunchNoticeIcon ? <LaunchNoticeIcon className="h-3.5 w-3.5" aria-hidden /> : null}
              <span suppressHydrationWarning>{launchNotice.message}</span>
            </span>
          ) : null}
        </div>
        {activeTab === 'overview' ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={lifecycleButtonVariant}
              size="sm"
              onClick={() => setPendingLifecycleAction(lifecycleActionIntent)}
              disabled={isLifecycleUpdating}
              className="gap-2"
            >
              {isLifecycleUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : isDraft || isPaused ? (
                <PlayCircle className="h-4 w-4" aria-hidden />
              ) : (
                <PauseCircle className="h-4 w-4" aria-hidden />
              )}
              {lifecycleActionLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void revalidateSequenceData();
              }}
              disabled={isValidating || isLifecycleUpdating}
            >
              {isValidating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Refreshing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" aria-hidden />
                  Refresh
                </span>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setEnrollOpen(true)}
              disabled={!isActive || isLifecycleUpdating}
              title={!isActive && enrollDisabledTitle ? enrollDisabledTitle : undefined}
            >
              Enroll contacts
            </Button>
          </div>
        ) : null}
      </div>

      <div className="inline-flex items-center gap-1 rounded-full bg-muted/40 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'rounded-full px-3 py-1 transition-colors',
            activeTab === 'overview'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-pressed={activeTab === 'overview'}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={cn(
            'rounded-full px-3 py-1 transition-colors',
            activeTab === 'logs'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-pressed={activeTab === 'logs'}
        >
          Delivery logs
        </button>
      </div>

      {isDraft && activeTab === 'overview' ? (
        <div className="flex items-start gap-3 rounded-lg border border-slate-300/70 bg-slate-100 px-4 py-3 text-sm text-slate-900">
          <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden />
          <div>
            <p className="font-semibold">Sequence draft</p>
            <p className="text-slate-900/80">Launch the sequence once everything looks good. Enrollments and sends will remain paused until then.</p>
          </div>
        </div>
      ) : null}

      {isPaused && activeTab === 'overview' ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <PauseCircle className="mt-0.5 h-4 w-4" aria-hidden />
          <div>
            <p className="font-semibold">Sequence paused</p>
            <p className="text-amber-900/80">Scheduled sends are on hold and new enrollments are disabled until you resume.</p>
          </div>
        </div>
      ) : null}

      {activeTab === 'logs' ? (
        <SequenceDeliveryLogsPanel sequenceId={sequenceId} />
      ) : (
        <>
          {error ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden />
              <div>
                <p className="font-semibold">Unable to load status</p>
                <p className="text-destructive/80">Please try refreshing the data.</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/70">
              <CardContent className="flex flex-col gap-3 pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Users className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Enrolled contacts</p>
                    <p className="text-2xl font-semibold text-foreground">{aggregateSummary.totalContacts}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {aggregateSummary.lastTouched ? (
                    <>
                      Last touch{' '}
                      <span suppressHydrationWarning>{formatDateTime(aggregateSummary.lastTouched)}</span>
                    </>
                  ) : (
                    'No contact activity yet'
                  )}
                </p>
              </CardContent>
            </Card>

            {(['pending', 'sent', 'replied', 'bounced', 'failed', 'skipped'] as const).map((status) => {
              const Icon = STATUS_ICONS[status];
              const count = getStatusCount(deliverySummary, status);
              const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
              return (
                <Card key={status} className="border-border/70">
                  <CardContent className="flex items-center justify-between gap-4 pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <span className={cn('inline-flex size-9 items-center justify-center rounded-full', STATUS_COLORS[status])}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{statusLabel}</p>
                        <p className="text-2xl font-semibold text-foreground">{count}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-border/70">
            <CardContent className="flex flex-col gap-5 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <RefreshCcw className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Worker status</p>
                    <p className="text-sm text-muted-foreground">Keep an eye on the scheduler processing your sequence.</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void revalidateSequenceData();
                  }}
                  disabled={isValidating}
                  className="gap-2"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Refreshing
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="h-4 w-4" aria-hidden />
                      Refresh stats
                    </>
                  )}
                </Button>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Total contacts</span>
                  <span className="font-semibold text-foreground">{aggregateSummary.totalContacts}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      {
                        key: 'active',
                        label: 'Active',
                        value: aggregateSummary.activeContacts,
                        tone: 'bg-emerald-500/10 text-emerald-600',
                        Icon: PlayCircle
                      },
                      {
                        key: 'paused',
                        label: 'Paused',
                        value: aggregateSummary.pausedContacts,
                        tone: 'bg-amber-500/10 text-amber-600',
                        Icon: PauseCircle
                      },
                      {
                        key: 'completed',
                        label: 'Completed',
                        value: aggregateSummary.completedContacts,
                        tone: 'bg-slate-500/10 text-slate-600',
                        Icon: CheckCircle2
                      }
                    ] as const
                  ).map(({ key, label, value, tone, Icon }) => (
                    <span
                      key={key}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                        tone
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      <span>{label}</span>
                      <span className="font-semibold text-current">{value}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Last touch</span>
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Timer className="h-3.5 w-3.5" aria-hidden />
                    {aggregateSummary.lastTouched ? (
                      <span suppressHydrationWarning>{formatDateTime(aggregateSummary.lastTouched)}</span>
                    ) : (
                      'No touch yet'
                    )}
                  </span>
                </div>
              </div>
              <div className="grid gap-2 text-sm text-foreground">
                <span className="flex items-center justify-between">
                  <span className="text-muted-foreground">Queue size</span>
                  <span className="font-semibold text-foreground">{worker.queueSize}</span>
                </span>
                <span className="flex items-center justify-between">
                  <span className="text-muted-foreground">Min send interval</span>
                  <span className="font-semibold text-foreground">
                    {effectiveMinGapLabel}
                  </span>
                </span>
                <span className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last run</span>
                  <span>
                    {worker.lastRunAt ? (
                      <span suppressHydrationWarning>{formatDateTime(worker.lastRunAt)}</span>
                    ) : (
                      'Not yet run'
                    )}
                  </span>
                </span>
                {worker.lastError ? (
                  <span className="text-xs text-destructive">Last error: {worker.lastError}</span>
                ) : worker.lastFailureAt ? (
                  <span className="text-xs text-muted-foreground">
                    Last failure:{' '}
                    <span suppressHydrationWarning>{formatDateTime(worker.lastFailureAt)}</span>
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {steps.length > 0 ? (
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Per-step breakdown</p>
                <div className="divide-y divide-border/40 mt-2 text-sm">
                  {steps.map((step) => {
                    const key = step.stepId ?? `${step.order ?? '0'}`;
                    const label = step.subject ?? `Step ${step.order ?? '—'}`;
                    const stepId = typeof step.stepId === 'string' ? step.stepId : null;
                    const sentCount = stepId ? sentPerStep[stepId] ?? step.sent : step.sent;
                    const progressBase = totalContactCount > 0 ? totalContactCount : 0;
                    const showProgress = Boolean(stepId && progressBase > 0);
                    const progressPct = showProgress ? Math.min(100, Math.round((sentCount / progressBase) * 100)) : 0;

                    return (
                      <div key={key} className="py-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="max-w-xs truncate text-foreground">{label}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>Pending: <span className="font-semibold text-foreground">{step.pending}</span></span>
                            <span>Sent: <span className="font-semibold text-foreground">{sentCount}</span></span>
                            <span>Replied: <span className="font-semibold text-foreground">{step.replied}</span></span>
                            <span>Bounced: <span className="font-semibold text-foreground">{step.bounced}</span></span>
                            <span>Skipped: <span className="font-semibold text-foreground">{step.skipped}</span></span>
                            <span>Failed: <span className="font-semibold text-foreground">{step.failed}</span></span>
                          </div>
                        </div>
                        {showProgress ? (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Delivered</span>
                              <span className="font-semibold text-foreground">{sentCount}</span>
                            </div>
                            <div
                              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                              role="progressbar"
                              aria-valuenow={progressPct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Step deliveries: ${sentCount} of ${progressBase}`}
                            >
                              <div
                                className="h-full rounded-full bg-sky-500"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                  filter === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
                aria-pressed={filter === value}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {tableContent}
              <div className="text-xs text-muted-foreground">
                Last touch{' '}
                {aggregateSummary.lastTouched ? (
                  <span suppressHydrationWarning>{formatDateTime(aggregateSummary.lastTouched)}</span>
                ) : (
                  'No contact activity yet'
                )}
              </div>
            </div>

            <SequenceEngagementPanel sequenceId={sequenceId} />
          </div>
        </>
      )}

      <AlertDialog open={pendingLifecycleAction !== null} onOpenChange={handleLifecycleDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingLifecycleAction === 'pause'
                ? 'Pause this sequence?'
                : pendingLaunch
                  ? 'Launch this sequence?'
                  : 'Resume this sequence?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLifecycleAction === 'pause'
                ? 'Contacts will remain at their current step and no further emails will be scheduled.'
                : pendingLaunch
                  ? 'Enrollments and sending will begin once contacts are added to this sequence.'
                  : 'This will restart scheduling for all eligible contacts.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLifecycleUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingLifecycleAction && handleLifecycleChange(pendingLifecycleAction)}
              disabled={isLifecycleUpdating}
              variant={pendingLifecycleAction === 'pause' ? 'destructive' : 'default'}
            >
              {isLifecycleUpdating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Working...
                </span>
              ) : pendingLifecycleAction === 'pause' ? (
                'Pause sequence'
              ) : pendingLaunch ? (
                'Launch sequence'
              ) : (
                'Resume sequence'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={manualSendTarget !== null} onOpenChange={handleManualSendDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this step immediately?</AlertDialogTitle>
            <AlertDialogDescription>
              {manualSendContactName
                ? `We will bypass scheduling and send the next touchpoint to ${manualSendContactName} right away.`
                : 'We will bypass scheduling and send the next touchpoint right away.'}
              {manualSendStepInfo ? (
                <span className="mt-2 block text-muted-foreground/80">{`Subject: ${manualSendStepInfo}`}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeManualSendDialog} disabled={isManualSendPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmManualSend} disabled={isManualSendPending}>
              {isManualSendPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Sending...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="h-4 w-4" aria-hidden />
                  Send now
                </span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SequenceEnrollDialog
        sequenceId={sequenceId}
        open={isEnrollOpen}
        onOpenChange={setEnrollOpen}
        onCompleted={handleEnrollmentCompleted}
        onError={handleEnrollmentError}
      />
    </div>
  );
}
