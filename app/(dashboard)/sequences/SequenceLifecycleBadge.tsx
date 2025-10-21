import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { SequenceLifecycleStatus } from './types';

const STATUS_LABELS: Record<SequenceLifecycleStatus, string> = {
  active: 'Active',
  paused: 'Paused'
};

const STATUS_STYLES: Record<SequenceLifecycleStatus, string> = {
  active: 'border-emerald-200/80 bg-emerald-500/10 text-emerald-700',
  paused: 'border-amber-200/80 bg-amber-500/10 text-amber-700'
};

type SequenceLifecycleBadgeProps = {
  status: SequenceLifecycleStatus;
  className?: string;
};

export function SequenceLifecycleBadge({ status, className }: SequenceLifecycleBadgeProps) {
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
