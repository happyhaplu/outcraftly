import { NextResponse } from 'next/server';

import { getTeamForUser, getUser } from '@/lib/db/queries';
import { runSequenceWorker } from '@/lib/workers/sequence-worker';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
  }

  let limit = 10;

  try {
    const payload = await request.json().catch(() => ({}));
    if (payload && typeof payload.limit === 'number' && payload.limit > 0) {
      limit = Math.min(Math.floor(payload.limit), 100);
    }
  } catch {
    limit = 10;
  }

  const result = await runSequenceWorker({ teamId: team.id, limit });

  return NextResponse.json({
    message: 'Sequence worker completed',
    result
  });
}
