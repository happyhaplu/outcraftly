import { NextResponse } from 'next/server';

import { getTeamForUser, getUser, setSequenceLifecycleStatus } from '@/lib/db/queries';
import { sequenceIdSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

export async function POST(_request: Request, context: RouteContext) {
  const rawParams = (await context?.params) ?? {};
  const params = rawParams as { id?: string };

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

    const updated = await setSequenceLifecycleStatus(team.id, parsed.data.id, 'paused');
    if (!updated) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Sequence paused',
      sequence: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to pause sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
