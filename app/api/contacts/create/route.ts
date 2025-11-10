import { NextResponse } from 'next/server';

import {
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE,
  PlanLimitExceededError,
  createContactWithCustomFields,
  InvalidCustomFieldValueError
} from '@/lib/db/queries';
import { contactCreateSchema } from '@/lib/validation/contact';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await getActiveUser();

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

    const inserted = await createContactWithCustomFields(team.id, {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      company: payload.company,
      jobTitle: payload.jobTitle,
      tags: payload.tags,
      timezone: payload.timezone,
      customFields: payload.customFields ?? undefined
    });

    if (!inserted) {
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
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    if (error instanceof PlanLimitExceededError) {
      return NextResponse.json(
        {
          error: error.message,
          resource: error.resource,
          limit: error.limit,
          remaining: error.remaining
        },
        { status: 403 }
      );
    }

    if (error instanceof InvalidCustomFieldValueError) {
      return NextResponse.json(
        { error: error.message, fieldId: error.fieldId },
        { status: 400 }
      );
    }

    console.error('Failed to create contact', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
