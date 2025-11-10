import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  uniqueIndex,
  real,
  uuid,
  jsonb,
  index,
  boolean,
  pgEnum,
  date
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const userPlanEnum = pgEnum('user_plan', ['Trial', 'Starter', 'Pro', 'Scale', 'Scale Plus']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive']);
export const paymentStatusEnum = pgEnum('payment_status', ['trial', 'unpaid', 'paid']);
export const contactCustomFieldTypeEnum = pgEnum('contact_custom_field_type', ['text', 'number', 'date']);
export const senderSecurityEnum = pgEnum('sender_security', ['SSL/TLS', 'STARTTLS', 'None']);
export const inboundProtocolEnum = pgEnum('inbound_protocol', ['IMAP', 'POP3']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  signupDate: timestamp('signup_date').notNull().defaultNow(),
  trialExpiresAt: timestamp('trial_expires_at'),
  plan: userPlanEnum('plan').notNull().default('Starter'),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  timezone: varchar('timezone', { length: 100 })
});

export const plans = pgTable(
  'plans',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    maxEmailsPerMonth: integer('max_emails_per_month').notNull(),
    maxProspects: integer('max_prospects').notNull(),
    maxCredits: integer('max_credits').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    isTrial: boolean('is_trial').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => ({
    nameIdx: uniqueIndex('plans_name_idx').on(table.name),
    activeIdx: index('plans_active_idx').on(table.isActive),
    trialIdx: index('plans_trial_idx').on(table.isTrial)
  })
);

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

export const senders = pgTable(
  'senders',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    name: varchar('name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    host: varchar('host', { length: 255 }).notNull(),
    port: integer('port').notNull(),
    smtpSecurity: senderSecurityEnum('smtp_security').notNull().default('SSL/TLS'),
    username: varchar('username', { length: 255 }).notNull(),
    password: text('password').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    bounceRate: real('bounce_rate').notNull().default(0),
    quotaUsed: integer('quota_used').notNull().default(0),
    quotaLimit: integer('quota_limit').notNull().default(1000),
    inboundHost: varchar('inbound_host', { length: 255 }),
    inboundPort: integer('inbound_port'),
    inboundSecurity: senderSecurityEnum('inbound_security'),
    inboundProtocol: inboundProtocolEnum('inbound_protocol')
  },
  (table) => ({
    uniqueTeamEmail: uniqueIndex('senders_team_email_idx').on(
      table.teamId,
      table.email
    )
  })
);

export const sequenceDeliveryStatusEnum = pgEnum('sequence_delivery_status', [
  'pending',
  'sent',
  'replied',
  'bounced',
  'failed',
  'skipped'
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'sent',
  'replied',
  'failed',
  'retrying',
  'skipped',
  'delayed',
  'manual_send'
]);

export const sequenceStatusEnum = pgEnum('sequence_status', ['draft', 'active', 'paused']);

export const sequences = pgTable(
  'sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id').references(() => senders.id, {
      onDelete: 'set null'
    }),
    name: text('name').notNull(),
  status: sequenceStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
    launchAt: timestamp('launch_at'),
    launchedAt: timestamp('launched_at'),
    trackOpens: boolean('track_opens').notNull().default(true),
    trackClicks: boolean('track_clicks').notNull().default(true),
    enableUnsubscribe: boolean('enable_unsubscribe').notNull().default(true),
    stopCondition: varchar('stop_condition', { length: 32 }).notNull().default('on_reply'),
    stopOnBounce: boolean('stop_on_bounce').notNull().default(false),
  minGapMinutes: integer('min_gap_minutes'),
    scheduleMode: varchar('schedule_mode', { length: 16 }),
    scheduleSendTime: varchar('schedule_send_time', { length: 5 }),
    scheduleWindowStart: varchar('schedule_window_start', { length: 5 }),
    scheduleWindowEnd: varchar('schedule_window_end', { length: 5 }),
    scheduleRespectTimezone: boolean('schedule_respect_timezone').notNull().default(true),
    scheduleFallbackTimezone: varchar('schedule_fallback_timezone', { length: 100 }),
    scheduleTimezone: varchar('schedule_timezone', { length: 100 }),
    scheduleSendDays: jsonb('schedule_send_days').$type<string[] | null>(),
    scheduleSendWindows: jsonb('schedule_send_windows').$type<Array<{ start: string; end: string }> | null>()
  }
);

export const sequenceSteps = pgTable(
  'sequence_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => sequences.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
  delayHours: real('delay_hours').notNull().default(0),
    skipIfReplied: boolean('skip_if_replied').notNull().default(false),
    skipIfBounced: boolean('skip_if_bounced').notNull().default(false),
    delayIfReplied: integer('delay_if_replied'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => ({
    sequenceOrderIdx: index('sequence_steps_sequence_order_idx').on(table.sequenceId, table.order)
  })
);

// NOTE: Core contact schema for the contacts module. Custom field tables extend this definition.
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    company: varchar('company', { length: 255 }).notNull(),
  jobTitle: varchar('job_title', { length: 150 }),
    timezone: varchar('timezone', { length: 100 }),
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => ({
    uniqueTeamEmail: uniqueIndex('contacts_team_email_idx').on(table.teamId, table.email),
    tagsGinIndex: index('contacts_tags_gin_idx').using('gin', table.tags)
  })
);

export const contactCustomFieldDefinitions = pgTable(
  'contact_custom_field_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    key: varchar('key', { length: 120 }).notNull(),
    type: contactCustomFieldTypeEnum('type').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => ({
    uniqueTeamKey: uniqueIndex('contact_custom_field_definitions_team_key_idx').on(table.teamId, table.key),
    teamIdx: index('contact_custom_field_definitions_team_idx').on(table.teamId)
  })
);

export const contactCustomFieldValues = pgTable(
  'contact_custom_field_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id')
      .notNull()
      .references(() => contactCustomFieldDefinitions.id, { onDelete: 'cascade' }),
    textValue: text('text_value'),
    numberValue: real('number_value'),
    dateValue: date('date_value'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => ({
    contactFieldUnique: uniqueIndex('contact_custom_field_values_unique').on(table.contactId, table.fieldId),
    contactIdx: index('contact_custom_field_values_contact_idx').on(table.contactId),
    fieldIdx: index('contact_custom_field_values_field_idx').on(table.fieldId)
  })
);

export const contactSequenceStatus = pgTable(
  'contact_sequence_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => sequences.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id').references(() => sequenceSteps.id, { onDelete: 'set null' }),
    status: sequenceDeliveryStatusEnum('status').notNull().default('pending'),
    scheduledAt: timestamp('scheduled_at').defaultNow(),
  scheduleMode: varchar('schedule_mode', { length: 10 }),
  scheduleSendTime: varchar('schedule_send_time', { length: 5 }),
  scheduleWindowStart: varchar('schedule_window_start', { length: 5 }),
  scheduleWindowEnd: varchar('schedule_window_end', { length: 5 }),
  scheduleRespectTimezone: boolean('schedule_respect_timezone').notNull().default(true),
  scheduleFallbackTimezone: varchar('schedule_fallback_timezone', { length: 100 }),
  scheduleTimezone: varchar('schedule_timezone', { length: 100 }),
  scheduleSendDays: jsonb('schedule_send_days').$type<string[] | null>(),
  scheduleSendWindows: jsonb('schedule_send_windows').$type<Array<{ start: string; end: string }> | null>(),
  manualTriggeredAt: timestamp('manual_triggered_at'),
  manualSentAt: timestamp('manual_sent_at'),
    sentAt: timestamp('sent_at'),
    attempts: integer('attempts').notNull().default(0),
    replyAt: timestamp('reply_at'),
    bounceAt: timestamp('bounce_at'),
    skippedAt: timestamp('skipped_at'),
    lastUpdated: timestamp('last_updated').notNull().defaultNow()
  },
  (table) => ({
    contactSequenceIdx: uniqueIndex('contact_sequence_status_contact_sequence_idx').on(
      table.contactId,
      table.sequenceId
    ),
    sequenceStatusIdx: index('contact_sequence_status_sequence_status_idx').on(
      table.sequenceId,
      table.status
    )
  })
);

export const deliveryLogs = pgTable(
  'delivery_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => sequences.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => sequenceSteps.id, { onDelete: 'cascade' }),
    statusId: uuid('status_id').references(() => contactSequenceStatus.id, { onDelete: 'set null' }),
    status: deliveryStatusEnum('status').notNull(),
    messageId: text('message_id'),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    skipReason: text('skip_reason'),
    type: varchar('type', { length: 20 }).notNull().default('send'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => ({
    deliveryLogsContactIdx: index('delivery_logs_contact_idx').on(table.contactId),
    deliveryLogsSequenceIdx: index('delivery_logs_sequence_idx').on(table.sequenceId),
    deliveryLogsMessageIdx: index('delivery_logs_message_idx').on(table.messageId)
  })
);

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
  senders: many(senders),
  contacts: many(contacts),
  usage: many(teamUsageLimits)
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const sendersRelations = relations(senders, ({ one }) => ({
  team: one(teams, {
    fields: [senders.teamId],
    references: [teams.id],
  }),
}));

export const sequencesRelations = relations(sequences, ({ one, many }) => ({
  team: one(teams, {
    fields: [sequences.teamId],
    references: [teams.id]
  }),
  owner: one(users, {
    fields: [sequences.userId],
    references: [users.id]
  }),
  sender: one(senders, {
    fields: [sequences.senderId],
    references: [senders.id]
  }),
  steps: many(sequenceSteps),
  contactStatuses: many(contactSequenceStatus)
}));

export const sequenceStepsRelations = relations(sequenceSteps, ({ one, many }) => ({
  sequence: one(sequences, {
    fields: [sequenceSteps.sequenceId],
    references: [sequences.id]
  }),
  contactStatuses: many(contactSequenceStatus)
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  team: one(teams, {
    fields: [contacts.teamId],
    references: [teams.id]
  }),
  sequenceStatuses: many(contactSequenceStatus),
  customFieldValues: many(contactCustomFieldValues)
}));

export const contactCustomFieldDefinitionsRelations = relations(contactCustomFieldDefinitions, ({ one, many }) => ({
  team: one(teams, {
    fields: [contactCustomFieldDefinitions.teamId],
    references: [teams.id]
  }),
  values: many(contactCustomFieldValues)
}));

export const contactCustomFieldValuesRelations = relations(contactCustomFieldValues, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactCustomFieldValues.contactId],
    references: [contacts.id]
  }),
  field: one(contactCustomFieldDefinitions, {
    fields: [contactCustomFieldValues.fieldId],
    references: [contactCustomFieldDefinitions.id]
  })
}));

export const teamUsageLimits = pgTable(
  'team_usage_limits',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    monthStart: date('month_start').notNull(),
    prospectsUsed: integer('prospects_used').notNull().default(0),
    emailsSent: integer('emails_sent').notNull().default(0),
    creditsUsed: integer('credits_used').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => ({
    teamMonthUnique: uniqueIndex('team_usage_limits_team_month_unique').on(
      table.teamId,
      table.monthStart
    ),
    teamIdx: index('team_usage_limits_team_idx').on(table.teamId)
  })
);

export const teamUsageLimitsRelations = relations(teamUsageLimits, ({ one }) => ({
  team: one(teams, {
    fields: [teamUsageLimits.teamId],
    references: [teams.id]
  })
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const contactSequenceStatusRelations = relations(contactSequenceStatus, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactSequenceStatus.contactId],
    references: [contacts.id]
  }),
  sequence: one(sequences, {
    fields: [contactSequenceStatus.sequenceId],
    references: [sequences.id]
  }),
  step: one(sequenceSteps, {
    fields: [contactSequenceStatus.stepId],
    references: [sequenceSteps.id]
  })
}));

export const deliveryLogsRelations = relations(deliveryLogs, ({ one }) => ({
  contact: one(contacts, {
    fields: [deliveryLogs.contactId],
    references: [contacts.id]
  }),
  sequence: one(sequences, {
    fields: [deliveryLogs.sequenceId],
    references: [sequences.id]
  }),
  step: one(sequenceSteps, {
    fields: [deliveryLogs.stepId],
    references: [sequenceSteps.id]
  }),
  status: one(contactSequenceStatus, {
    fields: [deliveryLogs.statusId],
    references: [contactSequenceStatus.id]
  })
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Sender = typeof senders.$inferSelect;
export type NewSender = typeof senders.$inferInsert;
export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;
export type SequenceLifecycleStatus = (typeof sequenceStatusEnum.enumValues)[number];
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type NewSequenceStep = typeof sequenceSteps.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactCustomFieldDefinition = typeof contactCustomFieldDefinitions.$inferSelect;
export type NewContactCustomFieldDefinition = typeof contactCustomFieldDefinitions.$inferInsert;
export type ContactCustomFieldValue = typeof contactCustomFieldValues.$inferSelect;
export type NewContactCustomFieldValue = typeof contactCustomFieldValues.$inferInsert;
export type ContactSequenceStatus = typeof contactSequenceStatus.$inferSelect;
export type NewContactSequenceStatus = typeof contactSequenceStatus.$inferInsert;
export type DeliveryLog = typeof deliveryLogs.$inferSelect;
export type NewDeliveryLog = typeof deliveryLogs.$inferInsert;
export type SenderStatus = Sender['status'];
export type SequenceDeliveryStatus = ContactSequenceStatus['status'];
export type DeliveryStatus = DeliveryLog['status'];
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}
