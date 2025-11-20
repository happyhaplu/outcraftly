#!/usr/bin/env tsx
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!);
const migrationsDir = join(process.cwd(), 'lib/db/migrations');

async function main() {
  try {
    console.log('Manually applying remaining migrations...\n');
    
    // Get list of applied migrations
    const appliedMigrations = await sql`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id
    `;
    const appliedHashes = new Set(appliedMigrations.map(m => m.hash));
    
    console.log(`Applied migrations: ${appliedHashes.size}`);
    
    // List of migrations that need to be applied (after 0018)
    const remainingMigrations = [
      // These should already be applied but let's verify
      'manual_0008_sequence_worker_support.sql',
      '144195cddf845f10a1c1a3125b3285175b264964ce850d68c4a7272fbd8a7b2d.sql',
      'manual_0018_sequence_sender_assignment.sql',
      // These definitely need to be applied
      '0019_add_sequence_draft_status.sql',
      '0020_add_sequence_launch_at.sql',
      '2025-10-24-0001-add-sequence-draft.sql',
      '2025-10-24-0002-sequence-wizard-fields.sql',
      '2025-10-25-0001-delivery-logs-skipped.sql',
      '2025-10-26-0001-delivery-logs-delayed.sql',
      '2025-10-26-0002-sequences-min-gap.sql',
      '2025-10-26-0003-sequence-advanced-timezone.sql',
      '2025-10-27-0001-users-role-admin.sql',
      '2025-10-27-0002-users-account-metadata.sql',
      '2025-10-28-0001-plan-usage.sql',
      '2025-10-28-0002-plans-table.sql',
      '2025-10-29-0001-team-payment-status.sql',
      '2025-11-01-0001-contact-custom-fields.sql',
      '2025-11-02-0001-contacts-job-title.sql',
      '2025-11-09-0001-senders-inbound.sql',
      '2025-11-10-0001-senders-inbound-updates.sql',
      '2025-11-10-0002-delivery-logs-reply-status.sql',
    ];
    
    console.log(`\nAttempting to apply ${remainingMigrations.length} migrations...\n`);
    
    for (const migrationFile of remainingMigrations) {
      try {
        const filePath = join(migrationsDir, migrationFile);
        const sql_content = readFileSync(filePath, 'utf-8');
        
        console.log(`Applying ${migrationFile}...`);
        await sql.unsafe(sql_content);
        console.log(`  ✓ ${migrationFile} applied successfully`);
      } catch (error: any) {
        // Check if error is due to already existing objects
        if (error.code === '42710' || error.code === '42P07' || error.code === '42701') {
          console.log(`  ⊙ ${migrationFile} - objects already exist (${error.message})`);
        } else if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`  ⊙ ${migrationFile} - skipped (already applied)`);
        } else {
          console.error(`  ✗ ${migrationFile} failed:`, error.message);
        }
      }
    }
    
    console.log('\n✓ Manual migration application complete');
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
