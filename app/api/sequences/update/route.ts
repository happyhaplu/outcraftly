import { NextResponse } from 'next/server';

import { getSenderForTeam, getTeamForUser, getUser, updateSequence } from '@/lib/db/queries';
import { sequenceUpdateSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
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

    const parsed = sequenceUpdateSchema.safeParse(payload);
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
        id: step.id ?? undefined,
        subject: step.subject.trim(),
        body: step.body.trim(),
        delay: step.delay,
        skipIfReplied: Boolean(step.skipIfReplied),
        skipIfBounced: Boolean(step.skipIfBounced),
        delayIfReplied: step.delayIfReplied ?? null,
        order: index + 1
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

    const updated = await updateSequence(team.id, parsed.data.id, {
      name: parsed.data.name.trim(),
      senderId: sender.id,
      steps: orderedSteps
    });

    if (!updated) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: 'Sequence updated successfully',
        sequence: {
          id: updated.id,
          name: updated.name,
          status: updated.status,
          senderId: updated.senderId,
          sender:
            updated.sender && updated.sender.id
              ? {
                  id: updated.sender.id,
                  name: updated.sender.name,
                  email: updated.sender.email,
                  status: updated.sender.status
                }
              : null,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          steps: (updated.steps ?? []).map((step) => ({
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
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to update sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
