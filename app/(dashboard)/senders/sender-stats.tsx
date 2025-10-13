import { Info } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { BounceBadge } from './bounce-badge';
import { QuotaBar } from './quota-bar';

type SenderStatsProps = {
  bounceRate: number;
  quotaUsed: number;
  quotaLimit: number;
  className?: string;
};

export function SenderStats({ bounceRate, quotaUsed, quotaLimit, className }: SenderStatsProps) {
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={50}>
      <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Info className="h-4 w-4 text-primary" aria-hidden />
                <span>Bounce rate</span>
              </div>
              <BounceBadge rate={bounceRate} />
            </div>
          </TooltipTrigger>
          <TooltipContent>Bounced emails divided by total emails sent.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
              <QuotaBar used={quotaUsed} limit={quotaLimit} />
            </div>
          </TooltipTrigger>
          <TooltipContent>Daily email quota consumption for this sender.</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
