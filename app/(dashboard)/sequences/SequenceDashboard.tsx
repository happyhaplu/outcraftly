'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { SequenceBuilder } from './SequenceBuilder';
import { SequenceList } from './SequenceList';
import { SequencePreviewDialog } from './SequencePreviewDialog';
import { SequenceStatusView } from './SequenceStatusView';
import { SequenceDetail, SequenceSummary, type SequenceSender } from './types';
import { buildPayloadFromState, createBlankState, mapDetailToBuilder } from './utils';
import { useSequenceBuilderState } from './use-sequence-builder';

const normaliseSender = (raw: any): SequenceSender | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = typeof raw.id === 'number' && Number.isFinite(raw.id)
    ? raw.id
    : typeof raw.id === 'string' && raw.id.trim().length > 0
      ? Number(raw.id)
      : null;
  if (id == null || !Number.isFinite(id)) {
    return null;
  }
  const name = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : 'Unknown sender';
  const email = typeof raw.email === 'string' ? raw.email : '';
  const status = typeof raw.status === 'string' ? raw.status : 'inactive';
  return {
    id: Number(id),
    name,
    email,
    status
  };
};

const mapSequenceSummary = (sequence: any): SequenceSummary => {
  const id = typeof sequence.id === 'string' ? sequence.id : String(sequence.id ?? '');
  const createdAt = typeof sequence.createdAt === 'string' ? sequence.createdAt : new Date().toISOString();
  const updatedAt = typeof sequence.updatedAt === 'string' ? sequence.updatedAt : createdAt;
  const senderId = typeof sequence.senderId === 'number' ? sequence.senderId : null;

  return {
    id,
    name: typeof sequence.name === 'string' ? sequence.name : 'Untitled sequence',
    status: sequence.status === 'paused' ? 'paused' : 'active',
    createdAt,
    updatedAt,
  senderId,
    sender: normaliseSender(sequence.sender),
    stepCount: Number(sequence.stepCount ?? 0)
  };
};

const mapSequenceDetail = (payload: any): SequenceDetail => {
  const sequence = payload?.sequence ?? payload;
  const id = typeof sequence.id === 'string' ? sequence.id : String(sequence.id ?? '');
  const createdAt = typeof sequence.createdAt === 'string' ? sequence.createdAt : new Date().toISOString();
  const updatedAt = typeof sequence.updatedAt === 'string' ? sequence.updatedAt : createdAt;
  const senderId = typeof sequence.senderId === 'number' ? sequence.senderId : null;

  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];

  return {
    id,
    name: typeof sequence.name === 'string' ? sequence.name : 'Untitled sequence',
    status: sequence.status === 'paused' ? 'paused' : 'active',
    createdAt,
    updatedAt,
  senderId,
    sender: normaliseSender(sequence.sender),
    steps: steps.map((step: any) => ({
      id: typeof step.id === 'string' ? step.id : undefined,
      subject: typeof step.subject === 'string' ? step.subject : '',
      body: typeof step.body === 'string' ? step.body : '',
      delayHours: Number(step.delayHours ?? step.delay ?? 0) || 0,
      order: Number(step.order ?? 0) || 0,
      skipIfReplied: Boolean(step.skipIfReplied),
      skipIfBounced: Boolean(step.skipIfBounced),
      delayIfReplied: typeof step.delayIfReplied === 'number' ? step.delayIfReplied : null
    }))
  };
};

const listFetcher = async (url: string): Promise<SequenceSummary[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load sequences');
  }
  const payload = await response.json();
  const sequences = Array.isArray(payload.sequences) ? payload.sequences : [];
  return sequences.map(mapSequenceSummary);
};

const detailFetcher = async (url: string): Promise<SequenceDetail> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) {
    throw new Error('Sequence not found');
  }
  if (!response.ok) {
    throw new Error('Failed to load sequence');
  }
  const payload = await response.json();
  return mapSequenceDetail(payload);
};

type SequenceDashboardProps = {
  initialSequences: SequenceSummary[];
};

export function SequenceDashboard({ initialSequences }: SequenceDashboardProps) {
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(initialSequences[0]?.id ?? null);
  const {
    state: builderState,
    setName: handleNameChange,
    setSenderId: handleSenderChange,
    updateStep: handleUpdateStep,
    duplicateStep: handleDuplicateStep,
    deleteStep: handleDeleteStep,
    addStep: handleAddStep,
    reorderSteps: handleReorderSteps,
    resetState: resetBuilderState
  } = useSequenceBuilderState(createBlankState());
  const [isSequenceLoading, setSequenceLoading] = useState<boolean>(Boolean(initialSequences[0]?.id));
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'builder' | 'status'>('builder');

  const {
    data: sequences = initialSequences,
    isValidating: listValidating,
    mutate: mutateSequences
  } = useSWR<SequenceSummary[]>('/api/sequences/list', listFetcher, {
    fallbackData: initialSequences
  });

  const {
    data: activeSequence,
    isValidating: detailValidating,
    error: sequenceError,
    mutate: mutateActiveSequence
  } = useSWR<SequenceDetail>(selectedId ? `/api/sequences/get/${selectedId}` : null, detailFetcher);

  useEffect(() => {
    if (sequenceError) {
      toast({
        title: 'Sequence unavailable',
        description: 'The selected sequence could not be loaded. It may have been removed.',
        variant: 'destructive'
      });
      resetBuilderState(createBlankState());
      setSelectedId(null);
      setSequenceLoading(false);
      setActiveSection('builder');
    }
  }, [resetBuilderState, sequenceError, toast]);

  useEffect(() => {
    if (!selectedId) {
      resetBuilderState(createBlankState());
      setSequenceLoading(false);
      setActiveSection('builder');
      return;
    }

    if (!activeSequence) {
      setSequenceLoading(true);
      return;
    }

    resetBuilderState(mapDetailToBuilder(activeSequence));
    setSequenceLoading(false);
  }, [activeSequence, resetBuilderState, selectedId]);

  const handleSelectSequence = useCallback((sequenceId: string) => {
    setSelectedId(sequenceId);
  }, []);

  const handleCreateNew = useCallback(() => {
    setSelectedId(null);
    resetBuilderState(createBlankState());
    setSequenceLoading(false);
    setActiveSection('builder');
  }, [resetBuilderState]);

  const handleSave = useCallback(async () => {
    const payload = buildPayloadFromState(builderState);

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
      const endpoint = builderState.id ? '/api/sequences/update' : '/api/sequences/create';
      const method = builderState.id ? 'PATCH' : 'POST';
      const body = builderState.id ? { id: builderState.id, ...payload } : payload;

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({
          title: 'Unable to save sequence',
          description: typeof data.error === 'string' ? data.error : 'Please try again in a moment.',
          variant: 'destructive'
        });
        return;
      }

      const sequence = mapSequenceDetail(data);
      const normalized = mapDetailToBuilder(sequence);

      resetBuilderState(normalized);
      setSelectedId(normalized.id ?? null);

      if (builderState.id) {
        await mutateActiveSequence(sequence, { revalidate: false });
      }
      await mutateSequences();

      toast({
        title: 'Sequence saved',
        description: 'Your changes have been stored successfully.'
      });
    } catch (error) {
      console.error('Failed to save sequence', error);
      toast({
        title: 'Unable to save sequence',
        description: 'Please try again in a moment.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  }, [builderState, mutateActiveSequence, mutateSequences, resetBuilderState, toast]);

  const previewSteps = useMemo(() => builderState.steps, [builderState.steps]);

  const isLoading = isSequenceLoading || detailValidating;
  const statusTabDisabled = !selectedId;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <SequenceList
        sequences={sequences}
        selectedId={selectedId}
        onSelect={handleSelectSequence}
        onCreateNew={handleCreateNew}
        isLoading={listValidating}
      />

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

        {activeSection === 'builder' || !selectedId ? (
          <SequenceBuilder
            state={builderState}
            onNameChange={handleNameChange}
            onSenderChange={handleSenderChange}
            onUpdateStep={handleUpdateStep}
            onDuplicateStep={handleDuplicateStep}
            onDeleteStep={handleDeleteStep}
            onAddStep={handleAddStep}
            onReorderSteps={handleReorderSteps}
            onSave={handleSave}
            onPreview={() => setPreviewOpen(true)}
            isSaving={isSaving}
            isLoading={isLoading}
          />
        ) : (
          <SequenceStatusView sequenceId={selectedId} />
        )}
      </div>

      <SequencePreviewDialog
        open={isPreviewOpen}
        onOpenChange={setPreviewOpen}
        sequenceName={builderState.name}
        steps={previewSteps}
      />
    </div>
  );
}
