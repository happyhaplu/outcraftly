#!/usr/bin/env tsx
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!);

async function main() {
  try {
    console.log('=== Checking sequences table columns ===\n');
    
    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'sequences'
      ORDER BY ordinal_position
    `;
    
    console.log('Current columns in sequences table:');
    columns.forEach(c => {
      console.log(`  ${c.column_name}: ${c.data_type} (default: ${c.column_default || 'none'}, nullable: ${c.is_nullable})`);
    });
    
    const expectedColumns = [
      'id', 'team_id', 'user_id', 'sender_id', 'name', 'status',
      'created_at', 'updated_at', 'deleted_at', 'launch_at', 'launched_at',
      'track_opens', 'track_clicks', 'enable_unsubscribe', 'stop_condition',
      'stop_on_bounce', 'min_gap_minutes', 'schedule_mode', 'schedule_send_time',
      'schedule_window_start', 'schedule_window_end', 'schedule_respect_timezone',
      'schedule_fallback_timezone', 'schedule_timezone', 'schedule_send_days',
      'schedule_send_windows'
    ];
    
    const existingColumns = columns.map(c => c.column_name);
    const missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('\n❌ Missing columns:');
      missingColumns.forEach(col => console.log(`  - ${col}`));
    } else {
      console.log('\n✓ All expected columns exist');
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
