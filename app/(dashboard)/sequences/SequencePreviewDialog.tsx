'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

import { formatDelay, highlightTokens } from './utils';
import { BuilderStep } from './types';

type SequencePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sequenceName: string;
  steps: BuilderStep[];
};

export function SequencePreviewDialog({ open, onOpenChange, sequenceName, steps }: SequencePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview: {sequenceName || 'Untitled sequence'}</DialogTitle>
          <DialogDescription>
            Review the timing and messaging for each touchpoint before launching your campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add at least one step to see a preview.</p>
          ) : (
            <ol className="space-y-5">
              {steps.map((step, index) => {
                const delayLabel = formatDelay(step.delayUnit === 'days' ? step.delayValue * 24 : step.delayValue);
                const conditionBadges: string[] = [];
                if (step.skipIfReplied) {
                  conditionBadges.push('Skip after reply');
                }
                if (step.skipIfBounced) {
                  conditionBadges.push('Skip after bounce');
                }
                if (typeof step.delayIfReplied === 'number' && step.delayIfReplied > 0) {
                  conditionBadges.push(`Pause ${formatDelay(step.delayIfReplied)}`);
                }
                return (
                  <li
                    key={step.internalId}
                    className="rounded-xl border border-border/60 bg-muted/20 p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{step.subject || 'Untitled step'}</p>
                          <p className="text-xs text-muted-foreground">{delayLabel}</p>
                        </div>
                      </div>
                      <Badge variant="secondary">Email step</Badge>
                    </div>

                    {conditionBadges.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {conditionBadges.map((badge) => (
                          <Badge key={`${step.internalId}-${badge}`} variant="outline">
                            {badge}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 space-y-2 rounded-lg border border-border/40 bg-background px-4 py-3 text-sm leading-relaxed text-foreground">
                      <p
                        className="font-medium"
                        dangerouslySetInnerHTML={{ __html: highlightTokens(step.subject || 'Untitled subject') }}
                      />
                      <div
                        className="whitespace-pre-wrap text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: highlightTokens(step.body || '') }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
