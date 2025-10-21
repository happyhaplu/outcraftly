import { NextResponse } from 'next/server';

import { runSequenceWorker } from '@/lib/workers/sequence-worker';

export const runtime = 'nodejs';

function extractToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  return queryToken ? queryToken.trim() : null;
}

function parseIntegerParam(value: string | null, label: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}`);
  }

  return parsed;
}

export async function GET(request: Request) {
  const secret = process.env.SEQUENCE_WORKER_SECRET;
  if (!secret || secret.trim().length === 0) {
    console.error('Sequence worker secret is not configured');
    return NextResponse.json({ error: 'Sequence worker not configured' }, { status: 500 });
  }

  const providedToken = extractToken(request);
  if (!providedToken || providedToken !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);

  let limit: number | undefined;
  let teamId: number | undefined;

  try {
    limit = parseIntegerParam(url.searchParams.get('limit'), 'limit');
    const teamParam = url.searchParams.get('teamId');
    if (teamParam) {
      const parsedTeam = Number.parseInt(teamParam, 10);
      if (Number.isNaN(parsedTeam) || parsedTeam <= 0) {
        throw new Error('Invalid teamId');
      }
      teamId = parsedTeam;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid parameters';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await runSequenceWorker({ limit, teamId });
    return NextResponse.json({ processedAt: new Date().toISOString(), result });
  } catch (error) {
    console.error('Sequence worker cron failed', error);
    return NextResponse.json({ error: 'Worker execution failed' }, { status: 500 });
  }
}
