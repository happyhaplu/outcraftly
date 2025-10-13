'use client';

import { type ReactNode, useMemo } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Mail, MinusCircle, ShieldAlert, Timer } from 'lucide-react';

import { VerifyButton } from './verify-button';
import { SenderStats } from './sender-stats';
import type { SenderListItem } from './types';
import { SenderActions } from './sender-actions';
import { cn } from '@/lib/utils';

interface SenderListProps {
  initialSenders: SenderListItem[];
}

const statusConfig: Record<string, { label: string; className: string; icon: ReactNode }> = {
  active: {
    label: 'Active',
    className: 'border border-primary/20 bg-primary/10 text-primary',
    icon: <Timer className="h-3.5 w-3.5" />
  },
  verified: {
    label: 'Verified',
    className: 'border border-success/30 bg-success/10 text-success',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />
  },
  error: {
    label: 'Error',
    className: 'border border-destructive/30 bg-destructive/10 text-destructive',
    icon: <ShieldAlert className="h-3.5 w-3.5" />
  },
  disabled: {
    label: 'Disabled',
    className: 'border border-muted/60 bg-muted/20 text-muted-foreground',
    icon: <MinusCircle className="h-3.5 w-3.5" />
  }
};

const fetchSenders = async (): Promise<SenderListItem[]> => {
  const response = await fetch('/api/senders/stats');
  if (!response.ok) {
    throw new Error('Failed to load senders');
  }

  const payload = await response.json();
  return payload.senders as SenderListItem[];
};

export function SenderList({ initialSenders }: SenderListProps) {
  const {
    data: senders = [],
    mutate,
    isValidating
  } = useSWR<SenderListItem[]>('/api/senders/stats', fetchSenders, {
    fallbackData: initialSenders
  });

  const hasSenders = useMemo(() => senders.length > 0, [senders.length]);

  if (!hasSenders) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="size-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No sender accounts yet</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Add your first sender email to start delivering campaigns from Outcraftly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isValidating && (
        <p className="text-xs text-muted-foreground">Refreshing sender statuses…</p>
      )}
      <div className="grid gap-4">
        {senders.map((sender) => {
          const statusMeta = statusConfig[sender.status] ?? statusConfig.active;
          const isDisabled = sender.status === 'disabled';

          return (
            <div
              key={sender.id}
              className={cn(
                'rounded-2xl border border-border/70 bg-card/95 p-6 shadow-sm transition-shadow hover:shadow-lg',
                isDisabled && 'border-border/50 bg-muted/30 opacity-90'
              )}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-gradient-primary">
                    <Mail className="size-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">{sender.name}</p>
                    <p className="text-sm text-muted-foreground">{sender.email}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusMeta.className}`}
                  >
                    {statusMeta.icon}
                    {statusMeta.label}
                  </span>
                  <VerifyButton senderId={sender.id} currentStatus={sender.status} mutate={mutate} />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <SenderActions sender={sender} mutate={mutate} />
              </div>
              <SenderStats
                className="mt-6"
                bounceRate={sender.bounceRate}
                quotaUsed={sender.quotaUsed}
                quotaLimit={sender.quotaLimit}
              />
              <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SMTP host
                  </dt>
                  <dd className="text-sm font-medium text-foreground">{sender.host}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SMTP port
                  </dt>
                  <dd className="text-sm font-medium text-foreground">{sender.port}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Username
                  </dt>
                  <dd className="text-sm font-medium text-foreground">{sender.username}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Added on
                  </dt>
                  <dd className="text-sm font-medium text-foreground">
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    }).format(new Date(sender.createdAt))}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
