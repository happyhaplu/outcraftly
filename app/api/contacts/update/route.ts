import { NextResponse } from 'next/server';

import { getTeamForUser, getUser, updateContact } from '@/lib/db/queries';
import { contactUpdateSchema, normalizeTags } from '@/lib/validation/contact';

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

    const parsed = contactUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const updateData = {
      firstName: parsed.data.firstName?.trim(),
      lastName: parsed.data.lastName?.trim(),
      company: parsed.data.company?.trim(),
      tags: parsed.data.tags ? normalizeTags(parsed.data.tags) : undefined
    };

    const updated = await updateContact(team.id, parsed.data.id, updateData);

    if (!updated) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: 'Contact updated successfully',
        contact: {
          id: updated.id,
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          company: updated.company,
          tags: updated.tags ?? [],
          createdAt: updated.createdAt
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to update contact', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
