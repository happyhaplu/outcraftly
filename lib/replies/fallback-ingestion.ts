import { promises as fs } from 'node:fs';
import path from 'node:path';

import { recordSequenceEvents, type SequenceInboundEvent } from '@/lib/db/queries';

export type FallbackIngestionLogger = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>
) => void;

export type FallbackIngestionOptions = {
  directory?: string;
  logger?: FallbackIngestionLogger;
};

export type FallbackIngestionResult = {
  processed: number;
  filesProcessed: number;
  errors: Array<{ file: string; error: string }>;
  skipped?: 'directory_not_configured' | 'no_files';
};

const FALLBACK_FILE_EXTENSIONS = new Set(['.json', '.ndjson']);

const DEFAULT_RESULT: FallbackIngestionResult = {
  processed: 0,
  filesProcessed: 0,
  errors: [],
  skipped: 'directory_not_configured'
};

async function ensureDirectoryExists(target: string) {
  await fs.mkdir(target, { recursive: true });
}

function normaliseEvents(value: unknown): SequenceInboundEvent[] {
  const events: SequenceInboundEvent[] = [];

  const appendEvent = (candidate: any) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }

    const type = typeof candidate.type === 'string' ? candidate.type : null;
    if (type !== 'reply' && type !== 'bounce') {
      return;
    }

    const messageId = typeof candidate.messageId === 'string' && candidate.messageId.trim().length > 0
      ? candidate.messageId.trim()
      : null;
    const contactId = typeof candidate.contactId === 'string' && candidate.contactId.trim().length > 0
      ? candidate.contactId.trim()
      : null;
    const sequenceId = typeof candidate.sequenceId === 'string' && candidate.sequenceId.trim().length > 0
      ? candidate.sequenceId.trim()
      : null;
    const occurredAtRaw = candidate.occurredAt;
    const occurredAt = occurredAtRaw instanceof Date
      ? occurredAtRaw
      : typeof occurredAtRaw === 'string'
        ? new Date(occurredAtRaw)
        : null;
    const payload = candidate.payload ?? null;

    const safeOccurredAt = occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : new Date();

    events.push({
      type,
      messageId,
      contactId,
      sequenceId,
      occurredAt: safeOccurredAt,
      payload
    });
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      appendEvent(entry);
    }
    return events;
  }

  if (value && typeof value === 'object' && Array.isArray((value as any).events)) {
    for (const entry of (value as any).events) {
      appendEvent(entry);
    }
    return events;
  }

  appendEvent(value as any);
  return events;
}

async function moveFile(source: string, destinationDir: string, logger?: FallbackIngestionLogger) {
  try {
    await ensureDirectoryExists(destinationDir);
    const basename = path.basename(source);
    const destination = path.join(destinationDir, basename);
    await fs.rename(source, destination).catch(async () => {
      await fs.copyFile(source, destination);
      await fs.unlink(source);
    });
  } catch (error) {
    logger?.('warn', 'Failed to move fallback reply file', {
      source,
      destinationDir,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function ingestFallbackReplies(options: FallbackIngestionOptions = {}): Promise<FallbackIngestionResult> {
  const directory = options.directory ?? process.env.SEQUENCE_REPLY_FALLBACK_DIR;
  const logger = options.logger;

  if (!directory) {
    return { ...DEFAULT_RESULT };
  }

  let files: string[];
  try {
    files = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { ...DEFAULT_RESULT, skipped: 'directory_not_configured' };
    }

    logger?.('warn', 'Failed to read fallback reply directory', {
      directory,
      error: error instanceof Error ? error.message : String(error)
    });
    return { ...DEFAULT_RESULT, skipped: 'directory_not_configured' };
  }

  const candidateFiles = files.filter((file) => {
    const extension = path.extname(file).toLowerCase();
    return FALLBACK_FILE_EXTENSIONS.has(extension);
  });

  if (candidateFiles.length === 0) {
    return {
      processed: 0,
      filesProcessed: 0,
      errors: [],
      skipped: 'no_files'
    };
  }

  const processedDir = path.join(directory, 'processed');
  const failedDir = path.join(directory, 'failed');

  let totalEvents = 0;
  let filesProcessed = 0;
  const errors: Array<{ file: string; error: string }> = [];

  for (const file of candidateFiles) {
    const absolutePath = path.join(directory, file);
    let data: Buffer;

    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        continue;
      }
      data = await fs.readFile(absolutePath);
    } catch (error) {
      errors.push({ file, error: error instanceof Error ? error.message : String(error) });
      logger?.('warn', 'Failed to read fallback reply file', {
        file: absolutePath,
        error: error instanceof Error ? error.message : String(error)
      });
      await moveFile(absolutePath, failedDir, logger);
      continue;
    }

    let parsed: unknown;
    try {
      if (path.extname(file).toLowerCase() === '.ndjson') {
        const events: SequenceInboundEvent[] = [];
        const lines = data
          .toString('utf8')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        for (const line of lines) {
          parsed = JSON.parse(line);
          events.push(...normaliseEvents(parsed));
        }
        if (events.length === 0) {
          await moveFile(absolutePath, processedDir, logger);
          continue;
        }
        await recordSequenceEvents(events);
        totalEvents += events.length;
        filesProcessed += 1;
        await moveFile(absolutePath, processedDir, logger);
        continue;
      }

      parsed = JSON.parse(data.toString('utf8'));
    } catch (error) {
      errors.push({ file, error: error instanceof Error ? error.message : String(error) });
      logger?.('warn', 'Failed to parse fallback reply file', {
        file: absolutePath,
        error: error instanceof Error ? error.message : String(error)
      });
      await moveFile(absolutePath, failedDir, logger);
      continue;
    }

    const events = normaliseEvents(parsed);
    if (events.length === 0) {
      await moveFile(absolutePath, processedDir, logger);
      continue;
    }

    try {
      await recordSequenceEvents(events);
      totalEvents += events.length;
      filesProcessed += 1;
      await moveFile(absolutePath, processedDir, logger);
    } catch (error) {
      errors.push({ file, error: error instanceof Error ? error.message : String(error) });
      logger?.('error', 'Failed to record fallback reply events', {
        file: absolutePath,
        error: error instanceof Error ? error.message : String(error)
      });
      await moveFile(absolutePath, failedDir, logger);
    }
  }

  return {
    processed: totalEvents,
    filesProcessed,
    errors,
    skipped: totalEvents === 0 && filesProcessed === 0 ? 'no_files' : undefined
  };
}
