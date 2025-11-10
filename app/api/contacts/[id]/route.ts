import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getActiveUser,
  getTeamForUser,
  getContactWithCustomFields,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  id: z.string().uuid('Contact id must be a valid UUID')
});

type ContactRouteParams = { id?: string | string[] };
type ContactRouteContext = { params: Promise<ContactRouteParams> };

export async function GET(request: NextRequest, context: ContactRouteContext) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    let resolvedParams: ContactRouteParams | undefined;
    try {
      resolvedParams = context.params ? await context.params : undefined;
    } catch {
      resolvedParams = undefined;
    }

    const fallbackId = (() => {
      try {
        return new URL(request.url).pathname.split('/').pop() ?? '';
      } catch {
        return '';
      }
    })();

    const rawId = (() => {
      const candidate = resolvedParams?.id;
      if (Array.isArray(candidate)) {
        return candidate[0];
      }
      return candidate;
    })();

    const parsedParams = paramsSchema.safeParse({
      id: rawId ?? fallbackId
    });
    if (!parsedParams.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsedParams.error.flatten().fieldErrors,
          issues: parsedParams.error.issues
        },
        { status: 400 }
      );
    }

    const result = await getContactWithCustomFields(team.id, parsedParams.data.id);
    if (!result) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { contact, customFields } = result;
    const createdAt =
      contact.createdAt instanceof Date ? contact.createdAt.toISOString() : String(contact.createdAt);

    return NextResponse.json(
      {
        data: {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          company: contact.company,
          jobTitle: contact.jobTitle ?? null,
          timezone: contact.timezone,
          tags: contact.tags ?? [],
          createdAt,
          customFields
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

    console.error('Failed to fetch contact', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
