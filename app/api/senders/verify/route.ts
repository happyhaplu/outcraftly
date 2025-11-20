import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

import {
  getSenderForTeam,
  getTeamForUser,
  getActiveUser,
  updateSenderStatus,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { decryptSecret } from '@/lib/security/encryption';
import { verifySmtpConnection } from '@/lib/mail/smtp';

const verifySenderSchema = z.object({
  senderId: z.coerce
    .number({ invalid_type_error: 'Sender ID must be a number' })
    .int('Sender ID must be a whole number')
    .positive('Sender ID must be greater than zero')
});

function formatValidationError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'senderId',
    message: issue.message
  }));
}

export async function POST(request: Request) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json(
        { error: 'No workspace associated with user' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { senderId } = verifySenderSchema.parse(body);

    const sender = await getSenderForTeam(team.id, senderId);
    if (!sender) {
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }

    let decryptedPassword: string;
    try {
      decryptedPassword = decryptSecret(sender.password);
    } catch (_error) {
      await updateSenderStatus(team.id, sender.id, 'error');
      return NextResponse.json(
        { error: 'Failed to decrypt sender credentials' },
        { status: 500 }
      );
    }

    try {
      await verifySmtpConnection({
        host: sender.host,
        port: sender.port,
        username: sender.username,
        password: decryptedPassword
      });

      const updated = await updateSenderStatus(team.id, sender.id, 'verified');

      return NextResponse.json(
        {
          message: 'Connection verified successfully',
          sender: {
            id: sender.id,
            status: updated?.status ?? 'verified'
          }
        },
        { status: 200 }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SMTP connection failed';

      const updated = await updateSenderStatus(team.id, sender.id, 'error');

      return NextResponse.json(
        {
          error: 'SMTP connection failed',
          reason: message,
          sender: {
            id: sender.id,
            status: updated?.status ?? 'error'
          }
        },
        { status: 400 }
      );
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          issues: formatValidationError(error)
        },
        { status: 400 }
      );
    }

    console.error('Failed to verify sender', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
