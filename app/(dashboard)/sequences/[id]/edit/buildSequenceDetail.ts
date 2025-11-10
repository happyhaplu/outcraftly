import type { SequenceDetail, SequenceScheduleMode, SequenceStopCondition } from '../../types';
import { normaliseNullableTimestamp, normaliseTimestamp } from '../../utils';
import type { getSequenceWithSteps } from '@/lib/db/queries';

export function buildSequenceDetail(
  sequence: NonNullable<Awaited<ReturnType<typeof getSequenceWithSteps>>>
): SequenceDetail {
  const scheduleMode = (sequence.scheduleMode ?? 'immediate') as SequenceScheduleMode;
  const stopCondition = (sequence.stopCondition ?? 'on_reply') as SequenceStopCondition;
  const explicitContactIds = Array.isArray(sequence.contactIds) ? sequence.contactIds : [];
  const sequenceWithContacts = sequence as unknown as { contacts?: Array<{ id?: string | null }> };
  const relatedContactIds = Array.isArray(sequenceWithContacts.contacts)
    ? sequenceWithContacts.contacts
        .map((contact) => (typeof contact?.id === 'string' ? contact.id : null))
        .filter((id): id is string => Boolean(id))
    : [];
  const contactIds = Array.from(new Set([...explicitContactIds, ...relatedContactIds]));
  return {
    id: sequence.id,
    name: sequence.name,
    status: sequence.status,
    createdAt: normaliseTimestamp(sequence.createdAt),
    updatedAt: normaliseTimestamp(sequence.updatedAt),
    launchAt: normaliseNullableTimestamp(sequence.launchAt),
    launchedAt: normaliseNullableTimestamp(sequence.launchedAt),
    senderId: sequence.senderId ?? null,
    sender:
      sequence.sender && sequence.sender.id
        ? {
            id: sequence.sender.id,
            name: sequence.sender.name,
            email: sequence.sender.email,
            status: sequence.sender.status
          }
        : null,
    steps: (sequence.steps ?? []).map((step) => ({
      id: step.id,
      subject: step.subject,
      body: step.body,
      delayHours: step.delayHours ?? 0,
      order: step.order ?? 0,
      skipIfReplied: step.skipIfReplied ?? false,
      skipIfBounced: step.skipIfBounced ?? false,
      delayIfReplied: step.delayIfReplied ?? null
    })),
    tracking: {
      trackOpens: Boolean(sequence.trackOpens),
      trackClicks: Boolean(sequence.trackClicks),
      enableUnsubscribe: Boolean(sequence.enableUnsubscribe)
    },
    schedule: {
      mode: scheduleMode,
      sendTime: sequence.scheduleSendTime ?? null,
      sendWindowStart: sequence.scheduleWindowStart ?? null,
      sendWindowEnd: sequence.scheduleWindowEnd ?? null,
      respectContactTimezone: sequence.scheduleRespectTimezone ?? true,
      fallbackTimezone: sequence.scheduleFallbackTimezone ?? null
    },
    stopCondition,
    stopOnBounce: Boolean(sequence.stopOnBounce),
    minGapMinutes:
      typeof sequence.minGapMinutes === 'number' && Number.isFinite(sequence.minGapMinutes)
        ? sequence.minGapMinutes
        : null,
    contactIds
  };
}
