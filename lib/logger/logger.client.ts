export interface LogContext {
  requestId?: string;
  userId?: string;
  errorCode?: string;
  component?: string;
  event?: string;
  service?: string;
}

type LoggerShim = {
  child: (ctx?: LogContext) => LoggerShim;
  info: (..._args: unknown[]) => void;
  warn: (..._args: unknown[]) => void;
  error: (..._args: unknown[]) => void;
  debug: (..._args: unknown[]) => void;
};

const noop = () => {
  // intentionally blank
};

const shim: LoggerShim = {
  child: () => shim,
  info: noop,
  warn: noop,
  error: noop,
  debug: noop
};

export const getLogger = (_extraContext?: LogContext) => shim;

export const withLogContext = async <T>(_context: LogContext, fn: () => Promise<T> | T): Promise<T> => {
  return await fn();
};

export const logger = shim;

export default {
  logger,
  getLogger,
  withLogContext
};
