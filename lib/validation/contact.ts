import { z } from 'zod';

const baseContactSchema = {
  firstName: z
    .string({ required_error: 'First name is required' })
    .trim()
    .min(1, 'First name is required'),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .trim()
    .min(1, 'Last name is required'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Enter a valid email address'),
  company: z
    .string({ required_error: 'Company is required' })
    .trim()
    .min(1, 'Company is required')
};

export const contactFormSchema = z.object({
  ...baseContactSchema,
  tags: z
    .string()
    .optional()
    .transform((value) => value ?? '')
});
export const contactUpdateSchema = z
  .object({
    id: z.string().uuid('Contact id must be a valid UUID'),
    firstName: baseContactSchema.firstName.optional(),
    lastName: baseContactSchema.lastName.optional(),
    company: baseContactSchema.company.optional(),
    tags: z.array(z.string()).optional()
  })
  .refine(
    (value) =>
      typeof value.firstName === 'string' ||
      typeof value.lastName === 'string' ||
      typeof value.company === 'string' ||
      Array.isArray(value.tags),
    {
      message: 'At least one field must be provided',
      path: ['firstName']
    }
  );

export const contactCreateSchema = z.object({
  ...baseContactSchema,
  tags: z.array(z.string()).default([])
});

export const contactDeleteSchema = z.object({
  id: z.string({ required_error: 'Contact ID is required' }).uuid('Contact ID must be a valid UUID')
});

export const contactBulkDeleteSchema = z.object({
  ids: z
    .array(z.string().uuid('Each contact ID must be a valid UUID'), {
      required_error: 'Provide at least one contact ID to delete'
    })
    .min(1, 'Provide at least one contact ID to delete')
});

export const contactBulkTagSchema = z.object({
  ids: z
    .array(z.string().uuid('Each contact ID must be a valid UUID'), {
      required_error: 'Provide at least one contact ID to update'
    })
    .min(1, 'Provide at least one contact ID to update'),
  tags: z
    .array(z.string().min(1, 'Tags cannot be empty'), {
      required_error: 'Provide at least one tag'
    })
    .min(1, 'Provide at least one tag')
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
export type ContactCreateValues = z.infer<typeof contactCreateSchema>;
export type ContactUpdateValues = z.infer<typeof contactUpdateSchema>;
export type ContactBulkTagValues = z.infer<typeof contactBulkTagSchema>;

export function parseTags(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function normalizeTags(tags: string[] = []): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) {
      continue;
    }

    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }

    seen.add(lower);
    normalized.push(trimmed);
  }

  return normalized;
}
