import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordSequenceEvents, type SequenceInboundEvent } from '@/lib/db/queries';

export const runtime = 'nodejs';

const eventSchema = z.object({
  type: z.enum(['reply', 'bounce']),
  messageId: z
    .string()
    .trim()
    .min(1, 'Message ID must not be empty')
    .optional(),
  contactId: z
    .string()
    .uuid('Contact ID must be a valid UUID')
    .optional(),
  sequenceId: z
    .string()
    .uuid('Sequence ID must be a valid UUID')
    .optional(),
  occurredAt: z.coerce.date().optional(),
  payload: z.unknown().optional()
});

const requestSchema = z.union([
  eventSchema,
  z.object({
    events: z.array(eventSchema).min(1, 'Provide at least one event')
  })
]);

function extractBearerToken(header: string | null) {
  if (!header) {
    return null;
  }

  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return trimmed.slice(7);
}

export async function POST(request: Request) {
  const secret = process.env.SEQUENCE_EVENTS_SECRET;
  if (!secret) {
    console.error('SEQUENCE_EVENTS_SECRET is not configured');
    return NextResponse.json({ error: 'Event processing not configured' }, { status: 500 });
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsedBody: z.infer<typeof requestSchema>;

  try {
    const json = await request.json();
    parsedBody = requestSchema.parse(json);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', fieldErrors: error.flatten().fieldErrors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const events = Array.isArray((parsedBody as any).events)
    ? (parsedBody as { events: z.infer<typeof eventSchema>[] }).events
    : [parsedBody as z.infer<typeof eventSchema>];

  const normalizedEvents: SequenceInboundEvent[] = events.map((event) => ({
    type: event.type,
    messageId: event.messageId ?? null,
    contactId: event.contactId ?? null,
    sequenceId: event.sequenceId ?? null,
    occurredAt: event.occurredAt ?? new Date(),
    payload: event.payload ?? null
  }));

  if (process.env.NODE_ENV !== 'production') {
    try {
      console.groupCollapsed?.('[SequenceEvents] inbound request', {
        count: normalizedEvents.length,
        types: Array.from(new Set(normalizedEvents.map((event) => event.type))).sort()
      });
      console.log?.('[SequenceEvents] normalized events', normalizedEvents);
      console.groupEnd?.();
    } catch (error) {
      console.warn?.('[SequenceEvents] failed to log inbound request', error);
    }
  }

  const results = await recordSequenceEvents(normalizedEvents);

  return NextResponse.json({ processed: results }, { status: 200 });
}
