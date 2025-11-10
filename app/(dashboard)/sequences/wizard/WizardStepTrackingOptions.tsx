import { Checkbox } from '@/components/ui/checkbox';

import type { SequenceWizardTracking } from '../types';

export type WizardStepTrackingOptionsProps = {
  tracking: SequenceWizardTracking;
  onChange: (next: SequenceWizardTracking) => void;
};

export function WizardStepTrackingOptions({ tracking, onChange }: WizardStepTrackingOptionsProps) {
  const update = (key: keyof SequenceWizardTracking, value: boolean) => {
    onChange({ ...tracking, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <label className="flex items-start gap-3" htmlFor="wizard-track-opens">
          <Checkbox
            id="wizard-track-opens"
            checked={tracking.trackOpens}
            onCheckedChange={(checked) => update('trackOpens', Boolean(checked))}
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Track email opens</p>
            <p className="text-xs text-muted-foreground">
              Logs when a prospect opens an email so you can monitor engagement at each step.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <label className="flex items-start gap-3" htmlFor="wizard-track-clicks">
          <Checkbox
            id="wizard-track-clicks"
            checked={tracking.trackClicks}
            onCheckedChange={(checked) => update('trackClicks', Boolean(checked))}
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Track link clicks</p>
            <p className="text-xs text-muted-foreground">
              Adds tracking parameters to your links and records which prospects engage with calls-to-action.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <label className="flex items-start gap-3" htmlFor="wizard-enable-unsubscribe">
          <Checkbox
            id="wizard-enable-unsubscribe"
            checked={tracking.enableUnsubscribe}
            onCheckedChange={(checked) => update('enableUnsubscribe', Boolean(checked))}
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Include unsubscribe link</p>
            <p className="text-xs text-muted-foreground">
              Adds a footer link to help you stay compliant and automatically suppresses future sends when a contact opts out.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
