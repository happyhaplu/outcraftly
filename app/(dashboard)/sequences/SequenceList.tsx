'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { AlertTriangle, Loader2, PauseCircle, PlayCircle, Plus, Reply, Timer, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

import { cn } from '@/lib/utils';

import { SequenceSummary } from './types';
import { SequenceLifecycleBadge } from './SequenceLifecycleBadge';

type SequenceListProps = {
  sequences: SequenceSummary[];
  isLoading: boolean;
  createHref?: string;
};

function formatRelativeLabel(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 'just now';
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'just now';
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  }

  const diffYears = Math.round(diffMonths / 12);
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
}

function formatDateTimeWithTime(timestamp: string | null | undefined) {
  if (!timestamp) {
    return null;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC'
  }).format(parsed);
}

type LaunchBadgeMetadata = {
  label: string;
  tone: 'scheduled' | 'launched' | 'paused';
  icon: typeof Timer;
  title?: string;
};

const launchBadgeToneClasses: Record<LaunchBadgeMetadata['tone'], string> = {
  scheduled: 'border-sky-400/60 bg-sky-500/10 text-sky-700',
  launched: 'border-emerald-400/60 bg-emerald-500/10 text-emerald-700',
  paused: 'border-amber-400/70 bg-amber-500/15 text-amber-800'
};

function buildLaunchBadge(sequence: SequenceSummary): LaunchBadgeMetadata | null {
  if (sequence.status === 'draft' && sequence.launchAt) {
    const formatted = formatDateTimeWithTime(sequence.launchAt);
    if (!formatted) {
      return null;
    }
    return {
      label: `Scheduled for ${formatted}`,
      tone: 'scheduled',
      icon: Timer,
      title: formatted
    };
  }

  if (sequence.launchedAt) {
    const relative = formatRelativeLabel(sequence.launchedAt);
    const formatted = formatDateTimeWithTime(sequence.launchedAt);
    if (sequence.status === 'paused') {
      return {
        label: `Launched ${relative} · Paused`,
        tone: 'paused',
        icon: PauseCircle,
        title: formatted ?? undefined
      };
    }

    return {
      label: `Launched ${relative}`,
      tone: 'launched',
      icon: PlayCircle,
      title: formatted ?? undefined
    };
  }

  return null;
}

function formatAbsoluteDate(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 'Unknown';
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}

function buildLifecycleIntent(status: SequenceSummary['status']) {
  return status === 'active' ? 'pause' : 'resume';
}

function buildLifecycleLabel(status: SequenceSummary['status']) {
  if (status === 'active') {
    return 'Pause sequence';
  }
  if (status === 'paused') {
    return 'Resume sequence';
  }
  return 'Launch sequence';
}

function formatSentCount(value: number) {
  const safe = Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
  return `${safe} sent`;
}

export function SequenceList({ sequences, isLoading, createHref = '/sequences/create' }: SequenceListProps) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [actionState, setActionState] = useState<{ id: string; intent: 'pause' | 'resume' } | null>(null);
  const [deletionTarget, setDeletionTarget] = useState<SequenceSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredSequences = useMemo(() => sequences.filter((sequence) => !sequence.deletedAt), [sequences]);

  const hasSequences = filteredSequences.length > 0;

  const handleLifecycleAction = useCallback(
    async (sequence: SequenceSummary) => {
      const intent = buildLifecycleIntent(sequence.status);
      setActionState({ id: sequence.id, intent });

      try {
        const endpoint = intent === 'pause' ? 'pause' : 'resume';
        const response = await fetch(`/api/sequences/${sequence.id}/${endpoint}`, {
          method: 'POST'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = typeof payload.error === 'string' ? payload.error : 'Please try again in a moment.';
          toast({
            title: 'Unable to update sequence',
            description: message,
            variant: 'destructive'
          });
          return;
        }

        toast({
          title: intent === 'pause' ? 'Sequence paused' : sequence.status === 'draft' ? 'Sequence launched' : 'Sequence resumed',
          description:
            intent === 'pause'
              ? 'All future sends are on hold until you resume the sequence.'
              : 'Scheduling has been updated and contacts will follow the configured delays.'
        });

        await Promise.all([
          mutate('/api/sequences/list'),
          mutate(`/api/sequences/get/${sequence.id}`)
        ]);
      } catch (error) {
        console.error('Failed to update sequence lifecycle', error);
        toast({
          title: 'Unable to update sequence',
          description: 'Something went wrong while updating the lifecycle status.',
          variant: 'destructive'
        });
      } finally {
        setActionState(null);
      }
    },
    [mutate, toast]
  );

  const handleDeleteRequest = useCallback((sequence: SequenceSummary) => {
    setDeletionTarget(sequence);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletionTarget) {
      return;
    }

    const target = deletionTarget;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/sequences/${target.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof payload.error === 'string' ? payload.error : 'Please try again in a moment.';
        toast({
          title: 'Unable to delete sequence',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Sequence deleted',
        description: `${target.name} has been removed from your workspace.`
      });

      await mutate('/api/sequences/list');
      setDeletionTarget(null);
    } catch (error) {
      console.error('Failed to delete sequence', error);
      toast({
        title: 'Unable to delete sequence',
        description: 'Something went wrong while deleting the sequence.',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deletionTarget, mutate, toast]);

  const emptyState = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading sequences...
        </div>
      );
    }

    return (
      <div className="space-y-2 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-6 py-10 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">You haven&apos;t created any sequences yet.</p>
        <p className="text-muted-foreground">Kick off your first outreach flow with a custom cadence and personalised copy.</p>
      </div>
    );
  }, [isLoading]);

  return (
    <Card className="border-border/70">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold">Sequences</CardTitle>
          <p className="text-sm text-muted-foreground">Pick a cadence to refine or launch a new automation.</p>
        </div>
        <Button type="button" className="gap-2" size="sm" asChild>
          <Link href={createHref} aria-label="Create a new sequence">
            <Plus className="h-4 w-4" aria-hidden />
            Create sequence
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 px-6 py-6">
        {!hasSequences ? (
          emptyState
        ) : (
          <ul className="space-y-3" role="list" aria-label="Sequences">
            <TooltipProvider>
              {filteredSequences.map((sequence) => {
                const updatedLabel = formatRelativeLabel(sequence.updatedAt ?? sequence.createdAt ?? null);
                const createdLabel = formatAbsoluteDate(sequence.createdAt ?? null);
                const lifecycleLabel = buildLifecycleLabel(sequence.status);
                const intent = buildLifecycleIntent(sequence.status);
                const isProcessing = actionState?.id === sequence.id;
                const isDeletingTarget = isDeleting && deletionTarget?.id === sequence.id;
                const disableActions = isProcessing || isDeletingTarget;
                const launchBadge = buildLaunchBadge(sequence);
                const LaunchIcon = launchBadge?.icon;
                const stepProgress = Array.isArray(sequence.stepSendSummary)
                  ? sequence.stepSendSummary
                  : [];
                const replyCountRaw = typeof sequence.replyCount === 'number' ? sequence.replyCount : 0;
                const replyCount = Number.isFinite(replyCountRaw)
                  ? Math.max(0, Math.round(replyCountRaw))
                  : 0;
                const replyLabel = replyCount === 1 ? 'reply' : 'replies';
                const hasCompleteMetrics = Number.isFinite(replyCountRaw) && typeof sequence.stepCount === 'number';
                const showMetadataBadge = sequence.hasMissingMetadata && !hasCompleteMetrics;

                  return (
                  <li key={sequence.id}>
                    <div className="group flex flex-col gap-4 rounded-2xl border border-border/60 bg-background px-4 py-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-within:border-primary/40 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground" aria-label={`Sequence name: ${sequence.name}`}>
                            {sequence.name}
                          </p>
                          <SequenceLifecycleBadge status={sequence.status} />
                          {showMetadataBadge ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className="inline-flex items-center gap-1 rounded-full border-amber-300/70 bg-amber-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-amber-800"
                                  aria-label="Some metrics could not be loaded"
                                >
                                  <AlertTriangle className="h-3 w-3" aria-hidden />
                                  <span>Metadata incomplete</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                We could not reconcile all activity data for this sequence. Delivery counts or reply totals may be incomplete.
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {sequence.sender ? `${sequence.sender.name} · ${sequence.sender.email}` : 'No sender assigned'}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/90">
                          <span suppressHydrationWarning>Created {createdLabel}</span>
                          <span aria-hidden>•</span>
                          <span suppressHydrationWarning>Updated {updatedLabel}</span>
                        </div>
                        {launchBadge ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium shadow-sm',
                              launchBadgeToneClasses[launchBadge.tone]
                            )}
                            title={launchBadge.title}
                          >
                            {LaunchIcon ? <LaunchIcon className="h-3.5 w-3.5" aria-hidden /> : null}
                            <span suppressHydrationWarning>{launchBadge.label}</span>
                          </span>
                        ) : null}
                        {stepProgress.length > 0 ? (
                          <div
                            className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/90"
                            aria-label={`Sent emails per step for ${sequence.name}`}
                          >
                            {stepProgress.map((step) => (
                              <span
                                key={step.id}
                                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1"
                                title={step.subject ?? undefined}
                              >
                                <span className="font-medium text-foreground/80">
                                  {step.order != null ? `Step ${step.order}` : 'Step'}
                                </span>
                                <span aria-hidden>•</span>
                                <span>{formatSentCount(step.sent)}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-full border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground"
                          >
                            {sequence.stepCount} {sequence.stepCount === 1 ? 'step' : 'steps'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border-emerald-200/80 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700',
                              replyCount === 0 && 'border-border/70 bg-muted/20 text-muted-foreground'
                            )}
                            aria-label={`${replyCount} ${replyLabel} captured`}
                          >
                            <Reply className="h-3.5 w-3.5" aria-hidden />
                            <span>{replyCount}</span>
                            <span>{replyLabel}</span>
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleLifecycleAction(sequence);
                                }}
                                disabled={disableActions}
                                aria-label={lifecycleLabel}
                              >
                                {disableActions ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : intent === 'pause' ? (
                                  <PauseCircle className="h-4 w-4" aria-hidden />
                                ) : (
                                  <PlayCircle className="h-4 w-4" aria-hidden />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{lifecycleLabel}</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteRequest(sequence);
                                }}
                                disabled={disableActions}
                                aria-label={`Delete ${sequence.name}`}
                              >
                                {isDeletingTarget ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete sequence</TooltipContent>
                          </Tooltip>

                          <Button type="button" variant="outline" size="sm" className="gap-2" asChild>
                            <Link href={`/sequences/${sequence.id}/edit`} aria-label={`Edit ${sequence.name}`}>
                              Edit
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </TooltipProvider>
          </ul>
        )}
      </CardContent>
      <AlertDialog
        open={Boolean(deletionTarget)}
        onOpenChange={(open: boolean) => {
          if (!open && !isDeleting) {
            setDeletionTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sequence?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletionTarget?.name ?? 'this sequence'}"? Contacts will stop receiving emails and this action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleConfirmDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Deleting...
                </span>
              ) : (
                'Delete sequence'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
