import { cn } from '@/lib/utils';

const variantClasses = {
  success: 'border border-success/30 bg-success/10 text-success',
  warning: 'border border-amber-300 bg-amber-100/70 text-amber-700',
  danger: 'border border-destructive/30 bg-destructive/10 text-destructive'
} as const;

type BounceBadgeProps = {
  rate: number;
  className?: string;
};

function getVariant(rate: number) {
  if (rate < 2) {
    return 'success' as const;
  }
  if (rate <= 5) {
    return 'warning' as const;
  }
  return 'danger' as const;
}

export function BounceBadge({ rate, className }: BounceBadgeProps) {
  const variant = getVariant(rate);
  const rounded = Number.isFinite(rate) ? Math.max(rate, 0) : 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
        variantClasses[variant],
        className
      )}
    >
      {rounded.toFixed(1)}%
    </span>
  );
}
