import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getSenderForTeam,
  getTeamForUser,
  getUser,
  updateSenderStatus
} from '@/lib/db/queries';

const disableSenderSchema = z.object({
  senderId: z.coerce
    .number({ invalid_type_error: 'Sender ID must be a number' })
    .int('Sender ID must be a whole number')
    .positive('Sender ID must be greater than zero')
});

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json(
        { error: 'No workspace associated with user' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { senderId } = disableSenderSchema.parse(body);

    const sender = await getSenderForTeam(team.id, senderId);
    if (!sender) {
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }

    const nextStatus = sender.status === 'disabled' ? 'active' : 'disabled';
    const updated = await updateSenderStatus(team.id, sender.id, nextStatus);

    return NextResponse.json(
      {
        message:
          nextStatus === 'disabled'
            ? 'Sender has been disabled'
            : 'Sender has been re-enabled',
        sender: updated ?? { ...sender, status: nextStatus }
      },
      { status: 200 }
    );
  } catch (error) {
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

    console.error('Failed to toggle sender status', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
