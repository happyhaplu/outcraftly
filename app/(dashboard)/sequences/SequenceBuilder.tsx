'use client';

import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

import { SequenceStepCard } from './SequenceStepCard';
import { BuilderStep, SequenceBuilderState } from './types';
import { validateBuilderSteps } from './utils';

type SequenceBuilderProps = {
  state: SequenceBuilderState;
  onNameChange: (name: string) => void;
  onSenderChange: (senderId: number | null) => void;
  onUpdateStep: (id: string, updates: Partial<BuilderStep>) => void;
  onDuplicateStep: (id: string) => void;
  onDeleteStep: (id: string) => void;
  onAddStep: () => void;
  onReorderSteps: (draggedId: string, targetId: string) => void;
  onSave: () => Promise<void>;
  onPreview: () => void;
  onCancel?: () => void;
  isSaving: boolean;
  isLoading: boolean;
  saveButtonLabel?: string;
  cancelButtonLabel?: string;
};

type SenderOption = {
  id: number;
  name: string;
  email: string;
  status: string;
};

const senderFetcher = async (url: string): Promise<SenderOption[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = typeof error?.error === 'string' ? error.error : 'Unable to load senders';
    throw new Error(message);
  }
  const payload = await response.json();
  const rawSenders = Array.isArray(payload.senders) ? payload.senders : [];
  return rawSenders.map((sender: any) => ({
    id: Number(sender.id),
    name: typeof sender.name === 'string' ? sender.name : 'Unknown sender',
    email: typeof sender.email === 'string' ? sender.email : 'unknown@example.com',
    status: typeof sender.status === 'string' ? sender.status : 'inactive'
  }));
};

export function SequenceBuilder({
  state,
  onNameChange,
  onSenderChange,
  onUpdateStep,
  onDuplicateStep,
  onDeleteStep,
  onAddStep,
  onReorderSteps,
  onSave,
  onPreview,
  onCancel,
  isSaving,
  isLoading,
  saveButtonLabel,
  cancelButtonLabel
}: SequenceBuilderProps) {
  const { toast } = useToast();
  const { data: currentUser } = useSWR<{ email?: string } | null>(
    '/api/user',
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }
      return response.json().catch(() => null);
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false
    }
  );

  const {
    data: senderOptions,
    error: senderError
  } = useSWR<SenderOption[]>('/api/senders', senderFetcher, {
    revalidateOnFocus: false
  });

  const isSenderLoading = typeof senderOptions === 'undefined' && !senderError;

  const eligibleSenders = useMemo(
    () => (senderOptions ?? []).filter((sender) => ['active', 'verified'].includes(sender.status)),
    [senderOptions]
  );

  const currentSender = useMemo(
    () => (senderOptions ?? []).find((sender) => sender.id === state.senderId) ?? null,
    [senderOptions, state.senderId]
  );

  const senderChoices = useMemo(() => {
    if (!senderOptions) {
      return [] as SenderOption[];
    }
    const map = new Map<number, SenderOption>();
    eligibleSenders.forEach((sender) => map.set(sender.id, sender));
    if (currentSender) {
      map.set(currentSender.id, currentSender);
    }
    return Array.from(map.values());
  }, [currentSender, eligibleSenders, senderOptions]);

  const hasEligibleSelection = useMemo(() => {
    if (state.senderId == null) {
      return false;
    }
    if (!senderOptions) {
      return true;
    }
    return eligibleSenders.some((sender) => sender.id === state.senderId);
  }, [eligibleSenders, senderOptions, state.senderId]);

  useEffect(() => {
    if (state.senderId == null && eligibleSenders.length > 0) {
      onSenderChange(eligibleSenders[0].id);
    }
  }, [eligibleSenders, onSenderChange, state.senderId]);

  const canSave = useMemo(
    () =>
      state.name.trim().length > 0 &&
      hasEligibleSelection &&
      validateBuilderSteps(state.steps),
    [hasEligibleSelection, state.name, state.steps]
  );

  const effectiveSaveLabel = saveButtonLabel ?? 'Save sequence';
  const effectiveCancelLabel = cancelButtonLabel ?? 'Cancel';
  const showCancel = typeof onCancel === 'function';

  const handleSave = async () => {
    if (isLoading) {
      return;
    }

    if (!canSave) {
      const missingSender = !hasEligibleSelection;
      toast({
        title: 'Missing details',
        description: missingSender
          ? 'Add a sender account under Outreach > Senders and pick it here before saving.'
          : 'Give the sequence a name and ensure every step has a subject, body, and delay.',
        variant: 'destructive'
      });
      return;
    }

    await onSave();
  };

  const disableDelete = state.steps.length === 1;

  const handleMoveStep = (stepId: string, direction: 'up' | 'down') => {
    const currentIndex = state.steps.findIndex((item) => item.internalId === stepId);
    if (currentIndex === -1) {
      return;
    }
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= state.steps.length) {
      return;
    }
    const targetStep = state.steps[targetIndex];
    onReorderSteps(stepId, targetStep.internalId);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-xl border border-border/60 bg-muted/30 p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="sequence-name">Sequence name</Label>
            <Input
              id="sequence-name"
              value={state.name}
              placeholder="e.g. Post-demo follow up"
              onChange={(event) => onNameChange(event.target.value)}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sequence-sender">Sender account</Label>
            {isSenderLoading ? (
              <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/10 px-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Loading senders...
              </div>
            ) : (
              <select
                id="sequence-sender"
                value={state.senderId ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  onSenderChange(value ? Number(value) : null);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={Boolean(senderError) || senderChoices.length === 0}
              >
                <option value="" disabled>
                  {senderError
                    ? 'Unable to load senders'
                    : senderChoices.length === 0
                      ? 'No sender available'
                      : 'Select sender'}
                </option>
                {senderChoices.map((sender) => {
                  const isEligible = ['active', 'verified'].includes(sender.status);
                  const label = `${sender.name} (${sender.email})${isEligible ? '' : ` - ${sender.status}`}`;
                  return (
                    <option key={sender.id} value={sender.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            )}
            {senderError ? (
              <p className="text-xs text-destructive">
                {senderError instanceof Error ? senderError.message : 'Unable to load sender accounts.'}
              </p>
            ) : null}
            {!senderError && !isSenderLoading && senderChoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add a sender under Outreach &gt; Senders before launching a sequence.
              </p>
            ) : null}
            {Array.isArray(senderOptions) && senderOptions.length > 0 && state.senderId != null && !hasEligibleSelection ? (
              <p className="text-xs text-destructive">
                The selected sender is not active or verified. Choose another account before saving.
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            {showCancel ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={isSaving}
              >
                {effectiveCancelLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onPreview}
              disabled={state.steps.length === 0 || isLoading}
            >
              Preview
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving || !canSave || isLoading}>
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Saving...
                </span>
              ) : (
                effectiveSaveLabel
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Build each touchpoint, use tokens to personalise at scale, and define the wait time before every send.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading sequence...
        </div>
      ) : (
        <div className="space-y-4">
          {state.steps.map((step, index) => (
            <SequenceStepCard
              key={step.internalId}
              step={step}
              index={index}
              totalSteps={state.steps.length}
              sequenceId={state.id}
              currentUserEmail={typeof currentUser?.email === 'string' ? currentUser.email : undefined}
              onUpdate={onUpdateStep}
              onDuplicate={onDuplicateStep}
              onDelete={onDeleteStep}
              disableDelete={disableDelete}
              onMoveUp={(id) => handleMoveStep(id, 'up')}
              onMoveDown={(id) => handleMoveStep(id, 'down')}
              canMoveUp={index > 0}
              canMoveDown={index < state.steps.length - 1}
            />
          ))}

          <Button type="button" variant="secondary" className="gap-2" onClick={onAddStep}>
            <Plus className="h-4 w-4" aria-hidden />
            Add step
          </Button>
        </div>
      )}
    </div>
  );
}
