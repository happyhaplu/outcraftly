export type SequenceLifecycleStatus = 'draft' | 'active' | 'paused';

export type SequenceSender = {
  id: number;
  name: string;
  email: string;
  status: string;
};

export type SequenceTrackingSettings = {
  trackOpens: boolean;
  trackClicks: boolean;
  enableUnsubscribe: boolean;
};

export type SequenceStopCondition = 'manual' | 'on_reply' | 'on_reply_or_bounce';

export type SequenceScheduleMode = 'immediate' | 'fixed' | 'window';

export type SequenceSentPerStep = Record<string, number>;

export type SequenceStepSendSummary = {
  id: string;
  order: number | null;
  subject: string | null;
  sent: number;
};

export type SequenceSchedulePreferences = {
  mode: SequenceScheduleMode;
  sendTime: string | null;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  respectContactTimezone: boolean;
  fallbackTimezone: string | null;
  timezone?: string | null;
  sendDays?: string[] | null;
  sendWindows?: Array<{ start: string; end: string }> | null;
};

export type SequenceSummary = {
  id: string;
  name: string;
  status: SequenceLifecycleStatus;
  createdAt: string | null;
  updatedAt: string | null;
  launchAt: string | null;
  launchedAt: string | null;
  deletedAt: string | null;
  senderId: number | null;
  sender: SequenceSender | null;
  stepCount: number;
  tracking: SequenceTrackingSettings;
  schedule: SequenceSchedulePreferences;
  stopCondition: SequenceStopCondition;
  stopOnBounce: boolean;
  minGapMinutes: number | null;
  replyCount: number | null;
  sentPerStep: SequenceSentPerStep;
  stepSendSummary: SequenceStepSendSummary[];
  hasMissingMetadata: boolean;
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
  launchAt: string | null;
  launchedAt: string | null;
  senderId: number | null;
  sender: SequenceSender | null;
  steps: SequenceStep[];
  tracking: SequenceTrackingSettings;
  schedule: SequenceSchedulePreferences;
  stopCondition: SequenceStopCondition;
  stopOnBounce: boolean;
  minGapMinutes: number | null;
  contactIds: string[];
};

export type SequenceDeliveryStatus = 'pending' | 'sent' | 'replied' | 'bounced' | 'failed' | 'skipped';

export type DeliveryLogStatus = 'sent' | 'replied' | 'bounced' | 'failed' | 'retrying' | 'skipped' | 'delayed' | 'manual_send';

export type DeliverySkipReason =
  | 'draft'
  | 'paused'
  | 'deleted'
  | 'status_changed'
  | 'reply_stop'
  | 'reply_delay'
  | 'bounce_policy'
  | 'outside_window';

export type SequenceStatusSummary = {
  total: number;
  pending: number;
  sent: number;
  replied: number;
  replyCount: number | null;
  bounced: number;
  failed: number;
  skipped: number;
  lastActivity: string | null;
};

export type SequenceStatusSummaryMeta = {
  summaryKeys: readonly string[];
  payloadHasReplyCount: boolean;
  aggregatedReplyCount: number;
  repliedCount: number;
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
  lastThrottleAt: string | null;
  scheduleMode: 'fixed' | 'window' | null;
  scheduleSendTime: string | null;
  scheduleWindowStart: string | null;
  scheduleWindowEnd: string | null;
  scheduleRespectTimezone: boolean;
  scheduleFallbackTimezone: string | null;
  scheduleTimezone?: string | null;
  scheduleSendDays?: string[] | null;
  scheduleSendWindows?: Array<{ start: string; end: string }> | null;
  manualTriggeredAt?: string | null;
  manualSentAt?: string | null;
};

export type SequenceWorkerSnapshot = {
  queueSize: number;
  lastRunAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  minSendIntervalMinutes: number;
};

export type SequenceLifecycleSnapshot = {
  id: string;
  name: string;
  status: SequenceLifecycleStatus;
  createdAt: string | null;
  updatedAt: string | null;
  launchAt: string | null;
  launchedAt: string | null;
  senderId: number | null;
  sender: SequenceSender | null;
  minGapMinutes: number | null;
  hasMissingMetadata?: boolean;
};

export type SequenceDeliveryLogEntry = {
  id: string;
  status: DeliveryLogStatus;
  type: 'send' | 'reply' | 'bounce' | null;
  attempts: number;
  createdAt: string;
  messageId: string | null;
  errorMessage: string | null;
  skipReason: DeliverySkipReason | null;
  rescheduledFor: string | null;
  delayReason: string | null;
  delayMs: number | null;
  minIntervalMinutes: number | null;
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
  launchAt: string | null;
  launchedAt?: string | null;
  senderId: number | null;
  tracking?: SequenceTrackingSettings;
  schedule?: SequenceSchedulePreferences;
  stopCondition?: SequenceStopCondition;
  stopOnBounce?: boolean;
  minGapMinutes?: number | null;
  contactIds: string[];
};

export type SequenceWizardTracking = SequenceTrackingSettings;

export type SequenceWizardSchedule = SequenceSchedulePreferences & {
  launchAt: string | null;
};

export type SequenceWizardState = {
  name: string;
  steps: BuilderStep[];
  senderId: number | null;
  launchAt: string | null;
  tracking: SequenceWizardTracking;
  schedule: SequenceWizardSchedule;
  stopCondition: SequenceStopCondition;
  stopOnBounce: boolean;
  minGapMinutes: number | null;
  contactIds: string[];
};
