import { getActiveUser, getTeamForUser, InactiveTrialError } from '@/lib/db/queries';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await getActiveUser();
  } catch (error) {
    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await getTeamForUser();
  return NextResponse.json(team);
}
