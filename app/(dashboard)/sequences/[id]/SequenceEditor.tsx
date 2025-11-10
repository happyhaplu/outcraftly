'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { SequenceBuilder } from '../SequenceBuilder';
import { SequencePreviewDialog } from '../SequencePreviewDialog';
import { SequenceStatusView } from '../SequenceStatusView';
import { useSequenceBuilderState } from '../use-sequence-builder';
import {
  arePayloadsEqual,
  buildPayloadFromState,
  createBlankState,
  mapDetailToBuilder,
  type SequenceUpdatePayload
} from '../utils';
import type { SequenceDetail } from '../types';

type SequenceEditorProps = {
  sequenceId: string;
  initialSequence: SequenceDetail;
};

export function SequenceEditor({ sequenceId, initialSequence }: SequenceEditorProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const blankBuilderState = useMemo(() => createBlankState(), []);
  const initialBuilderState = useMemo(() => mapDetailToBuilder(initialSequence), [initialSequence]);

  const {
    state: builderState,
    setName: handleNameChange,
    setSenderId: handleSenderChange,
    setLaunchAt: handleLaunchAtChange,
    setMinGapMinutes: handleMinGapMinutesChange,
    updateStep: handleUpdateStep,
    duplicateStep: handleDuplicateStep,
    deleteStep: handleDeleteStep,
    addStep: handleAddStep,
    reorderSteps: handleReorderSteps,
    resetState: resetBuilderState,
    // contact enrollment moved to Sequence Status view
  } = useSequenceBuilderState(blankBuilderState);

  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isDiscardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'builder' | 'status'>('builder');

  const baselinePayloadRef = useRef<SequenceUpdatePayload | null>(null);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    resetBuilderState(initialBuilderState);
    const baseline = buildPayloadFromState(initialBuilderState);
    baselinePayloadRef.current = baseline;
    console.log('[SequenceEditor] hydrated initial builder state', initialBuilderState);
  }, [initialBuilderState, isHydrated, resetBuilderState]);

  const isDirty = useMemo(() => {
    if (!baselinePayloadRef.current) {
      return false;
    }
    const payload = buildPayloadFromState(builderState);
    return !arePayloadsEqual(payload, baselinePayloadRef.current);
  }, [builderState]);

  const handleSave = useCallback(async () => {
    if (!isHydrated || !baselinePayloadRef.current) {
      console.warn('[SequenceEditor] skipping save before hydration');
      return;
    }
    const payload = buildPayloadFromState(builderState);
    console.log('[SequenceEditor] save payload', payload);

    if (!payload.name || payload.steps.length === 0) {
      toast({
        title: 'Missing details',
        description: 'Give the sequence a name and ensure every step has content before saving.',
        variant: 'destructive'
      });
      return;
    }

    if (!builderState.senderId) {
      toast({
        title: 'Select a sender',
        description: 'Choose a verified or active sender account before saving this sequence.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/sequences/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sequenceId, ...payload })
      });

      const data = await response.json().catch(() => ({}));
      console.log('[SequenceEditor] save response', { ok: response.ok, data });
      if (!response.ok) {
        toast({
          title: 'Unable to save sequence',
          description: typeof data.error === 'string' ? data.error : 'Please try again in a moment.',
          variant: 'destructive'
        });
        return;
      }

      const sequence = data.sequence as SequenceDetail;
      const normalized = mapDetailToBuilder(sequence);

      resetBuilderState(normalized);
      baselinePayloadRef.current = buildPayloadFromState(normalized);

      toast({
        title: 'Sequence updated',
        description: 'Changes saved successfully.'
      });

      router.refresh();
    } catch (error) {
      console.error('Failed to update sequence', error);
      toast({
        title: 'Unable to save sequence',
        description: 'Please try again in a moment.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  }, [baselinePayloadRef, builderState, isHydrated, resetBuilderState, router, sequenceId, toast]);

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setDiscardDialogOpen(true);
      return;
    }
    router.push('/sequences');
  }, [isDirty, router]);

  const confirmDiscard = useCallback(() => {
    setDiscardDialogOpen(false);
    router.push('/sequences');
  }, [router]);

  const closeDiscardDialog = useCallback(() => {
    setDiscardDialogOpen(false);
  }, []);

  const previewSteps = useMemo(() => builderState.steps, [builderState.steps]);
  const statusTabDisabled = !sequenceId;

  if (!isHydrated || !baselinePayloadRef.current) {
    return (
      <div className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          Preparing sequence editor...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-full bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveSection('builder')}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                activeSection === 'builder'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-pressed={activeSection === 'builder'}
            >
              Sequence builder
            </button>
            <button
              type="button"
              onClick={() => {
                if (!statusTabDisabled) {
                  setActiveSection('status');
                }
              }}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                activeSection === 'status'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                statusTabDisabled && 'cursor-not-allowed opacity-60'
              )}
              aria-pressed={activeSection === 'status'}
              disabled={statusTabDisabled}
            >
              Sequence status
            </button>
          </div>
        </div>

        {activeSection === 'builder' ? (
          <SequenceBuilder
            state={builderState}
            onNameChange={handleNameChange}
            onSenderChange={handleSenderChange}
            onMinGapMinutesChange={handleMinGapMinutesChange}
            onUpdateStep={handleUpdateStep}
            onDuplicateStep={handleDuplicateStep}
            onDeleteStep={handleDeleteStep}
            onAddStep={handleAddStep}
            onReorderSteps={handleReorderSteps}
            onLaunchAtChange={handleLaunchAtChange}
            onSave={handleSave}
            onPreview={() => setPreviewOpen(true)}
            onCancel={handleCancel}
            isSaving={isSaving}
            isLoading={false}
            saveButtonLabel="Save changes"
          />
        ) : (
          <SequenceStatusView sequenceId={sequenceId} />
        )}
      </div>

      <SequencePreviewDialog
        open={isPreviewOpen}
        onOpenChange={setPreviewOpen}
        sequenceName={builderState.name}
        steps={previewSteps}
      />

      <AlertDialog open={isDiscardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits. If you leave now, your latest changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDiscardDialog}>Continue editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard} variant="destructive">
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
