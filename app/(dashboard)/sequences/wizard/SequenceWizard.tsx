'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useSWRConfig } from 'swr';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import type { SequenceStopCondition, SequenceWizardState } from '../types';
import { validateBuilderSteps } from '../utils';
import { WizardStepAddSteps } from './WizardStepAddSteps';
import { WizardStepEnrollProspects } from './WizardStepEnrollProspects';
import type { WizardContact } from './WizardStepEnrollProspects';
import { fetchContacts, fetchCurrentUser, fetchTags, type CurrentUserResponse } from './data-fetchers';
import { filterContacts } from './contact-utils';
import { WizardStepReviewSubmit } from './WizardStepReviewSubmit';
import { WizardStepSchedule } from './WizardStepSchedule';
import { WizardStepSelectSender } from './WizardStepSelectSender';
import type { WizardSenderOption } from './WizardStepSelectSender';
import { WizardStepStopConditions } from './WizardStepStopConditions';
import { WizardStepTrackingOptions } from './WizardStepTrackingOptions';
import { buildCreatePayloadFromWizardState, useSequenceWizardState } from './use-sequence-wizard-state';

const STORAGE_VERSION = 1;
const STORAGE_KEY = 'outcraftly.sequenceWizardDraft';

type StoredDraftPayload = {
  version: number;
  state: SequenceWizardState;
};

const isBrowser = () => typeof window !== 'undefined';

function readDraftFromStorage(): SequenceWizardState | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredDraftPayload> | null;
    if (!parsed || parsed.version !== STORAGE_VERSION || !parsed.state) {
      return null;
    }
    return parsed.state;
  } catch (error) {
    console.warn('Failed to parse sequence wizard draft from storage', error);
    return null;
  }
}

function writeDraftToStorage(state: SequenceWizardState) {
  if (!isBrowser()) {
    return;
  }
  try {
    const payload: StoredDraftPayload = { version: STORAGE_VERSION, state };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist sequence wizard draft', error);
  }
}

function clearDraftFromStorage() {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear sequence wizard draft', error);
  }
}

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

type SenderApiResponse = {
  senders: Array<{
    id: number | string;
    name: string;
    email: string;
    status: string;
  }>;
};

const fetchSenders = async (url: string): Promise<WizardSenderOption[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload?.error === 'string' ? payload.error : 'Unable to load senders.';
    throw new Error(message);
  }
  const payload = (await response.json().catch(() => ({}))) as SenderApiResponse;
  const rawSenders = Array.isArray(payload?.senders) ? payload.senders : [];
  return rawSenders.map((sender) => ({
    id: Number(sender.id),
    name: typeof sender.name === 'string' ? sender.name : 'Unknown sender',
    email: typeof sender.email === 'string' ? sender.email : 'unknown@example.com',
    status: typeof sender.status === 'string' ? sender.status : 'inactive'
  }));
};

type WizardStepDefinition = {
  id: 'compose' | 'sender' | 'prospects' | 'schedule' | 'tracking' | 'stop' | 'review';
  title: string;
  description: string;
};

const wizardSteps: WizardStepDefinition[] = [
  {
    id: 'compose',
    title: 'Build touchpoints',
    description: 'Draft the emails prospects will receive during this sequence.'
  },
  {
    id: 'sender',
    title: 'Select sender',
    description: 'Choose whose inbox will send these emails.'
  },
  {
    id: 'prospects',
    title: 'Enroll prospects',
    description: 'Optionally pick the contacts to enroll right away.'
  },
  {
    id: 'schedule',
    title: 'Schedule delivery',
    description: 'Decide when contacts enter and whether to respect their timezone.'
  },
  {
    id: 'tracking',
    title: 'Tracking',
    description: 'Control opens, click tracking, and unsubscribe handling.'
  },
  {
    id: 'stop',
    title: 'Stop rules',
    description: 'Configure when to automatically stop contacting prospects.'
  },
  {
    id: 'review',
    title: 'Review & launch',
    description: 'Double-check details before creating the sequence.'
  }
];

const stepOrder = wizardSteps.map((step) => step.id);

const eligibleStatuses = new Set(['verified', 'active']);

function isFutureIsoTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.getTime() > Date.now();
}

function validateSchedule(state: SequenceWizardState) {
  const schedule = state.schedule;
  if (schedule.mode === 'fixed') {
    if (!schedule.sendTime || !timePattern.test(schedule.sendTime)) {
      return 'Choose a daily send time.';
    }
  }
  if (schedule.mode === 'window') {
    if (!schedule.sendWindowStart || !timePattern.test(schedule.sendWindowStart)) {
      return 'Enter a window start time in HH:MM format.';
    }
    if (!schedule.sendWindowEnd || !timePattern.test(schedule.sendWindowEnd)) {
      return 'Enter a window end time in HH:MM format.';
    }
    const [startHour, startMinute] = schedule.sendWindowStart.split(':').map((part) => Number.parseInt(part, 10));
    const [endHour, endMinute] = schedule.sendWindowEnd.split(':').map((part) => Number.parseInt(part, 10));
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) {
      return 'Window end time must be after the start time.';
    }
  }

  if (schedule.launchAt && !isFutureIsoTimestamp(schedule.launchAt)) {
    return 'Launch time must be in the future.';
  }

  return null;
}

const stepValidation: Record<WizardStepDefinition['id'], (state: SequenceWizardState, context: {
  senderOptions: WizardSenderOption[] | undefined;
}) => string | null> = {
  compose: (state) => {
    if (state.name.trim().length === 0) {
      return 'Give your sequence a name before continuing.';
    }
    if (!validateBuilderSteps(state.steps)) {
      return 'Fill in the subject, body, and delay for each step before continuing.';
    }
    return null;
  },
  sender: (state, context) => {
    if (state.senderId == null) {
      return 'Pick a sender before moving on.';
    }
    if (!context.senderOptions || context.senderOptions.length === 0) {
      return 'Add a sender account under Outreach > Senders before launching a sequence.';
    }
    const selected = context.senderOptions.find((sender) => sender.id === state.senderId);
    if (!selected) {
      return 'Select a valid sender.';
    }
    if (!eligibleStatuses.has(selected.status)) {
      return 'Choose a verified or active sender.';
    }
    return null;
  },
  prospects: () => null,
  schedule: (state) => validateSchedule(state),
  tracking: () => null,
  stop: () => null,
  review: () => null
};

function getStepIndex(stepId: WizardStepDefinition['id']) {
  return stepOrder.indexOf(stepId);
}

type SequenceWizardProps = {
  initialState?: SequenceWizardState;
};

export function SequenceWizard({ initialState }: SequenceWizardProps) {
  const [restoredState] = useState<SequenceWizardState | undefined>(() => {
    const draft = readDraftFromStorage();
    return draft ?? initialState;
  });

  const shouldPersistRef = useRef(true);

  const {
    state,
    setName,
    setSenderId,
    updateStep,
    duplicateStep,
    deleteStep,
    addStep,
    moveStep,
    setTracking,
    setSchedule,
    setStopCondition,
    setStopOnBounce,
    setContactIds,
    toggleContactId
  } = useSequenceWizardState(restoredState);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [activeContactTag, setActiveContactTag] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const {
    data: senderOptions,
    error: senderError,
    isLoading: isLoadingSenders
  } = useSWR<WizardSenderOption[]>('/api/senders', fetchSenders, {
    revalidateOnFocus: false
  });

  const {
    data: contacts,
    error: contactsError,
    isLoading: isLoadingContacts
  } = useSWR<WizardContact[]>('/api/contacts?limit=200', fetchContacts, {
    revalidateOnFocus: false
  });

  const {
    data: tags,
    error: tagsError,
    isLoading: isLoadingTags
  } = useSWR<string[]>('/api/contact-tags', fetchTags, {
    revalidateOnFocus: false
  });

  const { data: currentUser } = useSWR<CurrentUserResponse | null>('/api/user', fetchCurrentUser, {
    revalidateOnFocus: false
  });

  useEffect(() => {
    if (state.senderId == null && senderOptions && senderOptions.length > 0) {
      const firstEligible = senderOptions.find((sender) => eligibleStatuses.has(sender.status));
      if (firstEligible) {
        setSenderId(firstEligible.id);
      }
    }
  }, [senderOptions, setSenderId, state.senderId]);

  const filteredContacts = useMemo(() => {
    const filtered = filterContacts(contacts ?? [], contactSearchTerm);
    if (!activeContactTag.trim()) {
      return filtered;
    }
    const lowered = activeContactTag.trim().toLowerCase();
    return filtered.filter((contact) => Array.isArray(contact.tags) && contact.tags.some((tag) => tag.toLowerCase() === lowered));
  }, [contacts, contactSearchTerm, activeContactTag]);

  const selectedSender = useMemo(() => {
    if (!senderOptions) {
      return null;
    }
    return senderOptions.find((sender) => sender.id === state.senderId) ?? null;
  }, [senderOptions, state.senderId]);

  const timezoneSuggestion = useMemo(() => {
    const value = currentUser?.timezone;
    if (!value || typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [currentUser?.timezone]);

  const selectedContactIds = useMemo(() => new Set(state.contactIds), [state.contactIds]);

  useEffect(() => {
    console.log('[SequenceWizard] contactIds in state', state.contactIds);
  }, [state.contactIds]);

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }
    if (contacts) {
      console.log('[SequenceWizard] Loaded contacts', { count: contacts.length });
    }
    if (!contacts && !isLoadingContacts) {
      console.log('[SequenceWizard] No contacts returned');
    }
  }, [contacts, isLoadingContacts]);

  useEffect(() => {
    if (!isBrowser() || !contactsError) {
      return;
    }
    const message = contactsError instanceof Error ? contactsError.message : String(contactsError);
    console.error('[SequenceWizard] Failed to load contacts', message);
  }, [contactsError]);

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }
    if (tags) {
      console.log('[SequenceWizard] Loaded contact tags', { count: tags.length });
    }
  }, [tags]);

  useEffect(() => {
    if (!isBrowser() || !tagsError) {
      return;
    }
    const message = tagsError instanceof Error ? tagsError.message : String(tagsError);
    console.error('[SequenceWizard] Failed to load tags', message);
  }, [tagsError]);

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }
    console.log('[SequenceWizard] Selected contact ids', state.contactIds);
  }, [state.contactIds]);

  const handleNext = () => {
    const stepId = wizardSteps[currentStepIndex]?.id;
    if (!stepId) {
      return;
    }
    const validate = stepValidation[stepId];
    const validationMessage = validate?.(state, { senderOptions: senderOptions ?? [] });
    if (validationMessage) {
      toast({
        title: 'Check this step',
        description: validationMessage,
        variant: 'destructive'
      });
      return;
    }
    if (stepId === 'prospects' && state.contactIds.length === 0) {
      toast({
        title: 'Select contacts to enroll',
        description: 'Choose at least one contact before moving to the next step.',
        variant: 'destructive'
      });
      return;
    }
    setSubmitError(null);
    setCurrentStepIndex((index) => Math.min(index + 1, wizardSteps.length - 1));
  };

  const handlePrevious = () => {
    setSubmitError(null);
    setCurrentStepIndex((index) => Math.max(index - 1, 0));
  };

  const handleJumpToStep = useCallback((stepId: WizardStepDefinition['id']) => {
    if (stepId !== 'compose' && state.name.trim().length === 0) {
      toast({
        title: 'Sequence name required',
        description: 'Add a name on the first step before skipping ahead.',
        variant: 'destructive'
      });
      setCurrentStepIndex(getStepIndex('compose'));
      return;
    }
    const targetIndex = getStepIndex(stepId);
    if (targetIndex === -1) {
      return;
    }
    setCurrentStepIndex(targetIndex);
  }, [state.name, toast]);

  const runPreSubmitValidation = () => {
    for (const step of wizardSteps) {
      const validator = stepValidation[step.id];
      if (!validator) {
        continue;
      }
      const message = validator(state, { senderOptions: senderOptions ?? [] });
      if (message) {
        setCurrentStepIndex(getStepIndex(step.id));
        toast({
          title: 'Fix issues before continuing',
          description: message,
          variant: 'destructive'
        });
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    if (!isBrowser()) {
      return;
    }
    if (!shouldPersistRef.current) {
      return;
    }
    writeDraftToStorage(state);
  }, [state]);

  const handleSubmit = async () => {
    setSubmitError(null);
    const ok = runPreSubmitValidation();
    if (!ok) {
      return;
    }

    const payload = buildCreatePayloadFromWizardState(state);
    if (!payload.senderId) {
      toast({
        title: 'Select a sender',
        description: 'Choose a sender account before creating the sequence.',
        variant: 'destructive'
      });
      setCurrentStepIndex(getStepIndex('sender'));
      return;
    }

    if (payload.name.length === 0) {
      toast({
        title: 'Sequence name required',
        description: 'Add a name before creating the sequence.',
        variant: 'destructive'
      });
      setCurrentStepIndex(getStepIndex('compose'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/sequences/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data?.error === 'string' ? data.error : 'Unable to create the sequence.';
        setSubmitError(message);
        toast({
          title: 'Unable to create sequence',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      const sequenceId = data?.sequence?.id;
      if (!sequenceId) {
        toast({
          title: 'Unexpected response',
          description: 'The sequence was created but the response looked malformed. Please refresh to continue.',
          variant: 'destructive'
        });
        return;
      }

      shouldPersistRef.current = false;
      clearDraftFromStorage();

      toast({
        title: 'Sequence created',
        description: 'Your sequence is ready. You can fine-tune it before launching.'
      });

      await mutate('/api/sequences/list');
      router.push(`/sequences/${sequenceId}/edit`);
      router.refresh();
    } catch (error) {
      console.error('Failed to create sequence', error);
      const message = 'Something went wrong. Please try again.';
      setSubmitError(message);
      toast({
        title: 'Unable to create sequence',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStep = wizardSteps[currentStepIndex];

  const renderStep = () => {
    switch (currentStep.id) {
      case 'compose':
        return (
          <WizardStepAddSteps
            state={{ name: state.name, steps: state.steps }}
            onNameChange={setName}
            onUpdateStep={updateStep}
            onDuplicateStep={duplicateStep}
            onDeleteStep={deleteStep}
            onAddStep={addStep}
            onMoveStep={moveStep}
            currentUserEmail={currentUser?.email}
          />
        );
      case 'sender':
        return (
          <WizardStepSelectSender
            senders={senderOptions ?? []}
            selectedSenderId={state.senderId}
            onSelect={setSenderId}
            isLoading={isLoadingSenders}
            error={senderError instanceof Error ? senderError.message : senderError ? 'Unable to load senders.' : null}
          />
        );
      case 'prospects':
        return (
          <WizardStepEnrollProspects
            contacts={filteredContacts}
            selectedIds={selectedContactIds}
            onToggle={(id) => toggleContactId(id)}
            onSelectAll={() => {
              if (filteredContacts.length === 0) {
                return;
              }
              setContactIds(filteredContacts.map((contact) => contact.id));
            }}
            onClearSelection={() => setContactIds([])}
            isLoading={isLoadingContacts}
            error={contactsError instanceof Error ? contactsError.message : contactsError ? 'Unable to load contacts.' : null}
            searchTerm={contactSearchTerm}
            onSearchTermChange={setContactSearchTerm}
            tags={tags ?? []}
            selectedTag={activeContactTag}
            onTagChange={setActiveContactTag}
            isLoadingTags={isLoadingTags}
            tagError={tagsError instanceof Error ? tagsError.message : tagsError ? 'Unable to load tags.' : null}
          />
        );
      case 'schedule':
        return (
          <WizardStepSchedule
            schedule={state.schedule}
            onScheduleChange={setSchedule}
            timezoneSuggestion={timezoneSuggestion}
          />
        );
      case 'tracking':
        return (
          <WizardStepTrackingOptions
            tracking={state.tracking}
            onChange={setTracking}
          />
        );
      case 'stop':
        return (
          <WizardStepStopConditions
            stopCondition={state.stopCondition}
            stopOnBounce={state.stopOnBounce}
            onStopConditionChange={(value: SequenceStopCondition) => setStopCondition(value)}
            onStopOnBounceChange={setStopOnBounce}
          />
        );
      case 'review':
        return (
          <WizardStepReviewSubmit
            state={state}
            sender={selectedSender ? { id: selectedSender.id, name: selectedSender.name, email: selectedSender.email } : null}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            error={submitError}
            submitLabel="Create sequence"
            onEditSection={(section) => {
              switch (section) {
                case 'details':
                  handleJumpToStep('compose');
                  break;
                case 'sender':
                  handleJumpToStep('sender');
                  break;
                case 'prospects':
                  handleJumpToStep('prospects');
                  break;
                case 'schedule':
                  handleJumpToStep('schedule');
                  break;
                case 'tracking':
                  handleJumpToStep('tracking');
                  break;
                case 'stop':
                  handleJumpToStep('stop');
                  break;
                default:
                  break;
              }
            }}
          />
        );
      default:
        return null;
    }
  };

  const showPrevious = currentStepIndex > 0;
  const showNext = currentStepIndex < wizardSteps.length - 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        {wizardSteps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isComplete = index < currentStepIndex;
          return (
            <button
              key={step.id}
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition',
                isActive
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : isComplete
                    ? 'border-border/80 bg-muted/30 text-foreground'
                    : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40'
              )}
              onClick={() => handleJumpToStep(step.id)}
            >
              <div>
                <p className="font-semibold">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <span
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isComplete
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {index + 1}
              </span>
            </button>
          );
        })}
      </aside>

      <div className="rounded-2xl border border-border/60 bg-background shadow-sm">
        <header className="border-b border-border/60 px-6 py-5">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span>Step {currentStepIndex + 1} of {wizardSteps.length}</span>
            {isSubmitting ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Saving
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-foreground">{currentStep.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{currentStep.description}</p>
        </header>

        <div className="px-6 py-6">
          {renderStep()}
        </div>

        {currentStep.id !== 'review' ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
            <div className="text-xs text-muted-foreground">
              Progress is saved when you finish the wizard.
            </div>
            <div className="flex items-center gap-2">
              {showPrevious ? (
                <Button type="button" variant="ghost" onClick={handlePrevious} disabled={isSubmitting}>
                  Back
                </Button>
              ) : null}
              {showNext ? (
                <Button type="button" onClick={handleNext} disabled={isSubmitting}>
                  Next
                </Button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
