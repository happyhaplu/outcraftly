import { z } from 'zod';

export const senderFormSchema = z.object({
  name: z
    .string({ required_error: 'Sender name is required' })
    .trim()
    .min(1, 'Sender name is required'),
  email: z
    .string({ required_error: 'Email address is required' })
    .trim()
    .email('Enter a valid email address'),
  host: z
    .string({ required_error: 'SMTP host is required' })
    .trim()
    .min(1, 'SMTP host is required'),
  port: z.coerce
    .number({ invalid_type_error: 'SMTP port must be a number' })
    .int('SMTP port must be a whole number')
    .min(1, 'SMTP port must be between 1 and 65535')
    .max(65535, 'SMTP port must be between 1 and 65535'),
  smtpSecurity: z
    .enum(['SSL/TLS', 'STARTTLS', 'None'], {
      required_error: 'SMTP security mode is required'
    })
    .default('SSL/TLS'),
  username: z
    .string({ required_error: 'SMTP username is required' })
    .trim()
    .min(1, 'SMTP username is required'),
  password: z
    .string({ required_error: 'SMTP password is required' })
    .min(1, 'SMTP password is required'),
  inboundHost: z.string().trim().min(1, 'Inbound host is required').optional().or(z.literal('')),
  inboundPort: z.coerce
    .number({ invalid_type_error: 'Inbound port must be a number' })
    .int('Inbound port must be a whole number')
    .min(1, 'Inbound port must be between 1 and 65535')
    .max(65535, 'Inbound port must be between 1 and 65535')
    .optional()
    .or(z.literal('')),
  inboundSecurity: z.enum(['SSL/TLS', 'STARTTLS', 'None']).optional().or(z.literal('')),
  inboundProtocol: z.enum(['IMAP', 'POP3']).optional().or(z.literal(''))
});

export type SenderFormValues = z.infer<typeof senderFormSchema>;
