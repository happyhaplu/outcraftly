import { z } from 'zod';

const delaySchema = z
  .number({ required_error: 'Delay is required' })
  .int('Delay must be an integer value')
  .min(0, 'Delay must be greater than or equal to 0');

const senderIdSchema = z
  .coerce
  .number({ required_error: 'Select a sender account' })
  .int('Select a valid sender account')
  .min(1, 'Select a valid sender account');

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minGapMinutesSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? Number.NaN : parsed;
    }
    return value;
  }, z
    .number({ invalid_type_error: 'Minimum send interval must be a number' })
    .int('Minimum send interval must be a whole number of minutes')
    .min(0, 'Minimum send interval must be at least 0 minutes')
    .max(1440, 'Minimum send interval must be 24 hours or less')
    .nullable()
  )
  .transform((value) => {
    if (value === null) {
      return null;
    }
    return Math.floor(value);
  })
  .optional();

const baseStepSchema = z.object({
  order: z
    .number({ required_error: 'Step order is required' })
    .int('Step order must be an integer')
    .min(1, 'Step order must be at least 1'),
  subject: z
    .string({ required_error: 'Subject is required' })
    .trim()
    .min(1, 'Subject is required'),
  body: z
    .string({ required_error: 'Body is required' })
    .trim()
    .min(1, 'Body is required'),
  delay: delaySchema,
  skipIfReplied: z.boolean().default(false),
  skipIfBounced: z.boolean().default(false),
  delayIfReplied: z
    .number()
    .int('Delay after reply must be an integer value')
    .min(0, 'Delay after reply must be greater than or equal to 0')
    .nullable()
    .default(null)
});

export const sequenceStepSchema = baseStepSchema;

export const sequenceStepUpdateSchema = baseStepSchema.extend({
  id: z
    .string({ required_error: 'Step ID is required' })
    .uuid('Step ID must be a valid UUID')
    .optional()
});

const launchAtSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (value.trim().length === 0) {
      return null;
    }
    return value;
  })
  .refine((value) => {
    if (value == null || value === undefined) {
      return true;
    }
    const parsed = Date.parse(value);
    return !Number.isNaN(parsed);
  }, 'Launch time must be a valid ISO timestamp')
  .refine((value) => {
    if (value == null || value === undefined) {
      return true;
    }
    return new Date(value).getTime() > Date.now();
  }, 'Launch time must be in the future');

export const sequenceTrackingSchema = z
  .object({
    trackOpens: z.boolean().optional(),
    trackClicks: z.boolean().optional(),
    enableUnsubscribe: z.boolean().optional()
  })
  .default({});

const stopConditionSchema = z.enum(['manual', 'on_reply', 'on_reply_or_bounce']);

const sequenceCreationScheduleSchema = z
  .object({
    mode: z.enum(['immediate', 'fixed', 'window']),
    respectContactTimezone: z.boolean().optional().default(true),
    sendTime: z
      .string()
      .trim()
      .regex(timePattern, 'Enter time in HH:MM format')
      .nullable()
      .optional(),
    sendWindowStart: z
      .string()
      .trim()
      .regex(timePattern, 'Enter time in HH:MM format')
      .nullable()
      .optional(),
    sendWindowEnd: z
      .string()
      .trim()
      .regex(timePattern, 'Enter time in HH:MM format')
      .nullable()
      .optional(),
    fallbackTimezone: z
      .string()
      .trim()
      .max(100, 'Timezone must be 100 characters or fewer')
      .nullable()
      .optional()
      .transform((value) => {
        if (value == null) {
          return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      })
      ,
      timezone: z
        .string()
        .trim()
        .max(100)
        .nullable()
        .optional()
        .transform((v) => {
          if (v == null) return null;
          const t = v.trim();
          return t.length > 0 ? t : null;
        }),
      sendDays: z
        .array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']))
        .optional(),
      sendWindows: z
        .array(
          z.object({
            start: z.string().trim().regex(timePattern, 'Enter time in HH:MM format'),
            end: z.string().trim().regex(timePattern, 'Enter time in HH:MM format')
          })
        )
        .optional()
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'fixed') {
      if (!value.sendTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Choose a send time',
          path: ['sendTime']
        });
      }
    }

    if (value.mode === 'window') {
      if (!value.sendWindowStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a window start time',
          path: ['sendWindowStart']
        });
      }
      if (!value.sendWindowEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a window end time',
          path: ['sendWindowEnd']
        });
      }

      if (value.sendWindowStart && value.sendWindowEnd) {
        const [startHour, startMinute] = value.sendWindowStart.split(':').map((part) => Number.parseInt(part, 10));
        const [endHour, endMinute] = value.sendWindowEnd.split(':').map((part) => Number.parseInt(part, 10));
        const startTotal = startHour * 60 + startMinute;
        const endTotal = endHour * 60 + endMinute;
        if (endTotal <= startTotal) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Window end time must be after the start time',
            path: ['sendWindowEnd']
          });
        }
      }
    }

    // validate individual windows and ensure no overlaps
    if (Array.isArray(value.sendWindows) && value.sendWindows.length > 0) {
      const toMinutes = (t: string) => {
        const [hh, mm] = t.split(':').map((p) => Number.parseInt(p, 10));
        return hh * 60 + mm;
      };
      const windows = value.sendWindows.map((w) => ({ start: toMinutes(w.start), end: toMinutes(w.end) }));
      for (let i = 0; i < windows.length; i += 1) {
        if (windows[i].end <= windows[i].start) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Window end must be after start', path: ['sendWindows', i] });
        }
      }
      const sorted = windows.slice().sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length - 1; i += 1) {
        if (sorted[i].end > sorted[i + 1].start) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Send windows must not overlap', path: ['sendWindows'] });
          break;
        }
      }
    }
  })
  .default({
    mode: 'immediate',
    respectContactTimezone: true,
    sendTime: null,
    sendWindowStart: null,
    sendWindowEnd: null,
    fallbackTimezone: null,
    timezone: null,
    sendDays: [],
    sendWindows: []
  });

export const sequenceCreateSchema = z.object({
  name: z
    .string({ required_error: 'Sequence name is required' })
    .trim()
    .min(1, 'Sequence name is required'),
  senderId: senderIdSchema,
  steps: z
    .array(sequenceStepSchema, { required_error: 'Provide at least one step' })
    .min(1, 'Provide at least one step'),
  launchAt: launchAtSchema,
  minGapMinutes: minGapMinutesSchema,
  contacts: z
    .array(
      z
        .string({ required_error: 'Contact ID is required' })
        .uuid('Contact ID must be a valid UUID')
    )
    .optional()
    .default([]),
  tracking: sequenceTrackingSchema,
  stopCondition: stopConditionSchema.optional().default('on_reply'),
  stopOnBounce: z.boolean().optional().default(false),
  schedule: sequenceCreationScheduleSchema
});

export const sequenceUpdateSchema = z.object({
  id: z.string({ required_error: 'Sequence ID is required' }).uuid('Sequence ID must be a valid UUID'),
  name: z
    .string({ required_error: 'Sequence name is required' })
    .trim()
    .min(1, 'Sequence name is required'),
  senderId: senderIdSchema,
  steps: z
    .array(sequenceStepUpdateSchema, { required_error: 'Provide at least one step' })
    .min(1, 'Provide at least one step'),
  launchAt: launchAtSchema,
  minGapMinutes: minGapMinutesSchema,
  contacts: z
    .array(
      z
        .string({ required_error: 'Contact ID is required' })
        .uuid('Contact ID must be a valid UUID')
    )
    .optional()
});

export const sequenceIdSchema = z.object({
  id: z.string({ required_error: 'Sequence ID is required' }).uuid('Sequence ID must be a valid UUID')
});

export const sequenceStepIdSchema = z.object({
  stepId: z
    .string({ required_error: 'Step ID is required' })
    .uuid('Step ID must be a valid UUID')
});

export const sequenceTestEmailSchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .optional()
});

const deliveryStatusFilterSchema = z.enum(['all', 'sent', 'replied', 'bounced', 'failed', 'retrying', 'skipped', 'delayed', 'manual_send']);

export const sequenceLogQuerySchema = z.object({
  status: deliveryStatusFilterSchema.optional().default('all'),
  contact: z
    .string()
    .trim()
    .max(255, 'Contact filter must be 255 characters or fewer')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  from: z
    .string()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Invalid start date'),
  to: z
    .string()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Invalid end date'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export type SequenceLogQueryInput = z.infer<typeof sequenceLogQuerySchema>;

const timeStringSchema = z
  .string({ required_error: 'Time is required' })
  .trim()
  .regex(timePattern, 'Enter time in HH:MM format');

const scheduleBase = z.object({
  respectContactTimezone: z.boolean().default(true)
});

const fixedScheduleSchema = scheduleBase.extend({
  mode: z.literal('fixed'),
  sendTime: timeStringSchema
});

const windowScheduleSchema = scheduleBase.extend({
  mode: z.literal('window'),
  sendWindowStart: timeStringSchema,
  sendWindowEnd: timeStringSchema
});

export const sequenceScheduleSchema = z
  .discriminatedUnion('mode', [fixedScheduleSchema, windowScheduleSchema])
  .superRefine((value, ctx) => {
    if (value.mode === 'window') {
      const [startHour, startMinute] = value.sendWindowStart.split(':').map((part) => Number.parseInt(part, 10));
      const [endHour, endMinute] = value.sendWindowEnd.split(':').map((part) => Number.parseInt(part, 10));
      const startTotal = startHour * 60 + startMinute;
      const endTotal = endHour * 60 + endMinute;
      if (endTotal <= startTotal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Window end time must be after the start time',
          path: ['sendWindowEnd']
        });
      }
    }
  });

export const sequenceEnrollmentSchema = z.object({
  sequenceId: z
    .string({ required_error: 'Sequence ID is required' })
    .uuid('Sequence ID must be a valid UUID'),
  contactIds: z
    .array(
      z
        .string({ required_error: 'Contact ID is required' })
        .uuid('Contact ID must be a valid UUID'),
      { required_error: 'Provide at least one contact to enroll' }
    )
    .min(1, 'Select at least one contact to enroll'),
  schedule: sequenceScheduleSchema.optional()
});
export type SequenceScheduleInput = z.infer<typeof sequenceScheduleSchema>;
export type SequenceCreationScheduleInput = z.infer<typeof sequenceCreationScheduleSchema>;
export type SequenceTrackingInput = z.infer<typeof sequenceTrackingSchema>;
export type SequenceStopConditionInput = z.infer<typeof stopConditionSchema>;

export type SequenceStepInput = z.infer<typeof sequenceStepSchema>;
export type SequenceStepUpdateInput = z.infer<typeof sequenceStepUpdateSchema>;
export type SequenceCreateInput = z.infer<typeof sequenceCreateSchema>;
export type SequenceUpdateInput = z.infer<typeof sequenceUpdateSchema>;
export type SequenceIdInput = z.infer<typeof sequenceIdSchema>;
export type SequenceEnrollmentInput = z.infer<typeof sequenceEnrollmentSchema>;

export const SUPPORTED_PERSONALISATION_TOKENS = [
  'firstName',
  'lastName',
  'company',
  'email',
  'jobTitle',
  'title',
  'phone',
  'tags'
] as const;

export type PersonalisationToken = (typeof SUPPORTED_PERSONALISATION_TOKENS)[number];
