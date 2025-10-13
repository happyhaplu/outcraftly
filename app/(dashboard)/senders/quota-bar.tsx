import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type QuotaBarProps = {
  used: number;
  limit: number;
  className?: string;
};

export function QuotaBar({ used, limit, className }: QuotaBarProps) {
  const safeLimit = limit > 0 ? limit : 1;
  const percentage = Math.min(Math.max((used / safeLimit) * 100, 0), 100);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Quota usage</span>
        <span className="font-semibold text-foreground">{percentage.toFixed(0)}%</span>
      </div>
      <Progress value={used} max={safeLimit} />
      <p className="text-xs text-muted-foreground">{used} of {limit} emails used</p>
    </div>
  );
}
