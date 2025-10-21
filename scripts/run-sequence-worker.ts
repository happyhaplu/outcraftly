import { exit } from 'node:process';

import { client } from '@/lib/db/drizzle';
import { runSequenceWorker } from '@/lib/workers/sequence-worker';

function parseArgs() {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let teamId: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--limit' || arg === '-l') {
      const next = args[index + 1];
      if (!next) {
        throw new Error('Missing value for --limit');
      }
      const parsed = Number.parseInt(next, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error('Limit must be a positive integer');
      }
      limit = parsed;
      index += 1;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = arg.split('=')[1];
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error('Limit must be a positive integer');
      }
      limit = parsed;
      continue;
    }

    if (arg === '--team' || arg === '-t') {
      const next = args[index + 1];
      if (!next) {
        throw new Error('Missing value for --team');
      }
      const parsed = Number.parseInt(next, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error('Team ID must be a positive integer');
      }
      teamId = parsed;
      index += 1;
      continue;
    }

    if (arg.startsWith('--team=')) {
      const value = arg.split('=')[1];
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error('Team ID must be a positive integer');
      }
      teamId = parsed;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm worker:run [--limit <number>] [--team <teamId>]');
      exit(0);
    }
  }

  return { limit, teamId } as const;
}

async function main() {
  const options = parseArgs();
  console.log('Running sequence worker with options:', options);

  try {
    const result = await runSequenceWorker(options);
    console.log('Sequence worker completed:', result);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Sequence worker failed:', error);
  exit(1);
});
