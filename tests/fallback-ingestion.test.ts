import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ingestFallbackReplies } from '@/lib/replies/fallback-ingestion';

const recordSequenceEventsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/queries', () => ({
  recordSequenceEvents: recordSequenceEventsMock
}));

const createdDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fallback-ingestion-'));
  createdDirs.push(dir);
  return dir;
}

async function readDirectorySafe(target: string) {
  try {
    return await fs.readdir(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

describe('ingestFallbackReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await Promise.all(
      createdDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }))
    );
  });

  it('ingests JSON files and moves them to processed', async () => {
    const directory = await makeTempDir();
    const filePath = path.join(directory, 'reply.json');

    const eventsPayload = {
      events: [
        {
          type: 'reply',
          messageId: 'message-1',
          contactId: 'contact-1',
          sequenceId: 'sequence-1',
          occurredAt: '2025-10-01T08:00:00.000Z',
          payload: { subject: 'Re: Hello' }
        },
        {
          type: 'bounce',
          messageId: 'message-2',
          contactId: 'contact-2',
          sequenceId: 'sequence-2',
          occurredAt: '2025-10-01T09:00:00.000Z',
          payload: { reason: 'hard_bounce' }
        }
      ]
    };

    await fs.writeFile(filePath, JSON.stringify(eventsPayload), 'utf8');

    recordSequenceEventsMock.mockResolvedValueOnce([]);

    const result = await ingestFallbackReplies({ directory });

    expect(recordSequenceEventsMock).toHaveBeenCalledTimes(1);
    const [events] = recordSequenceEventsMock.mock.calls[0];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'reply', messageId: 'message-1' });
    expect(events[1]).toMatchObject({ type: 'bounce', messageId: 'message-2' });

    expect(result).toMatchObject({ processed: 2, filesProcessed: 1 });

    const processedFiles = await readDirectorySafe(path.join(directory, 'processed'));
    expect(processedFiles).toContain('reply.json');
  });

  it('supports NDJSON payloads', async () => {
    const directory = await makeTempDir();
    const filePath = path.join(directory, 'replies.ndjson');

    const lines = [
      JSON.stringify({
        type: 'reply',
        messageId: 'message-3',
        contactId: 'contact-3',
        sequenceId: 'sequence-3',
        occurredAt: '2025-10-02T10:00:00.000Z'
      }),
      JSON.stringify({
        type: 'bounce',
        messageId: 'message-4',
        contactId: 'contact-4',
        sequenceId: 'sequence-4',
        occurredAt: '2025-10-02T11:00:00.000Z'
      })
    ];

    await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

    recordSequenceEventsMock.mockResolvedValueOnce([]);

    const result = await ingestFallbackReplies({ directory });

    expect(recordSequenceEventsMock).toHaveBeenCalledTimes(1);
    const [events] = recordSequenceEventsMock.mock.calls[0];
    expect(events).toHaveLength(2);
    expect(events.map((event: any) => event.type)).toEqual(['reply', 'bounce']);
    expect(result).toMatchObject({ processed: 2, filesProcessed: 1 });

    const processedFiles = await readDirectorySafe(path.join(directory, 'processed'));
    expect(processedFiles).toContain('replies.ndjson');
  });

  it('skips when the directory has no candidate files', async () => {
    const directory = await makeTempDir();

    const result = await ingestFallbackReplies({ directory });

    expect(recordSequenceEventsMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: 'no_files', processed: 0, filesProcessed: 0 });
  });
});
