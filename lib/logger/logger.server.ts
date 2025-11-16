'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { LoggerOptions } from 'pino';

export interface LogContext {
  requestId?: string;
  userId?: string;
  errorCode?: string;
  component?: string;
  event?: string;
  service?: string;
}

const logLevel = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const baseLogger = pino({
  level: logLevel,
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.token', 'user.passwordHash', 'context.sensitive'],
    remove: true
  }
} satisfies LoggerOptions);

const contextStore = new AsyncLocalStorage<LogContext>();

export const getLogger = (extraContext?: LogContext) => {
  const store = contextStore.getStore();
  const context = { ...store, ...extraContext } satisfies LogContext;
  return baseLogger.child(context);
};

export const withLogContext = async <T>(context: LogContext, fn: () => Promise<T> | T): Promise<T> => {
  return await contextStore.run(context, async () => await fn());
};

export const logger = baseLogger;

export default {
  logger,
  getLogger,
  withLogContext
};

declare global {
  // eslint-disable-next-line no-var
  var __structuredConsolePatched: boolean | undefined;
}

// Patch console on the server only. This ensures any server-side console.* calls
// are forwarded to pino with contextual information from AsyncLocalStorage.
if (typeof window === 'undefined' && !globalThis.__structuredConsolePatched) {
  globalThis.__structuredConsolePatched = true;

  const wrap = (level: 'info' | 'warn' | 'error' | 'debug') =>
    (...args: unknown[]) => {
      const payload = args.length === 1 ? args[0] : args;
      const store = contextStore.getStore();
      const scoped = store ? baseLogger.child(store) : baseLogger;
      if (level === 'debug') {
        scoped.debug({ payload }, 'console.debug forwarded');
        return;
      }
      scoped[level]({ payload }, `console.${level} forwarded`);
    };

  // Replace console methods on server.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).log = wrap('info');
  console.info = wrap('info');
  console.warn = wrap('warn');
  console.error = wrap('error');
  // Some runtimes don't have console.debug; guard defensively.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).debug = wrap('debug');
}
