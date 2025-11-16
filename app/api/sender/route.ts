import { NextResponse } from 'next/server';

export function GET() {
	return NextResponse.json(
		{
			code: 'SENDER_BASE_ROUTE',
			message: 'Use /api/senders endpoint instead of /api/sender'
		},
		{ status: 403 }
	);
}
