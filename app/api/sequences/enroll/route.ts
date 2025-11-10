import { NextResponse } from 'next/server';

import {
  enrollContactsInSequence,
  getTeamForUser,
  getActiveUser,
  SequenceEnrollmentError,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { sequenceEnrollmentSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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

    const parsed = sequenceEnrollmentSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    try {
      const result = await enrollContactsInSequence(
        team.id,
        parsed.data.sequenceId,
        parsed.data.contactIds,
        parsed.data.schedule ?? undefined
      );

      return NextResponse.json(
        {
          message:
            result.enrolled === 0
              ? 'No new contacts were enrolled.'
              : 'Contacts enrolled successfully.',
          enrolled: result.enrolled,
          skipped: result.skipped
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof SequenceEnrollmentError) {
        const status =
          error.code === 'sequence_not_found'
            ? 404
            : error.code === 'sequence_paused' || error.code === 'sequence_draft'
            ? 409
            : 400;
        return NextResponse.json(
          {
            error: error.message,
            code: error.code
          },
          { status }
        );
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to enroll contacts into sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
