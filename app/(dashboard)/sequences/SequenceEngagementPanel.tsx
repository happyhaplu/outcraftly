'use client';

import { useEffect, useRef } from 'react';
import { Reply, XCircle, Loader2, RefreshCcw, MailCheck, MailWarning } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useSequenceReplies } from './use-sequence-replies';
import type { SequenceBounceActivity, SequenceReplyActivity } from './types';

type SequenceEngagementPanelProps = {
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

function buildDisplayName(activity: SequenceReplyActivity | SequenceBounceActivity) {
  const name = [activity.firstName, activity.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return name.length > 0 ? name : activity.email;
}

function ActivityEmptyState({
  icon: Icon,
  title,
  description
}: {
  icon: typeof Reply;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/30 px-6 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ReplyList({ items }: { items: SequenceReplyActivity[] }) {
  if (items.length === 0) {
    return (
      <ActivityEmptyState
        icon={Reply}
        title="No replies yet"
        description="When contacts reply to your outreach, you will see them here."
      />
    );
  }

  return (
    <ul className="space-y-3 text-sm">
      {items.map((reply) => (
        <li
          key={reply.id}
          className="rounded-2xl border border-border/60 bg-background px-4 py-4 shadow-sm transition-colors hover:border-primary/40"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{buildDisplayName(reply)}</p>
              <p className="text-xs text-muted-foreground">{reply.email}</p>
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground" suppressHydrationWarning>
              {formatDateTime(reply.occurredAt)}
            </span>
          </div>
          {reply.stepSubject ? (
            <p className="mt-3 text-xs text-muted-foreground/80">Replied to: {reply.stepSubject}</p>
          ) : null}
          {reply.subject ? (
            <p className="mt-2 text-sm font-medium text-foreground">{reply.subject}</p>
          ) : null}
          {reply.snippet ? (
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{reply.snippet}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function BounceList({ items }: { items: SequenceBounceActivity[] }) {
  if (items.length === 0) {
    return (
      <ActivityEmptyState
        icon={XCircle}
        title="No bounces recorded"
        description="When messages bounce, we will capture the reason here so you can take action."
      />
    );
  }

  return (
    <ul className="space-y-3 text-sm">
      {items.map((bounce) => (
        <li
          key={bounce.id}
          className="rounded-2xl border border-border/60 bg-background px-4 py-4 shadow-sm transition-colors hover:border-amber-400/50"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{buildDisplayName(bounce)}</p>
              <p className="text-xs text-muted-foreground">{bounce.email}</p>
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground" suppressHydrationWarning>
              {formatDateTime(bounce.occurredAt)}
            </span>
          </div>
          {bounce.stepSubject ? (
            <p className="mt-3 text-xs text-muted-foreground/80">Bounce detected on: {bounce.stepSubject}</p>
          ) : null}
          <p className="mt-2 text-sm font-medium text-foreground">
            {bounce.reason ? `Reason: ${bounce.reason}` : 'Bounce detected'}
          </p>
          {bounce.detail ? (
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{bounce.detail}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SequenceEngagementPanel({ sequenceId }: SequenceEngagementPanelProps) {
  const { data, error, isLoading, isValidating, refresh } = useSequenceReplies(sequenceId);
  const refreshSnapshotRef = useRef<{ replies: number; bounces: number } | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed('[SequenceEngagementPanel] snapshot', sequenceId);
        console.log('loading', { isLoading, isValidating, error: error?.message ?? null });
        console.log('replies', data?.replies?.length ?? null);
        console.log('bounces', data?.bounces?.length ?? null);
        console.groupEnd?.();
      } else {
        console.log('[SequenceEngagementPanel] snapshot', {
          sequenceId,
          isLoading,
          isValidating,
          error: error?.message ?? null,
          replies: data?.replies?.length ?? null,
          bounces: data?.bounces?.length ?? null
        });
      }
    }
  }, [sequenceId, data, error, isLoading, isValidating]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    const counts = {
      replies: data?.replies?.length ?? 0,
      bounces: data?.bounces?.length ?? 0
    };

    if (isValidating) {
      refreshSnapshotRef.current = counts;
      return;
    }

    if (refreshSnapshotRef.current) {
      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed('[SequenceEngagementPanel] refresh delta', sequenceId);
        console.log('before', refreshSnapshotRef.current);
        console.log('after', counts);
        console.groupEnd?.();
      } else {
        console.log('[SequenceEngagementPanel] refresh delta', {
          sequenceId,
          before: refreshSnapshotRef.current,
          after: counts
        });
      }
      refreshSnapshotRef.current = null;
    }
  }, [sequenceId, data?.replies?.length, data?.bounces?.length, isValidating]);

  const replies = data?.replies ?? [];
  const bounces = data?.bounces ?? [];
  const totalReplies = replies.length;
  const totalBounces = bounces.length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="border-border/70">
          <CardHeader className="space-y-3 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Reply className="h-4 w-4" aria-hidden />
                  Recent replies
                  <Badge variant="outline" className="rounded-full border-emerald-200/80 bg-emerald-500/10 text-xs font-medium text-emerald-700">
                    {totalReplies}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Track replies as they land and respond while interest is high.
                </CardDescription>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => refresh()}
                    disabled={isValidating}
                  >
                    {isValidating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Updating
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="h-4 w-4" aria-hidden />
                        Refresh
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Re-fetch latest engagement data</TooltipContent>
              </Tooltip>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <span className="flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <MailCheck className="h-4 w-4" aria-hidden />
                {totalReplies === 0 ? 'No replies captured yet' : `${totalReplies} recent ${totalReplies === 1 ? 'reply' : 'replies'}`}
              </span>
              <span className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Contacts who reply are automatically removed from future sends.
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading replies...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                Unable to load replies. Please try again.
              </div>
            ) : (
              <ReplyList items={replies} />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="space-y-3 pb-5">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <XCircle className="h-4 w-4" aria-hidden />
                Recent bounces
                <Badge variant="outline" className="rounded-full border-amber-200/80 bg-amber-500/10 text-xs font-medium text-amber-700">
                  {totalBounces}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Spot deliverability problems quickly to protect your sender reputation.
              </CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <span className="flex items-center gap-2 rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <MailWarning className="h-4 w-4" aria-hidden />
                {totalBounces === 0 ? 'No bounces detected' : `${totalBounces} recent ${totalBounces === 1 ? 'bounce' : 'bounces'}`}
              </span>
              <span className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Investigate hard bounces to keep lists healthy and improve deliverability.
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading bounces...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                Unable to load bounces. Please try again.
              </div>
            ) : (
              <BounceList items={bounces} />
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
