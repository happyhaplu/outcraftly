import { NextResponse } from 'next/server';

import { getTeamForUser, getDistinctContactTags, getUser } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
  }

  const tags = await getDistinctContactTags(team.id);
  return NextResponse.json({ tags });
}
