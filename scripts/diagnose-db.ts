#!/usr/bin/env tsx
import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('POSTGRES_URL not set in environment');
  process.exit(1);
}

const sql = postgres(connectionString);

async function main() {
  try {
    console.log('=== Checking database state ===\n');
    
    // Check if drizzle schema and migrations table exist
    const schemas = await sql`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name = 'drizzle'
    `;
    console.log('Drizzle schema exists:', schemas.length > 0);
    
    if (schemas.length > 0) {
      const migrations = await sql`
        SELECT id, hash, created_at FROM drizzle.__drizzle_migrations 
        ORDER BY id DESC LIMIT 10
      `;
      console.log(`\nApplied migrations (latest 10):`);
      migrations.forEach(m => {
        console.log(`  ${m.id}: ${m.hash} (${m.created_at})`);
      });
      
      const totalCount = await sql`SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations`;
      console.log(`\nTotal migrations applied: ${totalCount[0].count}`);
    }
    
    // Check if sequence_status enum exists
    const enumCheck = await sql`
      SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sequence_status') as exists
    `;
    console.log('\nsequence_status enum exists:', enumCheck[0].exists);
    
    if (enumCheck[0].exists) {
      const enumValues = await sql`
        SELECT e.enumlabel 
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'sequence_status'
        ORDER BY e.enumsortorder
      `;
      console.log('Enum values:', enumValues.map(v => v.enumlabel).join(', '));
    }
    
    // Check sequences table structure
    const seqTable = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'sequences'
      ) as exists
    `;
    console.log('\nsequences table exists:', seqTable[0].exists);
    
    if (seqTable[0].exists) {
      const columns = await sql`
        SELECT column_name, data_type, column_default 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'sequences'
        ORDER BY ordinal_position
      `;
      console.log('\nsequences table columns:');
      columns.forEach(c => {
        console.log(`  ${c.column_name}: ${c.data_type} (default: ${c.column_default || 'none'})`);
      });
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
