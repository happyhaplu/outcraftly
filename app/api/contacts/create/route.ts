import { NextResponse } from 'next/server';

import { getTeamForUser, getUser, insertContacts } from '@/lib/db/queries';
import { contactCreateSchema } from '@/lib/validation/contact';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const data = contactCreateSchema.safeParse(parsedBody);
    if (!data.success) {
      const error = data.error.flatten();
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: error.fieldErrors
        },
        { status: 400 }
      );
    }

    const payload = {
      ...data.data,
      email: data.data.email.toLowerCase(),
      tags: data.data.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)
    };

    const inserted = await insertContacts(team.id, [payload]);

    if (inserted === 0) {
      return NextResponse.json(
        { error: 'A contact with this email already exists.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: 'Contact created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create contact', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
