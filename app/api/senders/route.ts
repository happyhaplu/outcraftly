import { NextResponse } from 'next/server';

import { getSendersForTeam, getTeamForUser, getUser } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json(
      { error: 'No workspace associated with user' },
      { status: 400 }
    );
  }

  const senders = await getSendersForTeam(team.id);

  return NextResponse.json({
    senders: senders.map((sender) => ({
      id: sender.id,
      name: sender.name,
      email: sender.email,
      host: sender.host,
      port: sender.port,
      username: sender.username,
      status: sender.status,
      createdAt: sender.createdAt,
      bounceRate: sender.bounceRate,
      quotaUsed: sender.quotaUsed,
      quotaLimit: sender.quotaLimit
    }))
  });
}
