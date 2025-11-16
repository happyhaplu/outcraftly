import { NextResponse } from 'next/server';

export function GET() {
	return NextResponse.json(
		{
			code: 'SEQUENCE_BASE_ROUTE',
			message: 'Use /api/sequences/[id] or /api/sequences/* endpoints'
		},
		{ status: 400 }
	);
}
