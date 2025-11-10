import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getActiveUser,
  getTeamForUser,
  updateContactCustomFieldDefinition,
  deleteContactCustomFieldDefinition,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { contactCustomFieldUpdateSchema } from '@/lib/validation/contact-custom-field';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  id: z.string().uuid('Custom field id must be a valid UUID')
});

type CustomFieldRouteParams = { id?: string | string[] };
type CustomFieldRouteContext = { params: Promise<CustomFieldRouteParams> };

function resolveParamId(params: CustomFieldRouteParams | undefined): string | undefined {
  const value = params?.id;
  return Array.isArray(value) ? value[0] : value;
}

async function getResolvedParams(context: CustomFieldRouteContext) {
  try {
    return context.params ? await context.params : undefined;
  } catch {
    return undefined;
  }
}

export async function PATCH(request: Request, context: CustomFieldRouteContext) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const resolvedParams = await getResolvedParams(context);

    const fallbackId = (() => {
      try {
        return new URL(request.url).pathname.split('/').pop() ?? '';
      } catch {
        return '';
      }
    })();

    const parsedParams = paramsSchema.safeParse({
      id: resolveParamId(resolvedParams) ?? fallbackId
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

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsedBody = contactCustomFieldUpdateSchema.safeParse(payload);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsedBody.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const updated = await updateContactCustomFieldDefinition(
      team.id,
      parsedParams.data.id,
      parsedBody.data
    );

    if (!updated) {
      return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to update contact custom field', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: CustomFieldRouteContext) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const resolvedParams = await getResolvedParams(context);

    const fallbackId = (() => {
      try {
        return new URL(request.url).pathname.split('/').pop() ?? '';
      } catch {
        return '';
      }
    })();

    const parsedParams = paramsSchema.safeParse({
      id: resolveParamId(resolvedParams) ?? fallbackId
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

    const deleted = await deleteContactCustomFieldDefinition(team.id, parsedParams.data.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to delete contact custom field', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
