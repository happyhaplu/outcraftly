import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { contactSequenceStatus, sequences, sequenceSteps } from '@/lib/db/schema';
import {
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { runSequenceWorker } from '@/lib/workers/sequence-worker';

const paramsSchema = z.object({ id: z.string().uuid() });

export const runtime = 'nodejs';

export async function POST(_request: Request, context: any) {
  const rawParams = (await context?.params) ?? {};
  const params = rawParams as { id?: string };

  const parsedParams = paramsSchema.safeParse({ id: params.id });
  if (!parsedParams.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        fieldErrors: parsedParams.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const statusId = parsedParams.data.id;

    const [statusRow] = await db
      .select({
        id: contactSequenceStatus.id,
        contactId: contactSequenceStatus.contactId,
        sequenceId: contactSequenceStatus.sequenceId,
        status: contactSequenceStatus.status,
        scheduledAt: contactSequenceStatus.scheduledAt,
        sentAt: contactSequenceStatus.sentAt,
        stepId: contactSequenceStatus.stepId,
        manualTriggeredAt: contactSequenceStatus.manualTriggeredAt,
        sequenceStatus: sequences.status,
        sequenceTeamId: sequences.teamId,
        stepExists: sequenceSteps.id
      })
      .from(contactSequenceStatus)
      .innerJoin(sequences, eq(contactSequenceStatus.sequenceId, sequences.id))
      .leftJoin(sequenceSteps, eq(contactSequenceStatus.stepId, sequenceSteps.id))
      .where(eq(contactSequenceStatus.id, statusId))
      .limit(1);

    if (!statusRow || statusRow.sequenceTeamId !== team.id) {
      return NextResponse.json({ error: 'Sequence status not found' }, { status: 404 });
    }

    if (statusRow.sequenceStatus !== 'active') {
      return NextResponse.json({ error: 'Sequence is not active' }, { status: 409 });
    }

    if (statusRow.status !== 'pending') {
      return NextResponse.json({ error: 'Contact is not pending' }, { status: 409 });
    }

    if (!statusRow.stepId || !statusRow.stepExists) {
      return NextResponse.json({ error: 'Sequence step is not available' }, { status: 409 });
    }

    if (statusRow.sentAt) {
      return NextResponse.json({ error: 'Step already sent' }, { status: 409 });
    }

    const now = new Date();

    await db
      .update(contactSequenceStatus)
      .set({
        scheduledAt: now,
        manualTriggeredAt: now,
        manualSentAt: null,
        lastUpdated: now
      })
      .where(and(eq(contactSequenceStatus.id, statusId), eq(contactSequenceStatus.sequenceId, statusRow.sequenceId)));

    // Trigger worker to send the email immediately (fire and forget)
    runSequenceWorker({ teamId: team.id, limit: 1 }).catch((err) => {
      console.error('Failed to run sequence worker after send-now:', err);
    });

    return NextResponse.json({
      success: true,
      status: {
        id: statusRow.id,
        scheduledAt: now.toISOString(),
        manualTriggeredAt: now.toISOString()
      }
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to trigger manual send', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
