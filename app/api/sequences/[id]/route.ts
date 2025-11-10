import { NextResponse } from 'next/server';

import {
  getTeamForUser,
  getActiveUser,
  setSequenceLifecycleStatus,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { sequenceIdSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function DELETE(_request: Request, context: any) {
  const rawParams = (await context?.params) ?? {};
  const params = rawParams as { id?: string };

  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const parsed = sequenceIdSchema.safeParse({ id: params.id });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const updated = await setSequenceLifecycleStatus(team.id, parsed.data.id, 'deleted');
    if (!updated) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to delete sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
