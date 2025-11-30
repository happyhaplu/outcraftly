import { db } from '@/lib/db/drizzle';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const duration = Date.now() - start;
    
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      responseTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
      env: {
        baseUrl: process.env.BASE_URL,
        nodeEnv: process.env.NODE_ENV,
        postgresConfigured: !!process.env.POSTGRES_URL,
        databaseConfigured: !!process.env.DATABASE_URL
      }
    });
  } catch (error) {
    console.error('[health] Database connectivity check failed:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      env: {
        baseUrl: process.env.BASE_URL,
        nodeEnv: process.env.NODE_ENV,
        postgresConfigured: !!process.env.POSTGRES_URL,
        databaseConfigured: !!process.env.DATABASE_URL
      }
    }, { status: 503 });
  }
}
