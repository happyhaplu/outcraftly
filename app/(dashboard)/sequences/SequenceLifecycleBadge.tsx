import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { SequenceLifecycleStatus } from './types';

const STATUS_LABELS: Record<SequenceLifecycleStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused'
};

const STATUS_STYLES: Record<SequenceLifecycleStatus, string> = {
  draft: 'border-muted-foreground/40 bg-muted/30 text-muted-foreground',
  active: 'border-sky-200/80 bg-sky-500/10 text-sky-700',
  paused: 'border-zinc-200/80 bg-zinc-500/10 text-zinc-700'
};

type SequenceLifecycleBadgeProps = {
  status: SequenceLifecycleStatus;
  className?: string;
};

export function SequenceLifecycleBadge({ status, className }: SequenceLifecycleBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('capitalize', STATUS_STYLES[status], className)}
      aria-label={`Sequence status: ${STATUS_LABELS[status]}`}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
