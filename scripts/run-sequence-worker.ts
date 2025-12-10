import { exit } from 'node:process';

import { randomUUID } from 'node:crypto';

import { client } from '@/lib/db/drizzle';
import { runSequenceWorker } from '@/lib/workers/sequence-worker';
import { withLogContext, getLogger } from '@/lib/logger';

const DEFAULT_IDLE_DELAY_MS = Number.parseInt(process.env.SEQUENCE_WORKER_IDLE_DELAY_MS ?? '30000', 10);
const DEFAULT_ACTIVE_DELAY_MS = Number.parseInt(process.env.SEQUENCE_WORKER_ACTIVE_DELAY_MS ?? '2000', 10);
const DEFAULT_ERROR_DELAY_MS = Number.parseInt(process.env.SEQUENCE_WORKER_ERROR_DELAY_MS ?? '60000', 10);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let teamId: number | undefined;
  let once = false;

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

    if (arg === '--once') {
      once = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm worker:run [--limit <number>] [--team <teamId>] [--once]');
      exit(0);
    }
  }

  return { limit, teamId, once } as const;
}

async function main() {
  const options = parseArgs();
  const logger = getLogger();
  const workerId = randomUUID();
  let stopRequested = false;
  let consecutiveErrors = 0;
  let totalRuns = 0;

  const handleStopSignal = (signal: NodeJS.Signals) => {
    logger.info({ signal, workerId }, 'Sequence worker received stop signal');
    stopRequested = true;
  };

  process.once('SIGINT', handleStopSignal);
  process.once('SIGTERM', handleStopSignal);

  await withLogContext({ requestId: workerId, component: 'sequence-worker-cli' }, async () => {
    logger.info({ options, workerId }, 'Starting sequence worker loop');

    try {
      do {
        totalRuns += 1;
        const iterationId = randomUUID();
        const startedAt = Date.now();
        let delayMs = DEFAULT_IDLE_DELAY_MS;

        try {
          const result = await runSequenceWorker(options);
          consecutiveErrors = 0;

          logger.info({
            iterationId,
            workerId,
            scanned: result.scanned,
            sent: result.sent,
            failed: result.failed,
            retried: result.retried,
            skipped: result.skipped,
            durationMs: result.durationMs
          }, 'Sequence worker run completed');

          if (result.details.length > 0) {
            logger.debug({ iterationId, workerId, details: result.details }, 'Sequence worker task outcomes');
          }

          if (result.diagnostics) {
            logger.info({ iterationId, workerId, diagnostics: result.diagnostics }, 'Sequence worker diagnostics snapshot');
          }

          const hadActivity = result.sent > 0 || result.retried > 0 || result.failed > 0;
          delayMs = hadActivity ? DEFAULT_ACTIVE_DELAY_MS : DEFAULT_IDLE_DELAY_MS;
        } catch (error) {
          consecutiveErrors += 1;
          delayMs = DEFAULT_ERROR_DELAY_MS * Math.min(consecutiveErrors, 5);
          logger.error({ iterationId, workerId, err: error, consecutiveErrors }, 'Sequence worker run failed');
        }

        const runtimeMs = Date.now() - startedAt;
        const remainingDelay = Math.max(0, delayMs - runtimeMs);

        if (options.once) {
          break;
        }

        if (stopRequested) {
          logger.info({ workerId }, 'Stop requested, exiting worker loop');
          break;
        }

        // Periodic connection health check every 100 iterations
        if (totalRuns % 100 === 0) {
          try {
            await client`SELECT 1 as health_check`;
            logger.debug({ workerId, totalRuns }, 'Database connection health check passed');
          } catch (err) {
            logger.error({ workerId, err }, 'Database connection health check failed');
            throw new Error('Database connection unhealthy');
          }
        }

        if (remainingDelay > 0) {
          logger.debug({ workerId, delayMs: remainingDelay }, 'Sequence worker sleeping before next run');
          await sleep(remainingDelay);
        }
      } while (!stopRequested);
    } finally {
      logger.info({ workerId, totalRuns }, 'Sequence worker shutting down');
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      await client.end({ timeout: 5 });
    }
  });
}

main().catch((error) => {
  getLogger({ component: 'sequence-worker-cli' }).error({ err: error }, 'Sequence worker failed');
  exit(1);
});
