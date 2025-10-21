import { NextResponse } from 'next/server';

import { getSequenceStatusForTeam, getTeamForUser, getUser } from '@/lib/db/queries';
import { sequenceIdSchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: any) {
  const params = ((await context?.params) ?? {}) as { id?: string };

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const parsed = sequenceIdSchema.safeParse({ id: params.id });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const result = await getSequenceStatusForTeam(team.id, parsed.data.id);
    if (!result) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    return NextResponse.json({
      sequence: {
        id: result.sequence.id,
        name: result.sequence.name,
        status: result.sequence.status,
        senderId: result.sequence.senderId,
        sender: result.sequence.sender
          ? {
              id: result.sequence.sender.id,
              name: result.sequence.sender.name,
              email: result.sequence.sender.email,
              status: result.sequence.sender.status
            }
          : null,
        createdAt: result.sequence.createdAt.toISOString(),
        updatedAt: result.sequence.updatedAt.toISOString()
      },
      summary: {
        total: result.summary.total,
        pending: result.summary.pending,
        sent: result.summary.sent,
        replied: result.summary.replied,
        bounced: result.summary.bounced,
        failed: result.summary.failed,
        skipped: result.summary.skipped,
        lastActivity: result.summary.lastActivity ? result.summary.lastActivity.toISOString() : null
      },
      contacts: result.contacts.map((contact) => ({
        id: contact.id,
        contactId: contact.contactId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        company: contact.company,
        timezone: contact.timezone,
        status: contact.status,
        lastUpdated: contact.lastUpdated.toISOString(),
        stepOrder: contact.stepOrder,
        stepSubject: contact.stepSubject,
        scheduledAt: contact.scheduledAt ? contact.scheduledAt.toISOString() : null,
        sentAt: contact.sentAt ? contact.sentAt.toISOString() : null,
        attempts: contact.attempts,
        replyAt: contact.replyAt ? contact.replyAt.toISOString() : null,
        bounceAt: contact.bounceAt ? contact.bounceAt.toISOString() : null,
        skippedAt: contact.skippedAt ? contact.skippedAt.toISOString() : null,
        scheduleMode: contact.scheduleMode,
        scheduleSendTime: contact.scheduleSendTime,
        scheduleWindowStart: contact.scheduleWindowStart,
        scheduleWindowEnd: contact.scheduleWindowEnd,
        scheduleRespectTimezone: contact.scheduleRespectTimezone,
        scheduleFallbackTimezone: contact.scheduleFallbackTimezone
      })),
      steps: result.steps.map((s) => ({
        stepId: s.stepId,
        order: s.order,
        subject: s.subject,
        pending: s.pending,
        sent: s.sent,
        replied: s.replied,
        bounced: s.bounced,
        failed: s.failed,
        skipped: s.skipped
      })),
      worker: {
        queueSize: result.worker.queueSize,
        lastRunAt: result.worker.lastRunAt ? result.worker.lastRunAt.toISOString() : null,
        lastFailureAt: result.worker.lastFailureAt ? result.worker.lastFailureAt.toISOString() : null,
        lastError: result.worker.lastError
      }
    });
  } catch (error) {
    console.error('Failed to load sequence status', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
