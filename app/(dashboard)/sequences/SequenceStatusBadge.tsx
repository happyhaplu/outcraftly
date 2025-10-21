import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { SequenceDeliveryStatus } from './types';

const STATUS_LABELS: Record<SequenceDeliveryStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  replied: 'Replied',
  bounced: 'Bounced',
  failed: 'Failed',
  skipped: 'Skipped'
};

const STATUS_STYLES: Record<SequenceDeliveryStatus, string> = {
  pending: 'border-border/60 bg-muted/50 text-muted-foreground',
  sent: 'border-emerald-200/80 bg-emerald-500/10 text-emerald-600',
  replied: 'border-sky-200/80 bg-sky-500/10 text-sky-700',
  bounced: 'border-rose-300/80 bg-rose-500/10 text-rose-600',
  failed: 'border-orange-300/80 bg-orange-500/10 text-orange-600',
  skipped: 'border-border/50 bg-muted/30 text-muted-foreground'
};

type SequenceStatusBadgeProps = {
  status: SequenceDeliveryStatus;
  className?: string;
};

export function SequenceStatusBadge({ status, className }: SequenceStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
