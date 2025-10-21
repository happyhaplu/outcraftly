'use client';

import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { SequenceSummary } from './types';
import { SequenceLifecycleBadge } from './SequenceLifecycleBadge';

type SequenceListProps = {
  sequences: SequenceSummary[];
  selectedId: string | null;
  onSelect: (sequenceId: string) => void;
  onCreateNew: () => void;
  isLoading: boolean;
};

function formatRelativeLabel(timestamp: string | undefined) {
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

export function SequenceList({ sequences, selectedId, onSelect, onCreateNew, isLoading }: SequenceListProps) {
  return (
    <Card className="border-border/70">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-xl">Sequences</CardTitle>
          <p className="text-sm text-muted-foreground">Pick a flow to edit or spin up a fresh automation.</p>
        </div>
        <Button type="button" onClick={onCreateNew} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          Create new sequence
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && sequences.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading sequences...
          </div>
        ) : sequences.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            You haven&apos;t created any sequences yet. Start from a blank canvas to build your first outreach flow.
          </div>
        ) : (
          <ul className="space-y-2">
            {sequences.map((sequence) => {
              const isActive = sequence.id === selectedId;
              const updatedLabel = formatRelativeLabel(sequence.updatedAt ?? sequence.createdAt);

              return (
                <li key={sequence.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(sequence.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isActive ? 'border-primary/50 bg-primary/5 text-primary' : 'border-border/60 bg-background text-foreground hover:border-primary/40'
                    }`}
                  >
                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-semibold">{sequence.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {sequence.sender
                          ? `${sequence.sender.name} · ${sequence.sender.email}`
                          : 'No sender assigned'}
                      </p>
                      <p className="text-xs text-muted-foreground/80">Updated {updatedLabel}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs sm:text-sm">
                      <SequenceLifecycleBadge status={sequence.status} />
                      <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
                        {sequence.stepCount} {sequence.stepCount === 1 ? 'step' : 'steps'}
                      </span>
                      <Link
                        href={`/sequences/${sequence.id}`}
                        className="font-semibold text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Edit
                      </Link>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
