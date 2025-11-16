import { execSync } from 'node:child_process';

function ensureEnv(name: string) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    console.error(`[db:setup:ci] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function run(command: string) {
  console.log(`[db:setup:ci] Running: ${command}`);
  execSync(command, { stdio: 'inherit' });
}

try {
  ensureEnv('POSTGRES_URL');

  run('pnpm db:migrate');

  const skipSeedFlag = (process.env.SKIP_DB_SEED ?? '').toLowerCase();
  const shouldSeed = skipSeedFlag === '' || skipSeedFlag === 'false' || skipSeedFlag === '0' || skipSeedFlag === 'no';

  if (shouldSeed) {
    run('pnpm db:seed');
  } else {
    console.log('[db:setup:ci] Skipping seed step because SKIP_DB_SEED is set.');
  }

  console.log('[db:setup:ci] Completed successfully.');
} catch (error) {
  console.error('[db:setup:ci] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
