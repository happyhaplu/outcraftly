import { NextResponse } from 'next/server';

import { getTeamForUser, getUser, listSequencesForTeam } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const sequences = await listSequencesForTeam(team.id);

    return NextResponse.json({
      sequences: sequences.map((sequence) => ({
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
        stepCount: Number(sequence.stepCount ?? 0)
      }))
    });
  } catch (error) {
    console.error('Failed to list sequences', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
