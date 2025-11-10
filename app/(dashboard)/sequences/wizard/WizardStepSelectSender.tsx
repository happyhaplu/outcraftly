import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export type WizardSenderOption = {
  id: number;
  name: string;
  email: string;
  status: string;
};

export type WizardStepSelectSenderProps = {
  senders: WizardSenderOption[];
  selectedSenderId: number | null;
  onSelect: (senderId: number) => void;
  isLoading: boolean;
  error: string | null;
};

const statusLabels: Record<string, string> = {
  verified: 'Verified',
  active: 'Active',
  pending: 'Pending verification',
  disabled: 'Disabled'
};

export function WizardStepSelectSender({ senders, selectedSenderId, onSelect, isLoading, error }: WizardStepSelectSenderProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading sender accounts...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (senders.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
        You don&apos;t have any active sender accounts yet. Head to Outreach → Senders to connect or verify an inbox before launching a sequence.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {senders.map((sender) => {
        const isSelected = selectedSenderId === sender.id;
        const isEligible = ['verified', 'active'].includes(sender.status);
        const label = statusLabels[sender.status] ?? sender.status;

        return (
          <button
            key={sender.id}
            type="button"
            onClick={() => onSelect(sender.id)}
            className={cn(
              'w-full rounded-2xl border px-4 py-4 text-left shadow-sm transition-colors',
              isSelected ? 'border-primary/60 bg-primary/10' : 'border-border/60 bg-background hover:border-primary/40'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{sender.name}</p>
                <p className="text-xs text-muted-foreground">{sender.email}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                  isEligible ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/15 text-amber-800'
                )}
              >
                {label}
              </span>
            </div>
            {!isEligible ? (
              <p className="mt-2 text-xs text-destructive">
                This sender is not ready yet. Verify the inbox or switch to an active sender before launching.
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
