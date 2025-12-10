#!/usr/bin/env tsx
/**
 * Connection monitoring script
 * Run this to check database and worker health
 * Usage: tsx scripts/monitor-connections.ts
 */

import { client, db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

async function checkDatabaseConnections() {
  console.log('\n=== Database Connection Status ===\n');
  
  try {
    // Check active connections
    const result = await client`
      SELECT 
        count(*) as total_connections,
        sum(case when state = 'active' then 1 else 0 end) as active,
        sum(case when state = 'idle' then 1 else 0 end) as idle,
        sum(case when state = 'idle in transaction' then 1 else 0 end) as idle_in_transaction
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    
    console.log('Connection Pool Status:');
    console.table(result);
    
    // Check for long-running queries
    const longQueries = await client`
      SELECT 
        pid,
        state,
        usename,
        application_name,
        client_addr,
        query_start,
        state_change,
        wait_event_type,
        wait_event,
        left(query, 100) as query_preview
      FROM pg_stat_activity
      WHERE 
        datname = current_database()
        AND state != 'idle'
        AND query_start < now() - interval '1 minute'
      ORDER BY query_start
      LIMIT 10
    `;
    
    if (longQueries.length > 0) {
      console.log('\n⚠️  Long-running queries (>1 min):');
      console.table(longQueries);
    } else {
      console.log('\n✓ No long-running queries detected');
    }
    
    // Check database size
    const dbSize = await client`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        (SELECT count(*) FROM pg_stat_activity) as total_server_connections
    `;
    
    console.log('\nDatabase Info:');
    console.table(dbSize);
    
    // Check for connection leaks (idle in transaction)
    const leaks = await client`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        state,
        state_change,
        now() - state_change as duration
      FROM pg_stat_activity
      WHERE 
        state = 'idle in transaction'
        AND state_change < now() - interval '5 minutes'
    `;
    
    if (leaks.length > 0) {
      console.log('\n🚨 POTENTIAL CONNECTION LEAKS (idle in transaction >5 min):');
      console.table(leaks);
    } else {
      console.log('\n✓ No connection leaks detected');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
}

async function checkSystemResources() {
  console.log('\n=== System Resources ===\n');
  
  const memUsage = process.memoryUsage();
  const formatMB = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
  
  console.log('Node.js Process Memory:');
  console.table({
    'RSS (Total)': formatMB(memUsage.rss),
    'Heap Used': formatMB(memUsage.heapUsed),
    'Heap Total': formatMB(memUsage.heapTotal),
    'External': formatMB(memUsage.external),
  });
  
  const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  if (heapPercent > 80) {
    console.log(`\n⚠️  High heap usage: ${heapPercent}% - consider restarting`);
  } else {
    console.log(`\n✓ Heap usage healthy: ${heapPercent}%`);
  }
}

async function main() {
  console.log('🔍 Starting connection health check...');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  await checkSystemResources();
  const dbHealthy = await checkDatabaseConnections();
  
  console.log('\n=== Summary ===\n');
  console.log(dbHealthy ? '✓ Database connections healthy' : '❌ Database connection issues detected');
  
  await client.end({ timeout: 5 });
  
  process.exit(dbHealthy ? 0 : 1);
}

main().catch((error) => {
  console.error('Monitor script failed:', error);
  process.exit(1);
});
