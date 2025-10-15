import { NextResponse } from 'next/server';

import { addTagsToContacts, getTeamForUser, getUser } from '@/lib/db/queries';
import { contactBulkTagSchema, normalizeTags } from '@/lib/validation/contact';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
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

    const parsed = contactBulkTagSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const tagsToApply = normalizeTags(parsed.data.tags);
    if (tagsToApply.length === 0) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: { tags: ['Provide at least one valid tag'] }
        },
        { status: 400 }
      );
    }

    const result = await addTagsToContacts(team.id, parsed.data.ids, tagsToApply);

    const message = result.applied === 0
      ? 'No new tags were added — all selected contacts already had these tags.'
      : `${result.applied} ${result.applied === 1 ? 'tag' : 'tags'} added across ${result.updated} ${result.updated === 1 ? 'contact' : 'contacts'}.`;

    return NextResponse.json(
      {
        message,
        updated: result.updated,
        applied: result.applied
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to bulk add tags', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
