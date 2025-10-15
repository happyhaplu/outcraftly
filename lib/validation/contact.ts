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

export const contactCreateSchema = z.object({
  ...baseContactSchema,
  tags: z.array(z.string()).default([])
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
export type ContactCreateValues = z.infer<typeof contactCreateSchema>;

export function parseTags(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
