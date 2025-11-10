'use client';

import { useCallback, useState } from 'react';

import type {
  BuilderStep,
  SequenceStopCondition,
  SequenceWizardSchedule,
  SequenceWizardState,
  SequenceWizardTracking
} from '../types';
import { createDefaultStep, createInternalId, delayToHours } from '../utils';

function withNormalisedOrder(steps: BuilderStep[]) {
  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

export function createBlankWizardState(): SequenceWizardState {
  return {
    name: '',
    steps: [createDefaultStep(1)],
    senderId: null,
    launchAt: null,
    tracking: {
      trackOpens: true,
      trackClicks: true,
      enableUnsubscribe: true
    },
    schedule: {
      mode: 'immediate',
      sendTime: null,
      sendWindowStart: null,
      sendWindowEnd: null,
      respectContactTimezone: true,
      fallbackTimezone: null,
      timezone: null,
      sendDays: [],
      sendWindows: [],
      launchAt: null
    },
    stopCondition: 'on_reply',
    stopOnBounce: false,
    minGapMinutes: null,
    contactIds: []
  };
}

const ensureStepDefaults = (steps: BuilderStep[]) => {
  if (steps.length === 0) {
    return [createDefaultStep(1)];
  }
  return steps.map((step) => ({
    ...step,
    internalId: step.internalId ?? createInternalId(),
    delayValue: Number.isFinite(step.delayValue) ? step.delayValue : 0,
    delayUnit: step.delayUnit ?? 'hours',
    order: typeof step.order === 'number' ? step.order : 0,
    skipIfReplied: Boolean(step.skipIfReplied),
    skipIfBounced: Boolean(step.skipIfBounced),
    delayIfReplied: typeof step.delayIfReplied === 'number' ? step.delayIfReplied : null
  }));
};

function normaliseState(initial: SequenceWizardState): SequenceWizardState {
  const steps = withNormalisedOrder(ensureStepDefaults(initial.steps));
  const launchAt = initial.launchAt ?? initial.schedule.launchAt ?? null;

  return {
    name: initial.name ?? '',
    steps,
    senderId: initial.senderId ?? null,
    launchAt,
    tracking: {
      trackOpens: Boolean(initial.tracking?.trackOpens ?? true),
      trackClicks: Boolean(initial.tracking?.trackClicks ?? true),
      enableUnsubscribe: Boolean(initial.tracking?.enableUnsubscribe ?? true)
    },
    schedule: {
      mode: initial.schedule.mode ?? 'immediate',
      sendTime: initial.schedule.sendTime ?? null,
      sendWindowStart: initial.schedule.sendWindowStart ?? null,
      sendWindowEnd: initial.schedule.sendWindowEnd ?? null,
      respectContactTimezone: Boolean(initial.schedule.respectContactTimezone ?? true),
      fallbackTimezone: initial.schedule.fallbackTimezone ?? null,
      timezone: initial.schedule.timezone ?? null,
      sendDays: Array.isArray(initial.schedule.sendDays) ? initial.schedule.sendDays : [],
      sendWindows: Array.isArray(initial.schedule.sendWindows) ? initial.schedule.sendWindows : [],
      launchAt
    },
    stopCondition: initial.stopCondition ?? 'on_reply',
    stopOnBounce: Boolean(initial.stopOnBounce ?? false),
    minGapMinutes:
      typeof initial.minGapMinutes === 'number' && Number.isFinite(initial.minGapMinutes)
        ? Math.max(0, Math.floor(initial.minGapMinutes))
        : null,
    contactIds: Array.isArray(initial.contactIds) ? Array.from(new Set(initial.contactIds)) : []
  };
}

type StepUpdater = (steps: BuilderStep[]) => BuilderStep[];

type UseSequenceWizardStateResult = {
  state: SequenceWizardState;
  setName: (name: string) => void;
  setSenderId: (senderId: number | null) => void;
  updateStep: (id: string, updates: Partial<BuilderStep>) => void;
  duplicateStep: (id: string) => void;
  deleteStep: (id: string) => void;
  addStep: () => void;
  moveStep: (draggedId: string, targetId: string) => void;
  setTracking: (tracking: SequenceWizardTracking) => void;
  setSchedule: (schedule: SequenceWizardSchedule) => void;
  setStopCondition: (stopCondition: SequenceStopCondition) => void;
  setStopOnBounce: (value: boolean) => void;
  setContactIds: (contactIds: string[]) => void;
  toggleContactId: (contactId: string) => void;
  resetState: (next: SequenceWizardState) => void;
};

export function useSequenceWizardState(initialState?: SequenceWizardState): UseSequenceWizardStateResult {
  const [state, setState] = useState<SequenceWizardState>(() => normaliseState(initialState ?? createBlankWizardState()));

  const updateSteps = useCallback((updater: StepUpdater) => {
    setState((previous) => {
      const nextSteps = withNormalisedOrder(ensureStepDefaults(updater(previous.steps)));
      return { ...previous, steps: nextSteps };
    });
  }, []);

  const setName = useCallback((name: string) => {
    setState((previous) => ({ ...previous, name }));
  }, []);

  const setSenderId = useCallback((senderId: number | null) => {
    setState((previous) => ({ ...previous, senderId }));
  }, []);

  const updateStep = useCallback((id: string, updates: Partial<BuilderStep>) => {
    updateSteps((steps) => steps.map((step) => (step.internalId === id ? { ...step, ...updates } : step)));
  }, [updateSteps]);

  const duplicateStep = useCallback((id: string) => {
    updateSteps((steps) => {
      const index = steps.findIndex((step) => step.internalId === id);
      if (index === -1) {
        return steps;
      }
      const source = steps[index];
      const clone: BuilderStep = {
        ...source,
        internalId: createInternalId(),
        backendId: undefined
      };
      const before = steps.slice(0, index + 1);
      const after = steps.slice(index + 1);
      return [...before, clone, ...after];
    });
  }, [updateSteps]);

  const deleteStep = useCallback((id: string) => {
    updateSteps((steps) => {
      if (steps.length <= 1) {
        return steps;
      }
      return steps.filter((step) => step.internalId !== id);
    });
  }, [updateSteps]);

  const addStep = useCallback(() => {
    updateSteps((steps) => [...steps, createDefaultStep(steps.length + 1)]);
  }, [updateSteps]);

  const moveStep = useCallback((draggedId: string, targetId: string) => {
    updateSteps((steps) => {
      const next = steps.slice();
      const fromIndex = next.findIndex((step) => step.internalId === draggedId);
      const toIndex = next.findIndex((step) => step.internalId === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return steps;
      }
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, [updateSteps]);

  const setTracking = useCallback((tracking: SequenceWizardTracking) => {
    setState((previous) => ({ ...previous, tracking }));
  }, []);

  const setSchedule = useCallback((schedule: SequenceWizardSchedule) => {
    setState((previous) => ({
      ...previous,
      launchAt: schedule.launchAt ?? null,
      schedule: {
        ...schedule,
        sendTime: schedule.mode === 'fixed' ? schedule.sendTime : null,
        sendWindowStart: schedule.mode === 'window' ? schedule.sendWindowStart : null,
        sendWindowEnd: schedule.mode === 'window' ? schedule.sendWindowEnd : null
      }
    }));
  }, []);


  const setStopCondition = useCallback((stopCondition: SequenceStopCondition) => {
    setState((previous) => ({ ...previous, stopCondition }));
  }, []);

  const setStopOnBounce = useCallback((value: boolean) => {
    setState((previous) => ({ ...previous, stopOnBounce: value }));
  }, []);

  const setContactIds = useCallback((contactIds: string[]) => {
    setState((previous) => ({ ...previous, contactIds: Array.from(new Set(contactIds)) }));
  }, []);

  const toggleContactId = useCallback((contactId: string) => {
    setState((previous) => {
      const next = new Set(previous.contactIds);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return { ...previous, contactIds: Array.from(next) };
    });
  }, []);

  const resetState = useCallback((next: SequenceWizardState) => {
    setState(normaliseState(next));
  }, []);

  return {
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
    toggleContactId,
    resetState
  };
}

export function buildCreatePayloadFromWizardState(state: SequenceWizardState) {
  return {
    name: state.name.trim(),
    senderId: state.senderId,
    launchAt: state.launchAt,
    steps: state.steps.map((step, index) => ({
      id: step.backendId,
      subject: step.subject.trim(),
      body: step.body.trim(),
      delay: delayToHours(step.delayValue, step.delayUnit),
      skipIfReplied: Boolean(step.skipIfReplied),
      skipIfBounced: Boolean(step.skipIfBounced),
      delayIfReplied: step.delayIfReplied ?? null,
      order: index + 1
    })),
    contacts: state.contactIds,
    tracking: {
      trackOpens: Boolean(state.tracking.trackOpens),
      trackClicks: Boolean(state.tracking.trackClicks),
      enableUnsubscribe: Boolean(state.tracking.enableUnsubscribe)
    },
    stopCondition: state.stopCondition,
    stopOnBounce: Boolean(state.stopOnBounce),
    schedule: {
      mode: state.schedule.mode,
      respectContactTimezone: Boolean(state.schedule.respectContactTimezone),
      sendTime: state.schedule.mode === 'fixed' ? state.schedule.sendTime : null,
      sendWindowStart: state.schedule.mode === 'window' ? state.schedule.sendWindowStart : null,
      sendWindowEnd: state.schedule.mode === 'window' ? state.schedule.sendWindowEnd : null,
      fallbackTimezone: state.schedule.fallbackTimezone ?? null,
      timezone: state.schedule.timezone ?? null,
      sendDays: Array.isArray(state.schedule.sendDays) ? state.schedule.sendDays : [],
      sendWindows: Array.isArray(state.schedule.sendWindows) ? state.schedule.sendWindows : []
    },
    minGapMinutes:
      typeof state.minGapMinutes === 'number' && Number.isFinite(state.minGapMinutes)
        ? Math.max(0, Math.floor(state.minGapMinutes))
        : null
  };
}
