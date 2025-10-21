'use client';

import { Reply, XCircle, Loader2, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
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
    <ul className="space-y-4 text-sm">
      {items.map((reply) => (
        <li key={reply.id} className="rounded-lg border border-border/60 bg-background px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{buildDisplayName(reply)}</p>
              <p className="text-xs text-muted-foreground">{reply.email}</p>
            </div>
            <span className="text-xs text-muted-foreground">{formatDateTime(reply.occurredAt)}</span>
          </div>
          {reply.stepSubject ? (
            <p className="mt-2 text-xs text-muted-foreground/80">Replied to: {reply.stepSubject}</p>
          ) : null}
          {reply.subject ? (
            <p className="mt-2 text-sm font-medium text-foreground">{reply.subject}</p>
          ) : null}
          {reply.snippet ? (
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{reply.snippet}</p>
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
    <ul className="space-y-4 text-sm">
      {items.map((bounce) => (
        <li key={bounce.id} className="rounded-lg border border-border/60 bg-background px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{buildDisplayName(bounce)}</p>
              <p className="text-xs text-muted-foreground">{bounce.email}</p>
            </div>
            <span className="text-xs text-muted-foreground">{formatDateTime(bounce.occurredAt)}</span>
          </div>
          {bounce.stepSubject ? (
            <p className="mt-2 text-xs text-muted-foreground/80">Bounce detected on: {bounce.stepSubject}</p>
          ) : null}
          {bounce.reason ? (
            <p className="mt-2 text-sm font-medium text-foreground">Reason: {bounce.reason}</p>
          ) : (
            <p className="mt-2 text-sm font-medium text-foreground">Bounce detected</p>
          )}
          {bounce.detail ? (
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{bounce.detail}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SequenceEngagementPanel({ sequenceId }: SequenceEngagementPanelProps) {
  const { data, error, isLoading, isValidating, refresh } = useSequenceReplies(sequenceId);

  const replies = data?.replies ?? [];
  const bounces = data?.bounces ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Reply className="h-4 w-4" aria-hidden />
              Recent replies
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => refresh()}
              disabled={isValidating}
            >
              {isValidating ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Updating
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <RefreshCcw className="h-3 w-3" aria-hidden />
                  Refresh
                </span>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Track replies as they arrive and follow up while interest is high.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading replies...
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-xs text-destructive">
              Unable to load replies. Please try again.
            </div>
          ) : (
            <ReplyList items={replies} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <XCircle className="h-4 w-4" aria-hidden />
            Recent bounces
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Identify deliverability issues quickly and keep your sender reputation healthy.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading bounces...
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-xs text-destructive">
              Unable to load bounces. Please try again.
            </div>
          ) : (
            <BounceList items={bounces} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
