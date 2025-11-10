'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { comparePasswords, setSession } from '@/lib/auth/session';
import { validatedAction } from '@/lib/auth/middleware';

const adminSignInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const adminSignIn = validatedAction(adminSignInSchema, async ({ email, password }) => {
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!admin || admin.role !== 'admin') {
    return { error: 'Invalid email or password.', email };
  }

  const isPasswordValid = await comparePasswords(password, admin.passwordHash);
  if (!isPasswordValid) {
    return { error: 'Invalid email or password.', email };
  }

  await setSession(admin);
  redirect('/admin/dashboard');
});
