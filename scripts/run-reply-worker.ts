import { exit } from 'node:process';

import { client } from '@/lib/db/drizzle';
import { runReplyDetectionWorker } from '@/lib/workers/reply-detection-worker';

type StructuredLogger = Pick<typeof console, 'info' | 'warn' | 'error'>;

function createStructuredLogger(debug: boolean): StructuredLogger {
  const write = (level: 'info' | 'warn' | 'error') => (...args: unknown[]) => {
    const [first, second, ...rest] = args;

    const logWithConsole = () => {
      (console as typeof console)[level](...args as any[]);
    };

    if (!debug) {
      // Preserve legacy behaviour unless debug tracing requested.
      logWithConsole();
      return;
    }

    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      const payload = { level, ...(first as Record<string, unknown>) };
      console.log(JSON.stringify(payload));
      if (rest.length > 0) {
        console.log(JSON.stringify({ level, extra: rest }));
      }
      return;
    }

    if (typeof first === 'string' && first.startsWith('[ReplyDetectionWorker]')) {
      const context = typeof second === 'object' && second !== null ? (second as Record<string, unknown>) : {};
      const entry = {
        level,
        message: first,
        ...context
      };
      console.log(JSON.stringify(entry));
      if (rest.length > 0) {
        console.log(JSON.stringify({ level, extra: rest }));
      }
      return;
    }

    logWithConsole();
  };

  return {
    info: write('info'),
    warn: write('warn'),
    error: write('error')
  };
}

export function parseArgs(argv: string[] = process.argv.slice(2)) {
  const args = [...argv];
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

export async function runReplyWorkerCli(argv?: string[], options: { exitFn?: (code: number) => never } = {}) {
  const { limit, debug } = parseArgs(argv);
  console.log('Running reply detection worker with options:', { limit, debug });
  let exitCode = 0;
  const logger = createStructuredLogger(debug);
  const exitFn = options.exitFn ?? exit;
  const MAX_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 5000;

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const isImapTimeoutError = (error: unknown) => {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const record = error as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code.toLowerCase() : '';
    const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

    return code.includes('timeout') || message.includes('timeout');
  };

  let attempt = 0;
  let result: Awaited<ReturnType<typeof runReplyDetectionWorker>> | null = null;

  try {
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        result = await runReplyDetectionWorker({ messageLimit: limit, debug, log: logger });
        break;
      } catch (error) {
        const timeout = isImapTimeoutError(error);
        const context = {
          tag: '[ReplyWorker]',
          level: 'error',
          action: timeout ? 'imap-timeout' : 'worker-failure',
          attempt,
          reason: timeout ? 'IMAP timeout' : 'Worker failed',
          error
        };
        logger.error(context);
        if (timeout && attempt < MAX_ATTEMPTS) {
          logger.warn({
            tag: '[ReplyWorker]',
            level: 'warn',
            action: 'retrying-after-timeout',
            nextAttemptInMs: RETRY_DELAY_MS,
            attempt: attempt + 1
          });
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        exitCode = 1;
        break;
      }
    }

    if (result) {
      console.log('Reply detection worker completed:', {
        sendersProcessed: result.metrics.length,
        totals: result.totals
      });

      if (result.totals.errors > 0) {
        console.warn(
          'Reply detection worker reported errors. Inspect logs above for details and rerun with --debug for verbose tracing.'
        );
        exitCode = 1;
      }

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
    } else if (exitCode === 0) {
      exitCode = 1;
    }
  } finally {
    await client.end({ timeout: 5 });
  }

  if (exitCode !== 0) {
    exitFn(exitCode);
  }
}

if (process.env.NODE_ENV !== 'test') {
  runReplyWorkerCli().catch((error) => {
    console.error('Reply detection worker failed:', error);
    exit(1);
  });
}
