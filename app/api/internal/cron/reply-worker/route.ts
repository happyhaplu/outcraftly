import { NextResponse } from 'next/server';

import { runReplyDetectionWorker } from '@/lib/workers/reply-detection-worker';

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

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return undefined;
}

export async function GET(request: Request) {
  const secret = process.env.REPLY_WORKER_SECRET;
  if (!secret || secret.trim().length === 0) {
    console.error('Reply worker secret is not configured');
    return NextResponse.json({ error: 'Reply worker not configured' }, { status: 500 });
  }

  const providedToken = extractToken(request);
  if (!providedToken || providedToken !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);

  let limit: number | undefined;
  let debug: boolean | undefined;

  try {
    limit = parseIntegerParam(url.searchParams.get('limit'), 'limit');
    debug = parseBooleanParam(url.searchParams.get('debug'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid parameters';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await runReplyDetectionWorker({ messageLimit: limit, debug });
    return NextResponse.json({ processedAt: new Date().toISOString(), result });
  } catch (error) {
    console.error('Reply worker cron failed', error);
    return NextResponse.json({ error: 'Worker execution failed' }, { status: 500 });
  }
}
