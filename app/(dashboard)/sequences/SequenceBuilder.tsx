'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';

import { SequenceStepCard } from './SequenceStepCard';
import { BuilderStep, SequenceBuilderState } from './types';
import { validateBuilderSteps } from './utils';

type SequenceBuilderProps = {
  state: SequenceBuilderState;
  onNameChange: (name: string) => void;
  onSenderChange: (senderId: number | null) => void;
  onMinGapMinutesChange: (value: number | null) => void;
  onUpdateStep: (id: string, updates: Partial<BuilderStep>) => void;
  onDuplicateStep: (id: string) => void;
  onDeleteStep: (id: string) => void;
  onAddStep: () => void;
  onReorderSteps: (draggedId: string, targetId: string) => void;
  onLaunchAtChange: (launchAt: string | null) => void;
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

const launchDisplayFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const SCHEDULE_MINUTES_INCREMENT = 5;
const DEFAULT_MIN_SEND_INTERVAL_MINUTES = 5;

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function toLocalDateTimeInputValueFromDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toLocalDateTimeInputValue(iso: string | null) {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  return toLocalDateTimeInputValueFromDate(date);
}

function fromLocalDateTimeInputValue(value: string): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function getMinimumScheduleDate() {
  const date = new Date();
  const roundedMinutes = Math.ceil(date.getMinutes() / SCHEDULE_MINUTES_INCREMENT) * SCHEDULE_MINUTES_INCREMENT;
  date.setMinutes(roundedMinutes + SCHEDULE_MINUTES_INCREMENT);
  date.setSeconds(0, 0);
  return date;
}

function getDefaultLaunchAt() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 60);
  date.setSeconds(0, 0);
  return date.toISOString();
}

function formatLaunchDisplay(iso: string | null) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return launchDisplayFormatter.format(date);
}

export function SequenceBuilder({
  state,
  onNameChange,
  onSenderChange,
  onMinGapMinutesChange,
  onUpdateStep,
  onDuplicateStep,
  onDeleteStep,
  onAddStep,
  onReorderSteps,
  onLaunchAtChange,
  onSave,
  onPreview,
  onCancel,
  isSaving,
  isLoading,
  saveButtonLabel,
  cancelButtonLabel
}: SequenceBuilderProps) {
  const { toast } = useToast();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const { data: currentUser } = useSWR<{ email?: string } | null>(
    isHydrated ? '/api/user' : null,
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
  } = useSWR<SenderOption[]>(isHydrated ? '/api/senders' : null, senderFetcher, {
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
    if (!isHydrated) {
      return;
    }
    if (state.senderId == null && eligibleSenders.length > 0) {
      onSenderChange(eligibleSenders[0].id);
    }
  }, [eligibleSenders, isHydrated, onSenderChange, state.senderId]);

  const scheduleMode: 'manual' | 'scheduled' = state.launchAt ? 'scheduled' : 'manual';
  const allowScheduling = (state.status ?? 'draft') === 'draft';
  const launchInputValue = useMemo(() => toLocalDateTimeInputValue(state.launchAt), [state.launchAt]);
  const scheduledDate = useMemo(() => {
    if (!state.launchAt) {
      return null;
    }
    const value = new Date(state.launchAt);
    return Number.isNaN(value.getTime()) ? null : value;
  }, [state.launchAt]);
  const scheduledDisplay = useMemo(() => formatLaunchDisplay(state.launchAt), [state.launchAt]);
  const isLaunchInPast = useMemo(() => {
    if (!scheduledDate) {
      return false;
    }
    return scheduledDate.getTime() <= Date.now();
  }, [scheduledDate]);
  const launchedDisplay = useMemo(() => formatLaunchDisplay(state.launchedAt ?? null), [state.launchedAt]);

  const hasValidLaunchTime = useMemo(() => {
    if (!allowScheduling) {
      return true;
    }
    if (!state.launchAt) {
      return true;
    }
    if (!scheduledDate) {
      return false;
    }
    return scheduledDate.getTime() > Date.now();
  }, [allowScheduling, scheduledDate, state.launchAt]);

  const minGapInputValue =
    typeof state.minGapMinutes === 'number' && Number.isFinite(state.minGapMinutes)
      ? String(Math.max(0, Math.floor(state.minGapMinutes)))
      : '';

  const minLaunchValue = toLocalDateTimeInputValueFromDate(getMinimumScheduleDate());

  const canSave = useMemo(
    () =>
      state.name.trim().length > 0 &&
      hasEligibleSelection &&
      validateBuilderSteps(state.steps) &&
      hasValidLaunchTime,
    [hasEligibleSelection, hasValidLaunchTime, state.name, state.steps]
  );

  const effectiveSaveLabel = saveButtonLabel ?? 'Save sequence';
  const effectiveCancelLabel = cancelButtonLabel ?? 'Cancel';
  const showCancel = typeof onCancel === 'function';

  const handleSave = async () => {
    if (isLoading) {
      return;
    }

    if (!canSave) {
      if (!hasValidLaunchTime) {
        toast({
          title: 'Invalid launch schedule',
          description: 'Choose a future date and time or switch back to manual launch.',
          variant: 'destructive'
        });
        return;
      }
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

  const handleScheduleModeChange = (value: 'manual' | 'scheduled') => {
    if (!allowScheduling) {
      return;
    }
    if (value === 'manual') {
      onLaunchAtChange(null);
    } else {
      const nextLaunch = state.launchAt ?? getDefaultLaunchAt();
      onLaunchAtChange(nextLaunch);
    }
  };

  const handleLaunchInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!allowScheduling) {
      return;
    }
    const next = fromLocalDateTimeInputValue(event.target.value);
    onLaunchAtChange(next);
  };

  if (!isHydrated) {
    return (
      <div className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          Preparing sequence builder...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-lg font-semibold text-foreground">Sequence setup</CardTitle>
          <CardDescription>
            Configure the essentials before refining each touchpoint in your cadence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="sequence-name">Sequence name</Label>
              <Input
                id="sequence-name"
                value={state.name}
                placeholder="e.g. Post-demo follow up"
                onChange={(event) => onNameChange(event.target.value)}
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="sequence-sender">Sender account</Label>
              {isSenderLoading ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 text-xs text-muted-foreground">
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
                  className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                    return (
                      <option key={sender.id} value={sender.id}>
                        {sender.name} {isEligible ? '' : '(inactive)'}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                Builder actions
              </Label>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="default" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving…' : effectiveSaveLabel}
                </Button>
                {showCancel ? (
                  <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
                    {effectiveCancelLabel}
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="ghost" onClick={onPreview} disabled={isSaving}>
                  Preview
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sequence-min-gap" className="text-sm font-medium text-foreground">
                Minimum delay between sends
              </Label>
              <Input
                id="sequence-min-gap"
                inputMode="numeric"
                pattern="[0-9]*"
                value={minGapInputValue}
                onChange={(event) => {
                  const raw = event.target.value.replace(/[^0-9]/g, '');
                  if (raw.length === 0) {
                    onMinGapMinutesChange(null);
                    return;
                  }
                  const parsed = Number(raw);
                  onMinGapMinutesChange(Number.isNaN(parsed) ? null : parsed);
                }}
                onBlur={(event) => {
                  const raw = event.target.value.trim();
                  if (raw.length === 0) {
                    onMinGapMinutesChange(null);
                    return;
                  }
                  const parsed = Number(raw);
                  onMinGapMinutesChange(Number.isNaN(parsed) ? null : parsed);
                }}
                placeholder={`${DEFAULT_MIN_SEND_INTERVAL_MINUTES}`}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the workspace default of {DEFAULT_MIN_SEND_INTERVAL_MINUTES} minutes between sends.
              </p>
            </div>
            {allowScheduling ? (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Launch timing</p>
                  <p className="text-xs text-muted-foreground">
                    Keep the sequence in draft or schedule an automatic launch once everything looks good.
                  </p>
                </div>
                <RadioGroup
                  value={scheduleMode}
                  onValueChange={handleScheduleModeChange}
                  className="grid gap-3 md:grid-cols-2"
                >
                  <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition hover:border-primary/40">
                    <RadioGroupItem id="sequence-launch-mode-manual" value="manual" className="mt-1" />
                    <div className="space-y-1">
                      <Label htmlFor="sequence-launch-mode-manual" className="text-sm font-semibold text-foreground">
                        Launch manually
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Stay in draft until you launch it from the status tab when you are ready.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition hover:border-primary/40">
                    <RadioGroupItem id="sequence-launch-mode-scheduled" value="scheduled" className="mt-1" />
                    <div className="space-y-1">
                      <Label htmlFor="sequence-launch-mode-scheduled" className="text-sm font-semibold text-foreground">
                        Schedule launch
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Pick a future date and time. We will activate the sequence automatically around then.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
                {scheduleMode === 'scheduled' ? (
                  <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_1fr] md:items-center">
                    <div className="space-y-2">
                      <Label htmlFor="sequence-launch-at" className="text-xs font-medium text-muted-foreground">
                        Launch date &amp; time
                      </Label>
                      <Input
                        id="sequence-launch-at"
                        type="datetime-local"
                        value={launchInputValue}
                        min={minLaunchValue}
                        onChange={handleLaunchInputChange}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The worker runs continuously and will promote the sequence to active shortly after this time.
                    </p>
                  </div>
                ) : null}
                {scheduleMode === 'scheduled' && scheduledDisplay ? (
                  <p className="text-xs text-muted-foreground">
                    Scheduled to launch on <span className="font-medium text-foreground">{scheduledDisplay}</span>.
                  </p>
                ) : null}
                {scheduleMode === 'scheduled' && isLaunchInPast ? (
                  <p className="text-xs text-destructive">Choose a launch time in the future.</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                {state.launchedAt
                  ? launchedDisplay
                    ? `Sequence launched on ${launchedDisplay}.`
                    : 'Sequence has already launched.'
                  : 'Scheduling is available while the sequence remains in draft.'}
              </div>
            )}
          </div>
          <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Build each touchpoint, use tokens to personalise at scale, and define the wait time before every send.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-lg font-semibold text-foreground">Sequence steps</CardTitle>
          <CardDescription>Structure the cadence and personalise every email before you launch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading sequence...
            </div>
          ) : (
            state.steps.map((step, index) => (
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
            ))
          )}
        </CardContent>
        <CardFooter className="border-t border-border/60 pt-5">
          <Button type="button" variant="secondary" className="gap-2" onClick={onAddStep} disabled={isLoading}>
            <Plus className="h-4 w-4" aria-hidden />
            Add step
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

