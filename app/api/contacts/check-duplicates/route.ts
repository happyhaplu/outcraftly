import { NextResponse } from 'next/server';
import { inArray, eq, and } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { contacts } from '@/lib/db/schema';
import {
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      !('emails' in payload) ||
      !Array.isArray((payload as { emails: unknown }).emails)
    ) {
      return NextResponse.json({ error: 'Request must include an "emails" array' }, { status: 400 });
    }

    const emails = (payload as { emails: unknown[] }).emails
      .filter((value): value is string => typeof value === 'string')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0);

    if (emails.length === 0) {
      return NextResponse.json({ duplicates: [] }, { status: 200 });
    }

    const uniqueEmails = Array.from(new Set(emails)).slice(0, 1000);

    const existing = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.teamId, team.id), inArray(contacts.email, uniqueEmails)));

    return NextResponse.json(
      { duplicates: existing.map((row) => row.email.toLowerCase()) },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to check duplicate contacts', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
