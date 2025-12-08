import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL environment variable is not set.');
  process.exit(1);
}

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'prefer' });

async function main() {
  try {
    await sql`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sequence_status') THEN
    CREATE TYPE sequence_status AS ENUM ('active', 'paused');
  END IF;
END
$$;`;

    await sql`ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS status sequence_status NOT NULL DEFAULT 'active';`;

    await sql`UPDATE sequences
  SET status = 'active'
  WHERE status IS NULL;`;

    await sql`ALTER TABLE sequences
  ALTER COLUMN status SET DEFAULT 'active';`;

    console.log('Sequence status column ensured.');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
