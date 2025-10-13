import { describe, expect, it } from 'vitest';

import { senderFormSchema } from '@/lib/validation/sender';

describe('senderFormSchema', () => {
  it('accepts valid payload', () => {
    const result = senderFormSchema.safeParse({
      name: 'Sales Team',
      email: 'sales@example.com',
      host: 'smtp.example.com',
      port: 587,
      username: 'sales',
      password: 'super-secret'
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid email format', () => {
    const result = senderFormSchema.safeParse({
      name: 'Sales Team',
      email: 'not-an-email',
      host: 'smtp.example.com',
      port: 587,
      username: 'sales',
      password: 'super-secret'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('email');
    }
  });

  it('rejects ports outside valid range', () => {
    const result = senderFormSchema.safeParse({
      name: 'Sales Team',
      email: 'sales@example.com',
      host: 'smtp.example.com',
      port: 70000,
      username: 'sales',
      password: 'super-secret'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('port');
    }
  });
});
