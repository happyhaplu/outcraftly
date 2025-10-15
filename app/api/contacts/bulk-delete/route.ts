import { NextResponse } from 'next/server';

import { bulkDeleteContacts, getTeamForUser, getUser } from '@/lib/db/queries';
import { contactBulkDeleteSchema } from '@/lib/validation/contact';

export const runtime = 'nodejs';

export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const parsed = contactBulkDeleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const removed = await bulkDeleteContacts(team.id, parsed.data.ids);

    return NextResponse.json(
      {
        message: removed === 1 ? '1 contact deleted' : `${removed} contacts deleted`,
        removed
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to bulk delete contacts', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
