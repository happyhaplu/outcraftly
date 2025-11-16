import { setTimeout as delay } from 'node:timers/promises';

import { getLogger } from '@/lib/logger';

export type ResilienceErrorCode =
  | 'circuit_open'
  | 'CIRCUIT_OPEN'
  | 'timeout'
  | 'TIMEOUT'
  | 'retry_exhausted'
  | 'RETRY_EXHAUSTED';

export class ResilienceError extends Error {
  constructor(public readonly code: ResilienceErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ResilienceError';
    if (options?.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }
}

export type ResilienceOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  breakerThreshold?: number;
  breakerResetMs?: number;
  breakerKey: string;
};

type CircuitState = {
  failures: number;
  openUntil: number;
  lastError?: unknown;
};

const breakerState = new Map<string, CircuitState>();

const defaultOptions: Required<Omit<ResilienceOptions, 'breakerKey'>> = {
  retries: 3,
  baseDelayMs: 250,
  timeoutMs: 10000,
  breakerThreshold: 5,
  breakerResetMs: 60000
};

export const executeWithResilience = async <T>(
  name: string,
  operation: () => Promise<T>,
  options: ResilienceOptions
): Promise<T> => {
  const merged = { ...defaultOptions, ...options };
  const logger = getLogger({ component: 'resilience', service: name });
  const state = breakerState.get(merged.breakerKey);
  const now = Date.now();

  if (state && state.openUntil > now) {
    throw new ResilienceError('circuit_open', 'SMTP outage continues', { cause: state.lastError });
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= merged.retries) {
    attempt += 1;

    try {
      const result = await withTimeout(operation(), merged.timeoutMs);
      breakerState.set(merged.breakerKey, { failures: 0, openUntil: 0, lastError: undefined });
      return result;
    } catch (error) {
      lastError = error;
      logger.warn({ attempt, error }, `${name} operation failed`);

      const currentState: CircuitState = breakerState.get(merged.breakerKey) ?? { failures: 0, openUntil: 0 };
      currentState.lastError = error;
      currentState.failures += 1;

      if (currentState.failures >= merged.breakerThreshold) {
        currentState.openUntil = Date.now() + merged.breakerResetMs;
        breakerState.set(merged.breakerKey, currentState);
        logger.error({ error, failures: currentState.failures }, `${name} circuit opened`);
        throw new ResilienceError('circuit_open', 'SMTP outage continues', { cause: error });
      }

      breakerState.set(merged.breakerKey, currentState);

      if (attempt > merged.retries) {
        break;
      }

      const delayMs = merged.baseDelayMs * 2 ** (attempt - 1);
      await delay(delayMs);
    }
  }

  if (lastError instanceof ResilienceError) {
    const lastCode = lastError.code;
    if (lastCode === 'CIRCUIT_OPEN' || lastCode === 'circuit_open') {
      throw lastError;
    }
    if (lastCode === 'TIMEOUT' || lastCode === 'timeout') {
      throw lastError;
    }
  }

  const message = 'SMTP outage continues';
  throw new ResilienceError('RETRY_EXHAUSTED', message, { cause: lastError });
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ResilienceError('TIMEOUT', 'Operation timed out'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};
