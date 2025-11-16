import { exit } from 'node:process';

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { client, db } from '@/lib/db/drizzle';
import { contactSequenceStatus, deliveryLogs, sequences } from '@/lib/db/schema';

export type CleanupOptions = {
  teamId?: number;
  dryRun: boolean;
};

type Argv = {
  '--team'?: string;
  '--dry-run'?: boolean;
  '--help'?: boolean;
};

export function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2) as Array<keyof Argv | string>;
  let teamId: number | undefined;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--team' || arg === '-t') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('Missing value for --team');
      }
      const parsed = Number.parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Team ID must be a positive integer');
      }
      teamId = parsed;
      index += 1;
      continue;
    }

    if (arg.startsWith('--team=')) {
      const parsed = Number.parseInt(arg.split('=')[1] ?? '', 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Team ID must be a positive integer');
      }
      teamId = parsed;
      continue;
    }

    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm tsx scripts/cleanup-sequence-replies.ts [--team <teamId>] [--dry-run]');
      exit(0);
    }
  }

  return { teamId, dryRun };
}

export async function cleanupSequenceReplies(options: CleanupOptions, now = new Date()) {
  const sequenceWhere = options.teamId
    ? and(isNotNull(sequences.deletedAt), eq(sequences.teamId, options.teamId))
    : isNotNull(sequences.deletedAt);

  const sequenceRows = await db
    .select({ id: sequences.id })
    .from(sequences)
    .where(sequenceWhere);

  const sequenceIds = sequenceRows.map((row) => row.id);
  if (sequenceIds.length === 0) {
    console.log('No deleted sequences found that require cleanup.');
    return {
      dryRun: options.dryRun,
      sequencesProcessed: 0,
      statusesCleared: 0,
      replyLogsArchived: 0
    } as const;
  }

  const statusCandidates = await db
    .select({
      id: contactSequenceStatus.id,
      contactId: contactSequenceStatus.contactId,
      sequenceId: contactSequenceStatus.sequenceId,
      replyAt: contactSequenceStatus.replyAt
    })
    .from(contactSequenceStatus)
    .where(and(inArray(contactSequenceStatus.sequenceId, sequenceIds), isNotNull(contactSequenceStatus.replyAt)));

  const replyLogs = await db
    .select({
      id: deliveryLogs.id,
      sequenceId: deliveryLogs.sequenceId
    })
    .from(deliveryLogs)
    .where(and(inArray(deliveryLogs.sequenceId, sequenceIds), eq(deliveryLogs.type, 'reply')));

  console.log('Sequences flagged for reply cleanup:', sequenceIds.length);
  console.log('Reply cleanup summary:', {
    statusesNeedingReset: statusCandidates.length,
    replyLogsToArchive: replyLogs.length
  });

  if (options.dryRun) {
    const previewStatuses = statusCandidates.slice(0, 5).map((entry) => ({
      statusId: entry.id,
      contactId: entry.contactId,
      sequenceId: entry.sequenceId,
      repliedAt: entry.replyAt
    }));

    const previewLogs = replyLogs.slice(0, 5).map((entry) => ({
      logId: entry.id,
      sequenceId: entry.sequenceId
    }));

    if (previewStatuses.length > 0) {
      console.log('[Dry Run] Status rows to reset (sample):', previewStatuses);
    }
    if (previewLogs.length > 0) {
      console.log('[Dry Run] Reply logs to archive (sample):', previewLogs);
    }

    console.log('[Dry Run] Skipping database updates.');

    return {
      dryRun: true,
      sequencesProcessed: sequenceIds.length,
      statusesCleared: statusCandidates.length,
      replyLogsArchived: replyLogs.length
    } as const;
  }

  const repliedStatusUpdates = await db
    .update(contactSequenceStatus)
    .set({ status: 'sent', replyAt: null, lastUpdated: now })
    .where(
      and(
        inArray(contactSequenceStatus.sequenceId, sequenceIds),
        eq(contactSequenceStatus.status, 'replied')
      )
    )
    .returning({
      statusId: contactSequenceStatus.id,
      contactId: contactSequenceStatus.contactId,
      sequenceId: contactSequenceStatus.sequenceId
    });

  const nonRepliedStatusUpdates = await db
    .update(contactSequenceStatus)
    .set({ replyAt: null, lastUpdated: now })
    .where(
      and(
        inArray(contactSequenceStatus.sequenceId, sequenceIds),
        isNotNull(contactSequenceStatus.replyAt),
        sql`${contactSequenceStatus.status} <> 'replied'`
      )
    )
    .returning({
      statusId: contactSequenceStatus.id,
      contactId: contactSequenceStatus.contactId,
      sequenceId: contactSequenceStatus.sequenceId
    });

  const archivedLogs = await db
    .update(deliveryLogs)
    .set({ type: 'reply_archived' })
    .where(
      and(
        inArray(deliveryLogs.sequenceId, sequenceIds),
        eq(deliveryLogs.type, 'reply')
      )
    )
    .returning({
      id: deliveryLogs.id,
      sequenceId: deliveryLogs.sequenceId
    });

  const totalStatusesCleared = repliedStatusUpdates.length + nonRepliedStatusUpdates.length;

  console.log('Cleanup complete:', {
    sequencesProcessed: sequenceIds.length,
    statusesCleared: totalStatusesCleared,
    replyLogsArchived: archivedLogs.length
  });

  return {
    dryRun: false,
    sequencesProcessed: sequenceIds.length,
    statusesCleared: totalStatusesCleared,
    replyLogsArchived: archivedLogs.length
  } as const;
}

async function main() {
  const options = parseArgs();
  console.log('Running reply cleanup with options:', options);

  try {
    await cleanupSequenceReplies(options);
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error('Reply cleanup failed:', error);
    exit(1);
  });
}
