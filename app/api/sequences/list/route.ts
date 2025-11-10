import { NextResponse } from 'next/server';

import {
  getTeamForUser,
  getActiveUser,
  listSequencesForTeam,
  syncAllSequenceRepliesForTeam,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { mapSequenceSummary, type RawSequence } from '@/lib/sequences/utils';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const url = new URL(request.url);
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

    await syncAllSequenceRepliesForTeam(team.id);

    const sequences = await listSequencesForTeam(team.id, { includeDeleted });

    const filteredSequences = includeDeleted
      ? sequences
      : sequences.filter((sequence) => {
          const candidate = sequence as RawSequence & { deletedAt?: Date | string | null };
          return candidate.deletedAt == null;
        });

    return NextResponse.json({
      sequences: filteredSequences.map((sequence) => mapSequenceSummary(sequence as RawSequence))
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to list sequences', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
