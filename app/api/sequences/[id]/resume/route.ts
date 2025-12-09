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
import { runSequenceWorker } from '@/lib/workers/sequence-worker';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: any) {
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

    const updated = await setSequenceLifecycleStatus(team.id, parsed.data.id, 'active');
    if (!updated) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Trigger worker to process pending emails (fire and forget)
    runSequenceWorker({ teamId: team.id }).catch((err) => {
      console.error('Failed to run sequence worker after resume:', err);
    });

    return NextResponse.json({
      message: 'Sequence resumed',
      sequence: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString()
      }
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to resume sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
