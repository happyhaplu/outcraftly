import { NextResponse } from 'next/server';

import {
  createSequence,
  enrollContactsInSequence,
  getSenderForTeam,
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { sequenceCreateSchema } from '@/lib/validation/sequence';
import type { SequenceScheduleOptions } from '@/lib/timezone';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = sequenceCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    // Log payload for diagnostics (kept minimal in production)
    try {
      // Avoid dumping secrets; log the parsed, validated payload shape.
      console.debug('Creating sequence payload:', {
        name: parsed.data.name,
        senderId: parsed.data.senderId,
        steps: parsed.data.steps?.length ?? 0,
        contacts: Array.isArray(parsed.data.contacts) ? parsed.data.contacts.length : 0,
        scheduleMode: parsed.data.schedule?.mode
      });
    } catch (_err) {
      // swallow logging errors
    }

    const orderedSteps = [...parsed.data.steps]
      .sort((a, b) => a.order - b.order)
      .map((step, index) => ({
        subject: step.subject.trim(),
        body: step.body.trim(),
        delay: step.delay,
        order: index + 1,
        skipIfReplied: Boolean(step.skipIfReplied),
        skipIfBounced: Boolean(step.skipIfBounced),
        delayIfReplied: step.delayIfReplied ?? null
      }));

    const tracking = {
      trackOpens: parsed.data.tracking?.trackOpens ?? true,
      trackClicks: parsed.data.tracking?.trackClicks ?? true,
      enableUnsubscribe: parsed.data.tracking?.enableUnsubscribe ?? true
    };

    const scheduleInput = parsed.data.schedule;
    const schedule = {
      mode: scheduleInput.mode,
      sendTime: scheduleInput.mode === 'fixed' ? scheduleInput.sendTime ?? null : null,
      sendWindowStart: scheduleInput.mode === 'window' ? scheduleInput.sendWindowStart ?? null : null,
      sendWindowEnd: scheduleInput.mode === 'window' ? scheduleInput.sendWindowEnd ?? null : null,
      respectContactTimezone: scheduleInput.respectContactTimezone ?? true,
      fallbackTimezone: scheduleInput.fallbackTimezone ?? null,
      timezone: typeof scheduleInput.timezone === 'string' && scheduleInput.timezone.trim().length > 0
        ? scheduleInput.timezone.trim()
        : null,
      sendDays: Array.isArray(scheduleInput.sendDays)
        ? scheduleInput.sendDays
            .filter((day) => typeof day === 'string' && day.trim().length > 0)
            .map((day) => day.trim())
        : [],
      sendWindows: Array.isArray(scheduleInput.sendWindows)
        ? scheduleInput.sendWindows
            .map((window) => ({
              start: typeof window?.start === 'string' ? window.start.trim() : '',
              end: typeof window?.end === 'string' ? window.end.trim() : ''
            }))
            .filter((window) => window.start.length > 0 && window.end.length > 0)
        : []
    };

    const stopCondition = parsed.data.stopCondition ?? 'on_reply';
    const stopOnBounce = parsed.data.stopOnBounce ?? false;
    const contactIds = Array.isArray(parsed.data.contacts) ? parsed.data.contacts : [];
  const minGapMinutes = parsed.data.minGapMinutes ?? null;

    const sender = await getSenderForTeam(team.id, parsed.data.senderId);
    if (!sender) {
      return NextResponse.json(
        { error: 'Sender account not found in this workspace' },
        { status: 404 }
      );
    }

    if (!['verified', 'active'].includes(sender.status)) {
      return NextResponse.json(
        { error: 'Sender account must be active or verified before it can be used' },
        { status: 400 }
      );
    }

    let created;
    try {
      created = await createSequence(team.id, user.id, {
      name: parsed.data.name.trim(),
      senderId: sender.id,
      steps: orderedSteps,
      launchAt: parsed.data.launchAt ?? null,
      tracking,
      stopCondition,
      stopOnBounce,
  schedule,
  minGapMinutes
      });
    } catch (err) {
      console.error('createSequence failed', err instanceof Error ? err.stack ?? err.message : err);
      return NextResponse.json({ ok: false, error: 'Failed to create sequence' }, { status: 500 });
    }

    if (!created) {
      return NextResponse.json({ ok: false, error: 'Failed to create sequence' }, { status: 500 });
    }

    let enrollmentResult: { enrolled: number; skipped: number } | null = null;

    if (contactIds.length > 0) {
      try {
        const hasSendDays = Array.isArray(schedule.sendDays) && schedule.sendDays.length > 0;
        const hasSendWindows = Array.isArray(schedule.sendWindows) && schedule.sendWindows.length > 0;

        const scheduleOptions: SequenceScheduleOptions | null = schedule.mode === 'fixed'
          ? {
              mode: 'fixed',
              sendTime: schedule.sendTime ?? '09:00',
              respectContactTimezone: schedule.respectContactTimezone,
              timezone: schedule.timezone ?? null,
              sendDays: hasSendDays ? schedule.sendDays : null,
              sendWindows: hasSendWindows ? schedule.sendWindows : null
            }
          : schedule.mode === 'window'
            ? {
                mode: 'window',
                sendWindowStart: schedule.sendWindowStart ?? '09:00',
                sendWindowEnd: schedule.sendWindowEnd ?? '17:00',
                respectContactTimezone: schedule.respectContactTimezone,
                timezone: schedule.timezone ?? null,
                sendDays: hasSendDays ? schedule.sendDays : null,
                sendWindows: hasSendWindows ? schedule.sendWindows : null
              }
            : hasSendDays || hasSendWindows || schedule.timezone
              ? {
                  mode: 'immediate',
                  respectContactTimezone: schedule.respectContactTimezone,
                  timezone: schedule.timezone ?? null,
                  sendDays: hasSendDays ? schedule.sendDays : null,
                  sendWindows: hasSendWindows ? schedule.sendWindows : null
                }
              : null;

        enrollmentResult = await enrollContactsInSequence(team.id, created.id, contactIds, scheduleOptions, {
          allowDraft: true,
          fallbackTimezone: schedule.timezone ?? schedule.fallbackTimezone ?? null
        });
      } catch (error) {
        console.error('Failed to enroll contacts during sequence creation', error);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        sequenceId: created.id,
        message: 'Sequence created successfully',
        sequence: {
          id: created.id,
          name: created.name,
          status: created.status,
          launchAt: created.launchAt ?? null,
          launchedAt: created.launchedAt ?? null,
          senderId: created.senderId,
          sender:
            created.sender && created.sender.id
              ? {
                  id: created.sender.id,
                  name: created.sender.name,
                  email: created.sender.email,
                  status: created.sender.status
                }
              : null,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          tracking: {
            trackOpens: created.trackOpens,
            trackClicks: created.trackClicks,
            enableUnsubscribe: created.enableUnsubscribe
          },
          schedule: {
            mode: created.scheduleMode ?? 'immediate',
            sendTime: created.scheduleSendTime ?? null,
            sendWindowStart: created.scheduleWindowStart ?? null,
            sendWindowEnd: created.scheduleWindowEnd ?? null,
            respectContactTimezone: created.scheduleRespectTimezone ?? true,
            fallbackTimezone: created.scheduleFallbackTimezone ?? null,
            timezone: created.scheduleTimezone ?? null,
            sendDays: Array.isArray(created.scheduleSendDays) ? created.scheduleSendDays : null,
            sendWindows: Array.isArray(created.scheduleSendWindows) ? created.scheduleSendWindows : null
          },
          stopCondition: created.stopCondition ?? 'on_reply',
          stopOnBounce: created.stopOnBounce ?? false,
          minGapMinutes: created.minGapMinutes ?? null,
          steps: (created.steps ?? []).map((step) => ({
            id: step.id,
            subject: step.subject,
            body: step.body,
            delayHours: step.delayHours,
            order: step.order,
            skipIfReplied: step.skipIfReplied ?? false,
            skipIfBounced: step.skipIfBounced ?? false,
            delayIfReplied: step.delayIfReplied ?? null
          }))
        },
        enrollment: enrollmentResult
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

    console.error('Failed to create sequence', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
