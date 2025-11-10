import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  deleteSender,
  getSenderForTeam,
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';

const removeSenderSchema = z.object({
  senderId: z.coerce
    .number({ invalid_type_error: 'Sender ID must be a number' })
    .int('Sender ID must be a whole number')
    .positive('Sender ID must be greater than zero')
});

export async function DELETE(request: Request) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json(
        { error: 'No workspace associated with user' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { senderId } = removeSenderSchema.parse(body);

    const sender = await getSenderForTeam(team.id, senderId);
    if (!sender) {
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }

    await deleteSender(team.id, sender.id);

    return NextResponse.json({ message: 'Sender removed successfully' }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.') || 'senderId',
            message: issue.message
          }))
        },
        { status: 400 }
      );
    }

    console.error('Failed to remove sender', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
