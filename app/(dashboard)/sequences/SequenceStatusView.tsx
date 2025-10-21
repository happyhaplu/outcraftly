"use client";

import { useMemo, useState, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { AlertCircle, AlertTriangle, Inbox, Loader2, PauseCircle, PlayCircle, RefreshCcw, Reply, Send, Timer, Users, XCircle } from 'lucide-react';

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
  SequenceLifecycleSnapshot
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

type SequenceStatusViewProps = {
  sequenceId: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
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
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short'
  };

  if (zone) {
    options.timeZone = zone;
    options.timeZoneName = 'short';
  }

  try {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(contact.scheduledAt));
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

function getStatusCount(
  summary: { pending: number; sent: number; replied: number; bounced: number; failed: number; skipped: number },
  status: SequenceDeliveryStatus
) {
  if (status === 'pending') {
    return summary.pending;
  }
  if (status === 'sent') {
    return summary.sent;
  }
  if (status === 'replied') {
    return summary.replied;
  }
  if (status === 'bounced') {
    return summary.bounced;
  }
  if (status === 'skipped') {
    return summary.skipped;
  }
  return summary.failed;
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

  const lifecycle: SequenceLifecycleSnapshot | null = data?.sequence ?? null;
  const lifecycleStatus = lifecycle?.status ?? 'active';
  const isPaused = lifecycleStatus === 'paused';

  const contacts = data?.contacts ?? [];
  const steps = data?.steps ?? [];
  const worker = data?.worker ?? {
    queueSize: 0,
    lastRunAt: null,
    lastFailureAt: null,
    lastError: null
  };

  const filteredContacts = useMemo(() => {
    if (filter === 'all') {
      return contacts;
    }
    return contacts.filter((contact) => contact.status === filter);
  }, [contacts, filter]);

  const summary = data?.summary ?? {
    total: 0,
    pending: 0,
    sent: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    skipped: 0,
    lastActivity: null
  };

  const handleEnrollmentCompleted = (result: { enrolled: number; skipped: number }) => {
    toast({
      title: result.enrolled === 0 ? 'No contacts enrolled' : 'Contacts enrolled',
      description:
        result.enrolled === 0
          ? 'Every selected contact was already part of this sequence.'
          : `${result.enrolled} ${result.enrolled === 1 ? 'contact' : 'contacts'} enrolled successfully.`
    });

    if (result.skipped > 0 && result.enrolled > 0) {
      toast({
        title: 'Some contacts were skipped',
        description: `${result.skipped} ${result.skipped === 1 ? 'contact was' : 'contacts were'} already enrolled.`,
        variant: 'default'
      });
    }

    refresh();
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
        title: action === 'pause' ? 'Sequence paused' : 'Sequence resumed',
        description:
          action === 'pause'
            ? 'All scheduled sends are on hold until you resume this sequence.'
            : 'Scheduling has resumed and pending sends will be processed.'
      });

      await Promise.all([
        refresh(),
        mutate('/api/sequences/list'),
        mutate(`/api/sequences/get/${sequenceId}`)
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 bg-background">
            {filteredContacts.map((contact) => {
              const scheduleFootnote = buildScheduleFootnote(contact);

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
                    {formatScheduledDate(contact)}
                    {scheduleFootnote ? (
                      <div className="text-xs text-muted-foreground/70">{scheduleFootnote}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <SequenceStatusBadge status={contact.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(contact.lastUpdated)}</td>
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
        </div>
        {activeTab === 'overview' ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingLifecycleAction(isPaused ? 'resume' : 'pause')}
              disabled={isLifecycleUpdating}
              className="gap-2"
            >
              {isLifecycleUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : isPaused ? (
                <PlayCircle className="h-4 w-4" aria-hidden />
              ) : (
                <PauseCircle className="h-4 w-4" aria-hidden />
              )}
              {isPaused ? 'Resume sequence' : 'Pause sequence'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refresh()}
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
              disabled={isPaused || isLifecycleUpdating}
              title={isPaused ? 'Resume the sequence to enroll new contacts' : undefined}
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="space-y-1 pt-6">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Users className="h-4 w-4" aria-hidden />
                  Enrolled contacts
                </p>
                <p className="text-2xl font-semibold text-foreground">{summary.total}</p>
              </CardContent>
            </Card>

            {(['pending', 'sent', 'replied', 'bounced', 'failed', 'skipped'] as const).map((status) => {
              const Icon = STATUS_ICONS[status];
              const count = getStatusCount(summary, status);
              return (
                <Card key={status}>
                  <CardContent className="space-y-1 pt-6">
                    <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden />
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </p>
                    <p className="text-2xl font-semibold text-foreground">{count}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Worker status</p>
              <div className="flex flex-col gap-1 text-sm text-foreground">
                <span>
                  Queue size: <span className="font-semibold">{worker.queueSize}</span>
                </span>
                <span>
                  Last run: {worker.lastRunAt ? formatDateTime(worker.lastRunAt) : 'Not yet run'}
                </span>
                {worker.lastError ? (
                  <span className="text-xs text-destructive">
                    Last error: {worker.lastError}
                  </span>
                ) : worker.lastFailureAt ? (
                  <span className="text-xs text-muted-foreground">
                    Last failure: {formatDateTime(worker.lastFailureAt)}
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
                  {steps.map((step) => (
                    <div key={step.stepId ?? `${step.order ?? '0'}`} className="flex items-center justify-between py-2">
                      <div className="max-w-xs truncate text-foreground">{step.subject ?? `Step ${step.order ?? '—'}`}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Pending: <span className="font-semibold text-foreground">{step.pending}</span></span>
                        <span>Sent: <span className="font-semibold text-foreground">{step.sent}</span></span>
                        <span>Replied: <span className="font-semibold text-foreground">{step.replied}</span></span>
                        <span>Bounced: <span className="font-semibold text-foreground">{step.bounced}</span></span>
                        <span>Skipped: <span className="font-semibold text-foreground">{step.skipped}</span></span>
                        <span>Failed: <span className="font-semibold text-foreground">{step.failed}</span></span>
                      </div>
                    </div>
                  ))}
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
                Last activity:{' '}
                {summary.lastActivity ? formatDateTime(summary.lastActivity) : 'No activity recorded yet'}
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
              {pendingLifecycleAction === 'pause' ? 'Pause this sequence?' : 'Resume this sequence?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLifecycleAction === 'pause'
                ? 'Contacts already enrolled will stay in their current step, and no additional emails will send until you resume.'
                : 'Pending steps will resume sending based on their scheduled times.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLifecycleUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingLifecycleAction && handleLifecycleChange(pendingLifecycleAction)}
              variant={pendingLifecycleAction === 'pause' ? 'destructive' : 'default'}
              disabled={isLifecycleUpdating}
            >
              {isLifecycleUpdating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Applying...
                </span>
              ) : pendingLifecycleAction === 'pause' ? (
                'Pause sequence'
              ) : (
                'Resume sequence'
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
