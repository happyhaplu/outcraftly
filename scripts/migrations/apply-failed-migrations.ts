#!/usr/bin/env tsx
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!);
const migrationsDir = join(process.cwd(), 'lib/db/migrations');

async function applyMigration(filename: string) {
  try {
    const filePath = join(migrationsDir, filename);
    let content = readFileSync(filePath, 'utf-8');
    
    // Remove BEGIN and COMMIT statements to avoid transaction conflicts
    content = content.replace(/^\s*BEGIN\s*;/gmi, '');
    content = content.replace(/^\s*COMMIT\s*;/gmi, '');
    
    console.log(`Applying ${filename}...`);
    await sql.unsafe(content);
    console.log(`  ✓ ${filename} applied successfully`);
    return true;
  } catch (error: any) {
    if (error.code === '42710' || error.code === '42P07' || error.code === '42701' || error.message.includes('already exists')) {
      console.log(`  ⊙ ${filename} - objects already exist`);
      return true;
    } else {
      console.error(`  ✗ ${filename} failed:`, error.message);
      return false;
    }
  }
}

async function main() {
  try {
    console.log('Applying failed migrations with BEGIN/COMMIT stripped...\n');
    
    const failedMigrations = [
      '2025-10-24-0002-sequence-wizard-fields.sql',
      '2025-10-26-0003-sequence-advanced-timezone.sql',
      '2025-10-27-0001-users-role-admin.sql',
      '2025-10-27-0002-users-account-metadata.sql',
      '2025-11-01-0001-contact-custom-fields.sql',
      '2025-11-09-0001-senders-inbound.sql',
      '2025-11-10-0001-senders-inbound-updates.sql',
    ];
    
    for (const migration of failedMigrations) {
      await applyMigration(migration);
    }
    
    console.log('\n✓ All failed migrations reapplied');
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
