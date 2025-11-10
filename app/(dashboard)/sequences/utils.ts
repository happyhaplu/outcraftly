import { SUPPORTED_PERSONALISATION_TOKENS } from '@/lib/validation/sequence';

import type { BuilderStep, SequenceBuilderState, SequenceDetail } from './types';

export function createInternalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

export function hoursToDelay(delayHours: number) {
  if (delayHours === 0) {
    return { value: 0, unit: 'hours' as const };
  }

  if (delayHours % 24 === 0) {
    return { value: delayHours / 24, unit: 'days' as const };
  }

  return { value: delayHours, unit: 'hours' as const };
}

export function delayToHours(value: number, unit: 'hours' | 'days') {
  if (Number.isNaN(value) || value < 0) {
    return 0;
  }
  return unit === 'days' ? value * 24 : value;
}

export function createDefaultStep(order: number): BuilderStep {
  const delayValue = order === 1 ? 0 : 2;
  const delayUnit = order === 1 ? 'hours' : 'days';

  return {
    internalId: createInternalId(),
    subject: '',
    body: '',
    delayValue,
    delayUnit,
    order,
    backendId: undefined
    ,
    skipIfReplied: false,
    skipIfBounced: false,
    delayIfReplied: null
  };
}

export function createBlankState(): SequenceBuilderState {
  return {
    id: null,
    name: '',
    steps: [createDefaultStep(1)],
    status: 'draft',
    launchAt: null,
    launchedAt: null,
    senderId: null,
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
      sendWindows: []
    },
    stopCondition: 'on_reply',
    stopOnBounce: false,
    minGapMinutes: null,
    contactIds: []
  };
}

export function mapDetailToBuilder(detail: SequenceDetail): SequenceBuilderState {
  const steps = Array.isArray(detail.steps) ? detail.steps : [];
  const ordered = steps.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const mappedSteps = ordered.length === 0
    ? [createDefaultStep(1)]
    : ordered.map((step, index) => {
        const { value, unit } = hoursToDelay(step.delayHours ?? 0);
        return {
          internalId: createInternalId(),
          backendId: step.id,
          subject: step.subject ?? '',
          body: step.body ?? '',
          delayValue: value,
          delayUnit: unit,
          order: index + 1
          ,
          skipIfReplied: step.skipIfReplied ?? false,
          skipIfBounced: step.skipIfBounced ?? false,
          delayIfReplied: step.delayIfReplied ?? null
        } satisfies BuilderStep;
      });

  return {
    id: detail.id,
    name: detail.name,
    steps: mappedSteps,
    updatedAt: detail.updatedAt,
    status: detail.status,
    launchAt: detail.launchAt ?? null,
    launchedAt: detail.launchedAt ?? null,
    senderId: detail.senderId ?? null,
    tracking: detail.tracking ?? {
      trackOpens: true,
      trackClicks: true,
      enableUnsubscribe: true
    },
    schedule: {
      mode: detail.schedule?.mode ?? 'immediate',
      sendTime: detail.schedule?.sendTime ?? null,
      sendWindowStart: detail.schedule?.sendWindowStart ?? null,
      sendWindowEnd: detail.schedule?.sendWindowEnd ?? null,
      respectContactTimezone: detail.schedule?.respectContactTimezone ?? true,
      fallbackTimezone: detail.schedule?.fallbackTimezone ?? null,
      timezone: detail.schedule?.timezone ?? null,
      sendDays: Array.isArray(detail.schedule?.sendDays)
        ? [...(detail.schedule?.sendDays ?? [])]
        : [],
      sendWindows: Array.isArray(detail.schedule?.sendWindows)
        ? [...(detail.schedule?.sendWindows ?? [])]
        : []
    },
    stopCondition: detail.stopCondition ?? 'on_reply',
    stopOnBounce: detail.stopOnBounce ?? false,
    minGapMinutes: detail.minGapMinutes ?? null,
    // contact enrollment has moved to the Sequence Status UI; keep builder contactIds empty
    contactIds: []
  };
}

export function validateBuilderSteps(steps: BuilderStep[]) {
  if (steps.length === 0) {
    return false;
  }
  return steps.every((step) => {
    const hasContent = step.subject.trim().length > 0 && step.body.trim().length > 0;
    const hasValidDelay = step.delayValue >= 0;
    const hasValidReplyDelay =
      step.delayIfReplied == null || (typeof step.delayIfReplied === 'number' && step.delayIfReplied >= 0);
    return hasContent && hasValidDelay && hasValidReplyDelay;
  });
}

export type SequenceUpdatePayload = ReturnType<typeof buildPayloadFromState>;

export function buildPayloadFromState(state: SequenceBuilderState) {
  const uniqueContactIds = Array.from(
    new Set(
      (state.contactIds ?? []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    )
  );
  return {
    name: state.name.trim(),
    senderId: state.senderId,
    launchAt: state.launchAt ?? null,
    contactIds: uniqueContactIds,
    contacts: uniqueContactIds,
    minGapMinutes:
      typeof state.minGapMinutes === 'number' && Number.isFinite(state.minGapMinutes)
        ? Math.max(0, Math.floor(state.minGapMinutes))
        : null,
    steps: state.steps.map((step, index) => ({
      id: step.backendId,
      subject: step.subject.trim(),
      body: step.body.trim(),
      delay: delayToHours(step.delayValue, step.delayUnit),
      skipIfReplied: Boolean(step.skipIfReplied),
      skipIfBounced: Boolean(step.skipIfBounced),
      delayIfReplied: step.delayIfReplied ?? null,
      order: index + 1
    }))
  };
}

export function arePayloadsEqual(a: SequenceUpdatePayload, b: SequenceUpdatePayload) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function normaliseTimestamp(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

export function normaliseNullableTimestamp(value: unknown) {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

const TOKEN_PATTERN = /\{\{([a-zA-Z0-9]+)\}\}/g;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightTokens(text: string) {
  const safe = escapeHtml(text).replace(/\n/g, '<br />');

  return safe.replace(TOKEN_PATTERN, (_, token: string) => {
    if (!SUPPORTED_PERSONALISATION_TOKENS.includes(token as (typeof SUPPORTED_PERSONALISATION_TOKENS)[number])) {
      return `{{${token}}}`;
    }
    return `<span class=\"inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary\">{{${token}}}</span>`;
  });
}

export function formatDelay(hours: number) {
  if (hours === 0) {
    return 'Send immediately';
  }

  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? 'Wait 1 day' : `Wait ${days} days`;
  }

  return hours === 1 ? 'Wait 1 hour' : `Wait ${hours} hours`;
}
