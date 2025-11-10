import { NextResponse } from 'next/server';

import {
  getTeamForUser,
  getActiveUser,
  updateContact,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE,
  InvalidCustomFieldValueError
} from '@/lib/db/queries';
import { contactUpdateSchema, normalizeTags } from '@/lib/validation/contact';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
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
      timezone: parsed.data.timezone ?? undefined,
      tags: parsed.data.tags ? normalizeTags(parsed.data.tags) : undefined,
      customFields: parsed.data.customFields
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
          timezone: updated.timezone,
          tags: updated.tags ?? [],
          createdAt: updated.createdAt
        }
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    if (error instanceof InvalidCustomFieldValueError) {
      return NextResponse.json(
        { error: error.message, fieldId: error.fieldId },
        { status: 400 }
      );
    }

    console.error('Failed to update contact', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
