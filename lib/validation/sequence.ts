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

export const sequenceCreateSchema = z.object({
  name: z
    .string({ required_error: 'Sequence name is required' })
    .trim()
    .min(1, 'Sequence name is required'),
  senderId: senderIdSchema,
  steps: z
    .array(sequenceStepSchema, { required_error: 'Provide at least one step' })
    .min(1, 'Provide at least one step')
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
    .min(1, 'Provide at least one step')
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

const deliveryStatusFilterSchema = z.enum(['all', 'sent', 'failed', 'retrying']);

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

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

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
  'title',
  'phone'
] as const;

export type PersonalisationToken = (typeof SUPPORTED_PERSONALISATION_TOKENS)[number];
