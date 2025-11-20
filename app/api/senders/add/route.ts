import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  addSender,
  findSenderByEmail,
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { encryptSecret } from '@/lib/security/encryption';
import { senderFormSchema } from '@/lib/validation/sender';
import { verifySmtpConnection } from '@/lib/mail/smtp';

function formatValidationError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'form',
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
    const data = senderFormSchema.parse(body);

    const alreadyExists = await findSenderByEmail(team.id, data.email);
    if (alreadyExists) {
      return NextResponse.json(
        { error: 'Sender email already exists' },
        { status: 409 }
      );
    }

    const encryptionKey = process.env.SENDER_CREDENTIALS_KEY ?? '';
    if (encryptionKey.length < 32) {
      return NextResponse.json(
        {
          error:
            'Sender credentials encryption key is not configured. Set SENDER_CREDENTIALS_KEY to a 32+ character value.'
        },
        { status: 500 }
      );
    }

    try {
      await verifySmtpConnection({
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password
      });
    } catch (_error) {
      return NextResponse.json(
        { error: 'SMTP connection failed' },
        { status: 400 }
      );
    }

    const encryptedPassword = encryptSecret(data.password);

    const sender = await addSender(team.id, {
      ...data,
      inboundHost: data.inboundHost?.trim() ? data.inboundHost.trim() : null,
      inboundPort:
        typeof data.inboundPort === 'number' && Number.isFinite(data.inboundPort)
          ? data.inboundPort
          : null,
      inboundSecurity: data.inboundSecurity ? data.inboundSecurity : null,
      inboundProtocol: data.inboundProtocol ? data.inboundProtocol : null,
      password: encryptedPassword,
      status: 'active'
    });

    return NextResponse.json(
      {
        sender: {
          id: sender.id,
          name: sender.name,
          email: sender.email,
          host: sender.host,
          port: sender.port,
          smtpSecurity: sender.smtpSecurity,
          username: sender.username,
          status: sender.status,
          createdAt: sender.createdAt,
          inboundHost: sender.inboundHost,
          inboundPort: sender.inboundPort,
          inboundSecurity: sender.inboundSecurity,
          inboundProtocol: sender.inboundProtocol
        }
      },
      { status: 201 }
    );
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

    console.error('Failed to add sender', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
