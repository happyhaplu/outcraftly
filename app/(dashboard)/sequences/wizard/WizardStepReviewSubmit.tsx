import { useMemo } from 'react';

import { AlertTriangle, CheckCircle2, Clock3, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import type { BuilderStep, SequenceStopCondition, SequenceWizardSchedule, SequenceWizardState } from '../types';

export type WizardReviewSender = {
  id: number;
  name: string;
  email: string;
};

export type WizardStepReviewSubmitProps = {
  state: SequenceWizardState;
  sender: WizardReviewSender | null;
  onSubmit: () => void;
  isSubmitting: boolean;
  error?: string | null;
  submitLabel?: string;
  onEditSection?: (section: 'details' | 'prospects' | 'sender' | 'schedule' | 'tracking' | 'stop') => void;
};

const stopConditionMessages: Record<SequenceStopCondition, string> = {
  manual: 'Sequence keeps running until you pause it manually.',
  on_reply: 'Automatically stops when a prospect replies.',
  on_reply_or_bounce: 'Automatically stops when a prospect replies or when we detect a bounce.'
};

const formatDelay = (step: BuilderStep) => {
  if (step.order === 1) {
    return 'Sends right away';
  }
  if (step.delayValue === 0) {
    return 'No delay from previous step';
  }
  const unitLabel = step.delayValue === 1 ? step.delayUnit.replace(/s$/, '') : step.delayUnit;
  return `Wait ${step.delayValue} ${unitLabel} after previous step`;
};

const delayBadgeLabel = (step: BuilderStep, index: number) => {
  if (index === 0) {
    return 'First touch';
  }
  if (step.delayValue === 0) {
    return 'Immediate follow-up';
  }
  const unitLabel = step.delayValue === 1 ? step.delayUnit.replace(/s$/, '') : step.delayUnit;
  return `Delay ${step.delayValue} ${unitLabel}`;
};

const describeSchedule = (schedule: SequenceWizardSchedule) => {
  if (schedule.mode === 'immediate') {
    return 'Begin sending as soon as the worker runs.';
  }
  if (schedule.mode === 'fixed') {
    return schedule.sendTime
      ? `Begin each new contact around ${schedule.sendTime} in their timezone.`
      : 'Begin each new contact at a specific time.';
  }
  if (schedule.sendWindowStart && schedule.sendWindowEnd) {
    return `Distribute first-touch emails between ${schedule.sendWindowStart} and ${schedule.sendWindowEnd}.`;
  }
  return 'Distribute first-touch emails within a daily window.';
};

export function WizardStepReviewSubmit({
  state,
  sender,
  onSubmit,
  isSubmitting,
  error,
  submitLabel = 'Launch sequence',
  onEditSection
}: WizardStepReviewSubmitProps) {
  const orderedSteps = useMemo(() => state.steps.slice().sort((a, b) => a.order - b.order), [state.steps]);

  const launchAtLabel = useMemo(() => {
    if (!state.schedule.launchAt) {
      return 'Launch manually after review';
    }
    const parsed = new Date(state.schedule.launchAt);
    if (Number.isNaN(parsed.getTime())) {
      return 'Scheduled launch (invalid timestamp)';
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(parsed);
    } catch (_error) {
      return parsed.toISOString();
    }
  }, [state.schedule.launchAt]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Sequence name</p>
            <p className="text-xs text-muted-foreground">{state.name || 'Untitled sequence'}</p>
          </div>
          {onEditSection ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEditSection('details')}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Touchpoints</p>
          </div>
          {onEditSection ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEditSection('details')}>
              Edit
            </Button>
          ) : null}
        </div>
        <ul className="mt-4 space-y-3">
          {orderedSteps.map((step, index) => (
            <li key={step.internalId} className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Step {index + 1}: {step.subject || 'Untitled email'}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDelay(step)}</p>
                </div>
                <Badge variant="secondary">{delayBadgeLabel(step, index)}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Prospects selected</p>
          </div>
          {onEditSection ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEditSection('prospects')}>
              Edit
            </Button>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-foreground">{state.contactIds.length} contacts</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Schedule</p>
          </div>
          {onEditSection ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEditSection('schedule')}>
              Edit
            </Button>
          ) : null}
        </div>
        <div className="mt-3 space-y-2 text-sm text-foreground">
          <p>{describeSchedule(state.schedule)}</p>
          <p className="text-xs text-muted-foreground">{launchAtLabel}</p>
          <p className="text-xs text-muted-foreground">
            {state.schedule.respectContactTimezone
              ? 'Respect contact timezone'
              : 'Ignore contact timezone and use fallback'}
            {state.schedule.fallbackTimezone ? ` • Fallback: ${state.schedule.fallbackTimezone}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Tracking</p>
          {onEditSection ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEditSection('tracking')}>
              Edit
            </Button>
          ) : null}
        </div>
        <ul className="mt-3 space-y-2 text-sm text-foreground">
          <li>{state.tracking.trackOpens ? 'Track opens enabled' : 'Track opens disabled'}</li>
          <li>{state.tracking.trackClicks ? 'Track link clicks enabled' : 'Track link clicks disabled'}</li>
          <li>{state.tracking.enableUnsubscribe ? 'Unsubscribe link included' : 'Unsubscribe link removed'}</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Stop conditions</p>
          {onEditSection ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEditSection('stop')}>
              Edit
            </Button>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-foreground">{stopConditionMessages[state.stopCondition]}</p>
        <p className="text-xs text-muted-foreground">
          {state.stopOnBounce ? 'Bounced contacts are removed from future steps.' : 'Bounced contacts stay enrolled in later steps.'}
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Sender</p>
            {sender ? (
              <p className="text-xs text-muted-foreground">{sender.name} - {sender.email}</p>
            ) : (
              <p className="text-xs text-muted-foreground">No sender selected yet</p>
            )}
          </div>
          {onEditSection ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEditSection('sender')}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="text-xs text-muted-foreground">
          Review everything before launching. You can pause or edit the sequence after launch if needed.
        </div>
        <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
