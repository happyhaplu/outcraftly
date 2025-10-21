'use client';

import { useCallback, useState } from 'react';

import type { BuilderStep, SequenceBuilderState } from './types';
import { createDefaultStep, createInternalId } from './utils';

type StepUpdater = (steps: BuilderStep[]) => BuilderStep[];

function withNormalisedOrder(steps: BuilderStep[]) {
  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

export function useSequenceBuilderState(initialState: SequenceBuilderState) {
  const [state, setState] = useState<SequenceBuilderState>({
    ...initialState,
    senderId: initialState.senderId ?? null,
    steps: withNormalisedOrder(initialState.steps)
  });

  const resetState = useCallback((next: SequenceBuilderState) => {
    setState({
      ...next,
      senderId: next.senderId ?? null,
      steps: withNormalisedOrder(next.steps)
    });
  }, []);

  const updateSteps = useCallback((updater: StepUpdater) => {
    setState((previous) => {
      const nextSteps = withNormalisedOrder(updater(previous.steps));
      return {
        ...previous,
        steps: nextSteps
      };
    });
  }, []);

  const setName = useCallback((name: string) => {
    setState((previous) => ({ ...previous, name }));
  }, []);

  const setSenderId = useCallback((senderId: number | null) => {
    setState((previous) => ({ ...previous, senderId }));
  }, []);

  const updateStep = useCallback(
    (id: string, updates: Partial<BuilderStep>) => {
      updateSteps((steps) => steps.map((step) => (step.internalId === id ? { ...step, ...updates } : step)));
    },
    [updateSteps]
  );

  const duplicateStep = useCallback(
    (id: string) => {
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
    },
    [updateSteps]
  );

  const deleteStep = useCallback(
    (id: string) => {
      updateSteps((steps) => {
        if (steps.length <= 1) {
          return steps;
        }
        return steps.filter((step) => step.internalId !== id);
      });
    },
    [updateSteps]
  );

  const addStep = useCallback(() => {
    updateSteps((steps) => [...steps, createDefaultStep(steps.length + 1)]);
  }, [updateSteps]);

  const reorderSteps = useCallback(
    (draggedId: string, targetId: string) => {
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
    },
    [updateSteps]
  );

  return {
    state,
    setName,
    setSenderId,
    updateStep,
    duplicateStep,
    deleteStep,
    addStep,
    reorderSteps,
    resetState
  };
}
