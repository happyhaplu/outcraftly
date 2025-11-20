#!/usr/bin/env tsx
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!);

async function main() {
  try {
    console.log('=== Adding manual trigger columns to contact_sequence_status ===\n');
    
    // Add manual_triggered_at column
    console.log('Adding manual_triggered_at column...');
    await sql`
      ALTER TABLE contact_sequence_status 
      ADD COLUMN IF NOT EXISTS manual_triggered_at timestamp without time zone
    `;
    console.log('✓ manual_triggered_at column added');
    
    // Add manual_sent_at column
    console.log('Adding manual_sent_at column...');
    await sql`
      ALTER TABLE contact_sequence_status 
      ADD COLUMN IF NOT EXISTS manual_sent_at timestamp without time zone
    `;
    console.log('✓ manual_sent_at column added');
    
    console.log('\n✅ All manual trigger columns added successfully');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
