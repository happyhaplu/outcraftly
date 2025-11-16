import { NextResponse } from 'next/server';
import { getMetricsSnapshot } from '@/lib/metrics';
import { getHeartbeatSnapshot } from '@/lib/workers/heartbeat';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    metrics: getMetricsSnapshot(),
    heartbeats: getHeartbeatSnapshot()
  });
}
