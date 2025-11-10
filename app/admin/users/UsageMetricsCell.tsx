import { memo } from 'react';

import { Progress } from '@/components/ui/progress';

const numberFormatter = new Intl.NumberFormat('en-US');
const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

export type UsageMetric = {
  used: number;
  limit: number;
  helper?: string;
  cycleStart?: Date | null;
};

type Props = {
  metric: UsageMetric | null;
  emptyLabel?: string;
};

function UsageMetricsCellComponent({ metric, emptyLabel = 'No workspace data' }: Props) {
  if (!metric) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  const { used, limit, helper, cycleStart } = metric;
  const hasLimit = limit > 0;
  const safeUsed = used < 0 ? 0 : used;
  const safeLimit = limit < 0 ? 0 : limit;
  const ratio = hasLimit && safeLimit > 0 ? safeUsed / safeLimit : 0;
  const progress = hasLimit ? Math.min(100, Math.max(0, ratio * 100)) : 0;
  const rawPercent = hasLimit ? Math.round(ratio * 100) : null;
  const percentLabel =
    rawPercent != null ? `${rawPercent > 999 ? 999 : rawPercent < 0 ? 0 : rawPercent}%` : null;

  let tone = 'text-muted-foreground';
  if (hasLimit) {
    if (ratio >= 1) {
      tone = 'text-destructive';
    } else if (ratio >= 0.9) {
      tone = 'text-amber-500';
    }
  }

  const helperParts: string[] = [];
  if (helper) {
    helperParts.push(helper);
  }
  if (cycleStart instanceof Date && !Number.isNaN(cycleStart.getTime())) {
    helperParts.push(`Since ${monthDayFormatter.format(cycleStart)}`);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-foreground">
          {numberFormatter.format(Math.max(0, safeUsed))}
          {hasLimit ? ` / ${numberFormatter.format(Math.max(0, safeLimit))}` : ''}
        </span>
        {percentLabel && <span className={`text-xs font-semibold ${tone}`}>{percentLabel}</span>}
      </div>
      {hasLimit && <Progress value={progress} className="h-1.5" />}
      {helperParts.length > 0 && (
        <p className="text-[11px] leading-tight text-muted-foreground">
          {helperParts.join(' • ')}
        </p>
      )}
    </div>
  );
}

export const UsageMetricsCell = memo(UsageMetricsCellComponent);

UsageMetricsCell.displayName = 'UsageMetricsCell';
