import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import type { SequenceStopCondition } from '../types';

export type WizardStepStopConditionsProps = {
  stopCondition: SequenceStopCondition;
  stopOnBounce: boolean;
  onStopConditionChange: (value: SequenceStopCondition) => void;
  onStopOnBounceChange: (value: boolean) => void;
};

const stopConditionCopy: Record<SequenceStopCondition, { title: string; description: string }> = {
  manual: {
    title: 'Manual control',
    description: 'Keep prospects moving unless you pause or remove them yourself.'
  },
  on_reply: {
    title: 'Stop when they reply',
    description: 'Automatically prevent future emails once we detect a reply from the prospect.'
  },
  on_reply_or_bounce: {
    title: 'Stop on reply or bounce',
    description: 'Protect deliverability by halting outreach when we detect a bounce event or a reply.'
  }
};

export function WizardStepStopConditions({ stopCondition, stopOnBounce, onStopConditionChange, onStopOnBounceChange }: WizardStepStopConditionsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-foreground">Automatic stop rules</Label>
        <RadioGroup
          value={stopCondition}
          onValueChange={(value) => onStopConditionChange(value as SequenceStopCondition)}
          className="space-y-3"
        >
          {(Object.keys(stopConditionCopy) as SequenceStopCondition[]).map((key) => {
            const copy = stopConditionCopy[key];
            const id = `wizard-stop-${key}`;
            return (
              <label
                key={key}
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-background px-5 py-4 text-left text-sm shadow-sm transition hover:border-primary/40"
              >
                <RadioGroupItem id={id} value={key} className="mt-1" />
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">{copy.title}</p>
                  <p className="text-xs text-muted-foreground">{copy.description}</p>
                </div>
              </label>
            );
          })}
        </RadioGroup>
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/10 px-5 py-4 shadow-sm">
        <label className="flex items-start gap-3" htmlFor="wizard-stop-bounce">
          <Checkbox
            id="wizard-stop-bounce"
            checked={stopOnBounce}
            onCheckedChange={(checked) => onStopOnBounceChange(Boolean(checked))}
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Cancel follow-ups after a bounce</p>
            <p className="text-xs text-muted-foreground">
              Contacts who bounce will be removed from future steps even if you keep the main sequence running. This helps protect sender reputation.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
