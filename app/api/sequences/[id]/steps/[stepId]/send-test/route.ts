import { NextResponse } from 'next/server';

import {
  getSequenceStepForTeam,
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE,
  assertCanSendEmails,
  trackEmailsSent,
  PlanLimitExceededError
} from '@/lib/db/queries';
import { dispatchSequenceEmail, renderSequenceContent } from '@/lib/mail/sequence-mailer';
import { decryptSecret, isProbablyEncryptedSecret } from '@/lib/security/encryption';
import { sequenceIdSchema, sequenceStepIdSchema, sequenceTestEmailSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function POST(request: Request, context: any) {
  const rawParams = (await context?.params) ?? {};
  const params = rawParams as { id?: string; stepId?: string };

  try {
    const user = await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const sequenceResult = sequenceIdSchema.safeParse({ id: params.id });
    const stepResult = sequenceStepIdSchema.safeParse({ stepId: params.stepId });

    if (!sequenceResult.success || !stepResult.success) {
      return NextResponse.json({
        error: 'Validation failed',
        fieldErrors: {
          ...(sequenceResult.success ? {} : sequenceResult.error.flatten().fieldErrors),
          ...(stepResult.success ? {} : stepResult.error.flatten().fieldErrors)
        }
      }, { status: 400 });
    }

    let bodyPayload: unknown = null;
    try {
      bodyPayload = await request.json();
    } catch {
      bodyPayload = {};
    }

  const parsedBody = sequenceTestEmailSchema.safeParse(bodyPayload ?? {});
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsedBody.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const requestedEmail = parsedBody.data.recipientEmail?.trim();
    const fallbackEmail = typeof user.email === 'string' ? user.email : undefined;
    const recipientEmail = requestedEmail && requestedEmail.length > 0 ? requestedEmail : fallbackEmail;

    if (!recipientEmail) {
      return NextResponse.json({ error: 'Provide a recipient email address' }, { status: 400 });
    }

    const step = await getSequenceStepForTeam(team.id, sequenceResult.data.id, stepResult.data.stepId);
    if (!step) {
      return NextResponse.json({ error: 'Sequence step not found' }, { status: 404 });
    }

    const resolveSenderPassword = (raw: string | null | undefined): string | null => {
      if (!raw) {
        return null;
      }

      const key = process.env.SENDER_CREDENTIALS_KEY;
      if (!key || key.length < 32) {
        return raw;
      }

      try {
        if (!isProbablyEncryptedSecret(raw)) {
          return raw;
        }

        return decryptSecret(raw);
      } catch (error) {
        console.warn('Failed to decrypt sender password, falling back to stored value', error instanceof Error ? error.message : error);
        return raw;
      }
    };

    const senderPassword = resolveSenderPassword(step.senderPassword);

    const senderSnapshot =
      step.senderId &&
      step.senderName &&
      step.senderEmail &&
      step.senderHost &&
      step.senderPort != null &&
      step.senderUsername &&
      senderPassword
        ? {
            id: step.senderId,
            name: step.senderName,
            email: step.senderEmail,
            status: step.senderStatus ?? 'inactive',
            host: step.senderHost,
            port: step.senderPort,
            username: step.senderUsername,
            password: senderPassword
          }
        : null;

    if (!senderSnapshot) {
      return NextResponse.json({ error: 'Assign a sender to this sequence before sending tests' }, { status: 409 });
    }

    if (!['verified', 'active'].includes(senderSnapshot.status)) {
      return NextResponse.json(
        { error: 'Assigned sender must be active or verified before sending tests' },
        { status: 409 }
      );
    }

    const nameParts = typeof user.name === 'string' ? user.name.trim().split(/\s+/) : [];
    const [firstName = 'Test', ...rest] = nameParts;
    const lastName = rest.join(' ');

    const rendered = renderSequenceContent(step.subject ?? '', step.body ?? '', {
      email: recipientEmail,
      firstName: firstName || 'Test',
      lastName: lastName || (firstName ? '' : 'Recipient'),
      company: team.name ?? 'Test Company',
      tags: [],
      customFieldsById: {},
      customFieldsByKey: {},
      customFieldsByName: {}
    });

    await assertCanSendEmails(team.id, 1);

    let deliveryResult: Awaited<ReturnType<typeof dispatchSequenceEmail>> | undefined;

    try {
      deliveryResult = await dispatchSequenceEmail({
        sender: {
          name: senderSnapshot.name,
          email: senderSnapshot.email,
          host: senderSnapshot.host,
          port: senderSnapshot.port,
          username: senderSnapshot.username,
          password: senderSnapshot.password
        },
        recipient: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        isTest: true,
        shouldVerify: true
      });
      if (process.env.NODE_ENV !== 'test') {
        console.info('Sequence test email dispatched', {
          sequenceId: step.sequenceId,
          stepId: step.id,
          recipient: recipientEmail,
          accepted: deliveryResult.accepted,
          rejected: deliveryResult.rejected,
          response: deliveryResult.response,
          messageId: deliveryResult.messageId ?? undefined
        });
      }
    } catch (error) {
      const mailError = error as {
        code?: string;
        response?: string;
        accepted?: string[];
        rejected?: string[];
      } | undefined;
      if (mailError?.code === 'EAUTH') {
        console.error('Failed to send sequence step test email due to SMTP authentication error', error);
        return NextResponse.json(
          {
            error: 'We could not authenticate with the configured SMTP sender. Update the credentials or verify they are still valid.'
          },
          { status: 422 }
        );
      }

      if (mailError?.code === 'ENOTACCEPTED') {
        console.error('SMTP server rejected test email', {
          sequenceId: step.sequenceId,
          stepId: step.id,
          response: mailError.response,
          accepted: mailError.accepted,
          rejected: mailError.rejected
        });
        return NextResponse.json(
          {
            error: 'SMTP server rejected the test email. Confirm the recipient is allowed and the sender domain is authorised.',
            details: {
              accepted: mailError.accepted ?? [],
              rejected: mailError.rejected ?? [],
              response: mailError.response ?? null
            }
          },
          { status: 502 }
        );
      }

      console.error('Failed to send sequence step test email', error);
      return NextResponse.json({ error: 'Unable to send test email.' }, { status: 502 });
    }

    await trackEmailsSent(team.id, 1);

    return NextResponse.json({
      message: 'Test email sent',
      recipient: recipientEmail,
      step: {
        id: step.id,
        sequenceId: step.sequenceId
      },
      delivery: {
        status: 'accepted',
        accepted: deliveryResult?.accepted ?? [],
        rejected: deliveryResult?.rejected ?? [],
        response: deliveryResult?.response ?? null,
        messageId: deliveryResult?.messageId ?? null
      }
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    if (error instanceof PlanLimitExceededError) {
      return NextResponse.json(
        {
          error: error.message,
          resource: error.resource,
          limit: error.limit,
          remaining: error.remaining
        },
        { status: 403 }
      );
    }

    console.error('Failed to send sequence step test email', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
