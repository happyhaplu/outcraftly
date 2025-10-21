export type SequenceLifecycleStatus = 'active' | 'paused';

export type SequenceSender = {
  id: number;
  name: string;
  email: string;
  status: string;
};

export type SequenceSummary = {
  id: string;
  name: string;
  status: SequenceLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  senderId: number | null;
  sender: SequenceSender | null;
  stepCount: number;
};

export type SequenceStep = {
  id?: string;
  subject: string;
  body: string;
  delayHours: number;
  order: number;
  skipIfReplied?: boolean;
  skipIfBounced?: boolean;
  delayIfReplied?: number | null;
};

export type SequenceDetail = {
  id: string;
  name: string;
  status: SequenceLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  senderId: number | null;
  sender: SequenceSender | null;
  steps: SequenceStep[];
};

export type SequenceDeliveryStatus = 'pending' | 'sent' | 'replied' | 'bounced' | 'failed' | 'skipped';

export type DeliveryLogStatus = 'sent' | 'failed' | 'retrying';

export type SequenceStatusSummary = {
  total: number;
  pending: number;
  sent: number;
  replied: number;
  bounced: number;
  failed: number;
  skipped: number;
  lastActivity: string | null;
};

export type SequenceStepSummary = {
  stepId: string | null;
  order: number | null;
  subject: string | null;
  pending: number;
  sent: number;
  replied: number;
  bounced: number;
  failed: number;
  skipped: number;
};

export type SequenceContactStatus = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  timezone: string | null;
  status: SequenceDeliveryStatus;
  lastUpdated: string;
  stepOrder: number | null;
  stepSubject: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  attempts: number;
  replyAt: string | null;
  bounceAt: string | null;
  skippedAt: string | null;
  scheduleMode: 'fixed' | 'window' | null;
  scheduleSendTime: string | null;
  scheduleWindowStart: string | null;
  scheduleWindowEnd: string | null;
  scheduleRespectTimezone: boolean;
  scheduleFallbackTimezone: string | null;
};

export type SequenceWorkerSnapshot = {
  queueSize: number;
  lastRunAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export type SequenceLifecycleSnapshot = {
  id: string;
  name: string;
  status: SequenceLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  senderId: number | null;
  sender: SequenceSender | null;
};

export type SequenceDeliveryLogEntry = {
  id: string;
  status: DeliveryLogStatus;
  attempts: number;
  createdAt: string;
  messageId: string | null;
  errorMessage: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  step: {
    id: string;
    order: number | null;
    subject: string | null;
  } | null;
};

export type SequenceReplyActivity = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  subject: string | null;
  snippet: string | null;
  occurredAt: string;
  messageId: string | null;
  stepSubject: string | null;
};

export type SequenceBounceActivity = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  reason: string | null;
  detail: string | null;
  occurredAt: string;
  messageId: string | null;
  stepSubject: string | null;
};

export type BuilderStep = {
  internalId: string;
  backendId?: string;
  subject: string;
  body: string;
  delayValue: number;
  delayUnit: 'hours' | 'days';
  order: number;
  skipIfReplied?: boolean;
  skipIfBounced?: boolean;
  delayIfReplied?: number | null;
};

export type SequenceBuilderState = {
  id: string | null;
  name: string;
  steps: BuilderStep[];
  updatedAt?: string;
  status?: SequenceLifecycleStatus;
  senderId: number | null;
};
