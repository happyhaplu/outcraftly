import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { sequences } from '@/lib/db/schema';
import { getTeamForUser, getUser, listSequenceDeliveryLogsForTeam } from '@/lib/db/queries';
import { sequenceIdSchema, sequenceLogQuerySchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function GET(request: Request, context: any) {
	const params = ((await context?.params) ?? {}) as { id?: string };
	const searchParams = new URL(request.url).searchParams;

	try {
		const user = await getUser();
		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const team = await getTeamForUser();
		if (!team) {
			return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
		}

		const sequenceParse = sequenceIdSchema.safeParse({ id: params.id });
		if (!sequenceParse.success) {
			return NextResponse.json(
				{
					error: 'Validation failed',
					fieldErrors: sequenceParse.error.flatten().fieldErrors
				},
				{ status: 400 }
			);
		}

		const queryParse = sequenceLogQuerySchema.safeParse({
			status: searchParams.get('status') ?? undefined,
			contact: searchParams.get('contact') ?? undefined,
			from: searchParams.get('from') ?? undefined,
			to: searchParams.get('to') ?? undefined,
			page: searchParams.get('page') ?? undefined,
			pageSize: searchParams.get('pageSize') ?? undefined
		});

		if (!queryParse.success) {
			return NextResponse.json(
				{
					error: 'Validation failed',
					fieldErrors: queryParse.error.flatten().fieldErrors
				},
				{ status: 400 }
			);
		}

		const [sequence] = await db
			.select({ id: sequences.id })
			.from(sequences)
			.where(and(eq(sequences.id, sequenceParse.data.id), eq(sequences.teamId, team.id)))
			.limit(1);

		if (!sequence) {
			return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
		}

		const { status, contact, from, to, page, pageSize } = queryParse.data;

		let fromDate: Date | undefined;
		if (from) {
			const parsed = new Date(from);
			if (Number.isNaN(parsed.getTime())) {
				return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
			}
			fromDate = parsed;
		}

		let toDate: Date | undefined;
		if (to) {
			const parsed = new Date(to);
			if (Number.isNaN(parsed.getTime())) {
				return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });
			}
			const endOfDay = new Date(parsed.getTime());
			endOfDay.setUTCHours(23, 59, 59, 999);
			toDate = endOfDay;
		}

		if (fromDate && toDate && fromDate > toDate) {
			return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 });
		}

		const result = await listSequenceDeliveryLogsForTeam(team.id, sequence.id, {
			status,
			contact,
			from: fromDate,
			to: toDate,
			page,
			pageSize
		});

		const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / pageSize);

		return NextResponse.json({
			logs: result.logs.map((log) => ({
				id: log.id,
				status: log.status,
				attempts: log.attempts,
				createdAt: log.createdAt.toISOString(),
				messageId: log.messageId,
				errorMessage: log.errorMessage,
				contact: {
					id: log.contact.id,
					firstName: log.contact.firstName,
					lastName: log.contact.lastName,
					email: log.contact.email
				},
				step: log.step
					? {
							id: log.step.id,
							order: log.step.order,
							subject: log.step.subject
						}
					: null
			})),
			page,
			pageSize,
			total: result.total,
			totalPages
		});
	} catch (error) {
		console.error('Failed to load sequence delivery logs', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
