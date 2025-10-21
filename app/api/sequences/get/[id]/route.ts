import { NextResponse } from 'next/server';

import { getSequenceWithSteps, getTeamForUser, getUser } from '@/lib/db/queries';
import { sequenceIdSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: any) {
  const params = ((await context?.params) ?? {}) as { id?: string };
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const sequence = await getSequenceWithSteps(team.id, parsed.data.id);

    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    return NextResponse.json({
      sequence: {
        id: sequence.id,
        name: sequence.name,
        status: sequence.status,
        senderId: sequence.senderId ?? null,
        sender:
          sequence.sender && sequence.sender.id
            ? {
                id: sequence.sender.id,
                name: sequence.sender.name,
                email: sequence.sender.email,
                status: sequence.sender.status
              }
            : null,
        createdAt: sequence.createdAt,
        updatedAt: sequence.updatedAt,
        steps: (sequence.steps ?? []).map((step) => ({
          id: step.id,
          subject: step.subject,
          body: step.body,
          delayHours: step.delayHours,
          order: step.order,
          skipIfReplied: step.skipIfReplied ?? false,
          skipIfBounced: step.skipIfBounced ?? false,
          delayIfReplied: step.delayIfReplied ?? null
        }))
      }
    });
  } catch (error) {
    console.error('Failed to load sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
