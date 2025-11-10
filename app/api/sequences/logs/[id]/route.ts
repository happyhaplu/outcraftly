import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { sequences } from '@/lib/db/schema';
import {
	getTeamForUser,
	getActiveUser,
	listSequenceDeliveryLogsForTeam,
	InactiveTrialError,
	UnauthorizedError,
	TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { sequenceIdSchema, sequenceLogQuerySchema } from '@/lib/validation/sequence';

export const runtime = 'nodejs';

export async function GET(request: Request, context: any) {
	const params = ((await context?.params) ?? {}) as { id?: string };
	const searchParams = new URL(request.url).searchParams;

	try {
		await getActiveUser();

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

		const filters: Parameters<typeof listSequenceDeliveryLogsForTeam>[2] = {
			page,
			pageSize
		};

		if (contact) {
			filters.contact = contact;
		}
		if (fromDate) {
			filters.from = fromDate;
		}
		if (toDate) {
			filters.to = toDate;
		}

		if (status && status !== 'all') {
			switch (status) {
				case 'replied':
					filters.type = 'reply';
					break;
				case 'bounced':
					filters.type = 'bounce';
					break;
				case 'sent':
				case 'manual_send':
				case 'failed':
				case 'retrying':
				case 'skipped':
				case 'delayed':
					filters.status = status;
					break;
				default:
					return NextResponse.json({ error: `Unsupported status filter: ${status}` }, { status: 400 });
			}
		}

		let result: Awaited<ReturnType<typeof listSequenceDeliveryLogsForTeam>>;
		try {
			result = await listSequenceDeliveryLogsForTeam(team.id, sequence.id, filters);
		} catch (error) {
			console.error('[SequenceLogs] Query failed', error);
			const message = error instanceof Error ? error.message : 'Failed to load delivery logs';
			return NextResponse.json({ error: message }, { status: 500 });
		}

		if (process.env.NODE_ENV !== 'production') {
			const normalizedFilterStatus =
				filters.status ?? (filters.type === 'reply' ? 'replied' : filters.type === 'bounce' ? 'bounced' : 'all');
			const logFilters = {
				sequenceId: sequence.id,
				status: normalizedFilterStatus,
				type: filters.type ?? null,
				contact: filters.contact ?? null,
				from: filters.from ? filters.from.toISOString() : null,
				to: filters.to ? filters.to.toISOString() : null,
				page: filters.page,
				pageSize: filters.pageSize
			};
			console.log('[SequenceLogs]', { status: status ?? 'all', filters: logFilters, rows: result.logs.length });
		}

		const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / pageSize);

		return NextResponse.json({
			logs: result.logs.map((log) => ({
				id: log.id,
				status: log.status,
				type: log.type,
				attempts: log.attempts,
				createdAt: log.createdAt.toISOString(),
				messageId: log.messageId,
				errorMessage: log.errorMessage,
				skipReason: log.skipReason,
				rescheduledFor: log.rescheduledFor ? log.rescheduledFor.toISOString() : null,
				delayReason: log.delayReason,
				delayMs: log.delayMs,
				minIntervalMinutes: log.minIntervalMinutes,
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
		if (error instanceof UnauthorizedError) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (error instanceof InactiveTrialError) {
			return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
		}

		console.error('Failed to load sequence delivery logs', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
