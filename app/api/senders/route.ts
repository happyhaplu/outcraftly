import { NextResponse } from 'next/server';

import {
  getSendersForTeam,
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';

export async function GET() {
  try {
    await getActiveUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    throw error;
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
      smtpSecurity: sender.smtpSecurity,
      username: sender.username,
      status: sender.status,
      createdAt: sender.createdAt,
      bounceRate: sender.bounceRate,
      quotaUsed: sender.quotaUsed,
      quotaLimit: sender.quotaLimit,
      inboundHost: sender.inboundHost,
      inboundPort: sender.inboundPort,
      inboundSecurity: sender.inboundSecurity,
      inboundProtocol: sender.inboundProtocol
    }))
  });
}
