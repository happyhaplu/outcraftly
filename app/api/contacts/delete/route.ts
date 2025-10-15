import { NextResponse } from 'next/server';

import { deleteContact, getTeamForUser, getUser } from '@/lib/db/queries';
import { contactDeleteSchema } from '@/lib/validation/contact';

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

    const parsed = contactDeleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const deleted = await deleteContact(team.id, parsed.data.id);
    if (deleted === 0) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Contact deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete contact', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
