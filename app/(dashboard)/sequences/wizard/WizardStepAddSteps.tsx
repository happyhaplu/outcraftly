import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { SequenceStepCard } from '../SequenceStepCard';
import type { BuilderStep, SequenceWizardState } from '../types';

export type WizardStepAddStepsProps = {
  state: Pick<SequenceWizardState, 'name' | 'steps'>;
  onNameChange: (name: string) => void;
  onUpdateStep: (id: string, updates: Partial<BuilderStep>) => void;
  onDuplicateStep: (id: string) => void;
  onDeleteStep: (id: string) => void;
  onAddStep: () => void;
  onMoveStep: (draggedId: string, targetId: string) => void;
  currentUserEmail?: string;
};

export function WizardStepAddSteps({
  state,
  onNameChange,
  onUpdateStep,
  onDuplicateStep,
  onDeleteStep,
  onAddStep,
  onMoveStep,
  currentUserEmail
}: WizardStepAddStepsProps) {
  const disableDelete = state.steps.length <= 1;

  const orderedSteps = useMemo(
    () => state.steps.slice().sort((a, b) => a.order - b.order),
    [state.steps]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="wizard-sequence-name">Sequence name</Label>
        <Input
          id="wizard-sequence-name"
          value={state.name}
          placeholder="e.g. Post-demo follow up"
          onChange={(event) => onNameChange(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Give your cadence a descriptive name so teammates can recognise it later.
        </p>
      </div>

      <div className="space-y-4">
        {orderedSteps.map((step, index) => {
          const previous = orderedSteps[index - 1];
          const canMoveUp = Boolean(previous);
          const canMoveDown = index < orderedSteps.length - 1;

          return (
            <SequenceStepCard
              key={step.internalId}
              step={step}
              index={index}
              totalSteps={orderedSteps.length}
              sequenceId={null}
              currentUserEmail={currentUserEmail}
              onUpdate={onUpdateStep}
              onDuplicate={onDuplicateStep}
              onDelete={onDeleteStep}
              onMoveUp={(id) => {
                if (!canMoveUp || !previous) {
                  return;
                }
                onMoveStep(id, previous.internalId);
              }}
              onMoveDown={(id) => {
                const next = orderedSteps[index + 1];
                if (!canMoveDown || !next) {
                  return;
                }
                onMoveStep(id, next.internalId);
              }}
              disableDelete={disableDelete}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
          );
        })}
      </div>

      <Button type="button" variant="secondary" onClick={onAddStep} className="gap-2">
        Add another touchpoint
      </Button>
    </div>
  );
}
