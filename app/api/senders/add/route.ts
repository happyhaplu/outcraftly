import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  addSender,
  findSenderByEmail,
  getTeamForUser,
  getUser
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
    } catch (error) {
      return NextResponse.json(
        { error: 'SMTP connection failed' },
        { status: 400 }
      );
    }

    const encryptedPassword = encryptSecret(data.password);

    const sender = await addSender(team.id, {
      ...data,
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
          username: sender.username,
          status: sender.status,
          createdAt: sender.createdAt
        }
      },
      { status: 201 }
    );
  } catch (error) {
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
