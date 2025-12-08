#!/usr/bin/env tsx
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!);

async function main() {
  try {
    console.log('Adding missing columns to sequences table...\n');
    
    // Add sender_id column
    await sql`
      ALTER TABLE sequences 
      ADD COLUMN IF NOT EXISTS sender_id integer 
      REFERENCES senders(id) ON DELETE SET NULL
    `;
    console.log('✓ Added sender_id column');
    
    // Add deleted_at column
    await sql`
      ALTER TABLE sequences 
      ADD COLUMN IF NOT EXISTS deleted_at timestamp
    `;
    console.log('✓ Added deleted_at column');
    
    // Verify
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'sequences'
      AND column_name IN ('sender_id', 'deleted_at')
    `;
    
    console.log('\nVerification - Found columns:', columns.map(c => c.column_name).join(', '));
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
