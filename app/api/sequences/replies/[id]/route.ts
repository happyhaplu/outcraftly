import { NextResponse } from 'next/server';

import {
  getTeamForUser,
  getUser,
  listSequenceBouncesForTeam,
  listSequenceRepliesForTeam
} from '@/lib/db/queries';
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

    const [replies, bounces] = await Promise.all([
      listSequenceRepliesForTeam(team.id, parsed.data.id, 20),
      listSequenceBouncesForTeam(team.id, parsed.data.id, 20)
    ]);

    return NextResponse.json({
      replies: replies.map((reply) => ({
        id: reply.id,
        contactId: reply.contactId,
        firstName: reply.firstName,
        lastName: reply.lastName,
        email: reply.email,
        company: reply.company,
        subject: reply.subject,
        snippet: reply.snippet,
        occurredAt: reply.occurredAt.toISOString(),
        messageId: reply.messageId,
        stepSubject: reply.stepSubject
      })),
      bounces: bounces.map((bounce) => ({
        id: bounce.id,
        contactId: bounce.contactId,
        firstName: bounce.firstName,
        lastName: bounce.lastName,
        email: bounce.email,
        company: bounce.company,
        reason: bounce.reason,
        detail: bounce.detail,
        occurredAt: bounce.occurredAt.toISOString(),
        messageId: bounce.messageId,
        stepSubject: bounce.stepSubject
      }))
    });
  } catch (error) {
    console.error('Failed to load sequence engagement', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
