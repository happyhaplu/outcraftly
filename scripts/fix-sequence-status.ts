#!/usr/bin/env tsx
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!);

async function main() {
  try {
    console.log('Adding draft status to sequence_status enum...\n');
    
    // Add 'draft' to enum if not exists
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'sequence_status'
            AND e.enumlabel = 'draft'
        ) THEN
          ALTER TYPE sequence_status ADD VALUE 'draft';
          RAISE NOTICE 'Added draft to sequence_status enum';
        ELSE
          RAISE NOTICE 'draft already exists in sequence_status enum';
        END IF;
      END
      $$;
    `;
    
    // Update sequences table default
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'sequences' 
            AND column_name = 'status'
        ) THEN
          ALTER TABLE sequences ALTER COLUMN status SET DEFAULT 'draft';
          RAISE NOTICE 'Set default status to draft for sequences table';
        END IF;
      END
      $$;
    `;
    
    console.log('\n✓ Successfully updated sequence_status enum and default');
    
    // Verify
    const enumValues = await sql`
      SELECT e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      WHERE t.typname = 'sequence_status'
      ORDER BY e.enumsortorder
    `;
    console.log('\nCurrent enum values:', enumValues.map(v => v.enumlabel).join(', '));
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
