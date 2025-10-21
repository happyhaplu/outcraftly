import { NextResponse } from 'next/server';

import { createSequence, getSenderForTeam, getTeamForUser, getUser } from '@/lib/db/queries';
import { sequenceCreateSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const parsed = sequenceCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const orderedSteps = [...parsed.data.steps]
      .sort((a, b) => a.order - b.order)
      .map((step, index) => ({
        subject: step.subject.trim(),
        body: step.body.trim(),
        delay: step.delay,
        order: index + 1,
        skipIfReplied: Boolean(step.skipIfReplied),
        skipIfBounced: Boolean(step.skipIfBounced),
        delayIfReplied: step.delayIfReplied ?? null
      }));

    const sender = await getSenderForTeam(team.id, parsed.data.senderId);
    if (!sender) {
      return NextResponse.json(
        { error: 'Sender account not found in this workspace' },
        { status: 404 }
      );
    }

    if (!['verified', 'active'].includes(sender.status)) {
      return NextResponse.json(
        { error: 'Sender account must be active or verified before it can be used' },
        { status: 400 }
      );
    }

    const created = await createSequence(team.id, user.id, {
      name: parsed.data.name.trim(),
      senderId: sender.id,
      steps: orderedSteps
    });

    if (!created) {
      return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Sequence created successfully',
        sequence: {
          id: created.id,
          name: created.name,
          status: created.status,
          senderId: created.senderId,
          sender:
            created.sender && created.sender.id
              ? {
                  id: created.sender.id,
                  name: created.sender.name,
                  email: created.sender.email,
                  status: created.sender.status
                }
              : null,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          steps: (created.steps ?? []).map((step) => ({
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
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
