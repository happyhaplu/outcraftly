import { exit } from 'node:process';

import { client } from '@/lib/db/drizzle';
import { runReplyDetectionWorker } from '@/lib/workers/reply-detection-worker';

function parseArgs() {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let debug = false;

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

    if (arg === '--debug' || arg === '-d') {
      debug = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm reply:run [--limit <number>] [--debug]');
      exit(0);
    }
  }

  return { limit, debug } as const;
}

async function main() {
  const { limit, debug } = parseArgs();
  console.log('Running reply detection worker with options:', { limit, debug });

  try {
    const result = await runReplyDetectionWorker({ messageLimit: limit, debug });

    console.log('Reply detection worker completed:', {
      sendersProcessed: result.metrics.length,
      totals: result.totals
    });

    if (result.metrics.length > 0) {
      console.table(
        result.metrics.map((m) => ({
          senderId: m.senderId,
          fetched: m.fetched,
          matched: m.matched,
          ignored: m.ignored,
          errors: m.errors
        }))
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Reply detection worker failed:', error);
  exit(1);
});
