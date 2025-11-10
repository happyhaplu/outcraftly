import { z } from 'zod';

import { contactCustomFieldTypeEnum } from '@/lib/db/schema';

const CUSTOM_FIELD_TYPES = contactCustomFieldTypeEnum.enumValues;

export const contactCustomFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPES);

export const contactCustomFieldCreateSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be 120 characters or fewer'),
  type: contactCustomFieldTypeSchema,
  description: z
    .string()
    .trim()
    .max(300, 'Description must be 300 characters or fewer')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
});

export const contactCustomFieldUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(120, 'Name must be 120 characters or fewer')
      .optional(),
    type: contactCustomFieldTypeSchema.optional(),
    description: z
      .union([
        z
          .string()
          .trim()
          .max(300, 'Description must be 300 characters or fewer'),
        z.null()
      ])
      .optional()
  })
  .refine((value) => 'name' in value || 'type' in value || 'description' in value, {
    message: 'Provide at least one field to update'
  });

export type ContactCustomFieldCreateValues = z.infer<typeof contactCustomFieldCreateSchema>;
export type ContactCustomFieldUpdateValues = z.infer<typeof contactCustomFieldUpdateSchema>;
export type ContactCustomFieldType = z.infer<typeof contactCustomFieldTypeSchema>;
