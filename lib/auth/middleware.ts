import { z } from 'zod';
import { TeamDataWithMembers, User } from '@/lib/db/schema';
import { InactiveTrialError, getActiveUser, getTeamForUser, getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { getLogger, withLogContext } from '@/lib/logger';

export type ActionState = {
  error?: string;
  success?: string;
  [key: string]: any; // This allows for additional properties
};

type ValidatedActionFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData
) => Promise<T>;

export function validatedAction<S extends z.ZodType<any, any>, T>(schema: S, action: ValidatedActionFunction<S, T>) {
  return async (_prevState: ActionState, formData: FormData) => {
    const requestId = crypto.randomUUID();
    const logger = getLogger({ requestId, component: 'validatedAction' });
    try {
      const keysCount = Array.from(formData.keys()).length;
      // Compute a lightweight payload size estimate (redacts file contents)
      let payloadSize = 0;
      for (const [, v] of Array.from(formData.entries())) {
        if (typeof v === 'string') payloadSize += v.length;
        else if (v && typeof v === 'object' && 'size' in v && typeof (v as any).size === 'number') payloadSize += (v as any).size;
      }
      logger.info({ keys: keysCount, payloadSize }, 'validatedAction.start');

      const parseResult = schema.safeParse(Object.fromEntries(formData));
      if (!parseResult.success) {
        logger.warn({ issues: parseResult.error.errors.map((e) => ({ path: e.path, message: e.message })) }, 'validatedAction.validation_failed');
        return { error: parseResult.error.errors[0].message };
      }

      return await withLogContext({ requestId, component: 'validatedAction' }, async () => {
        return await action(parseResult.data, formData);
      });
    } catch (err) {
      const error = err as any;
      logger.error(
        {
          err: {
            name: error?.name,
            message: error?.message,
            digest: error?.digest,
            cause: error?.cause?.message,
            stack: error?.stack
          }
        },
        'validatedAction.unhandled_error'
      );
      if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
        throw error;
      }
      return { error: error instanceof Error ? error.message : 'An unexpected error. Please try again.' };
    }
  };
}

type ValidatedActionWithUserFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData,
  user: User
) => Promise<T>;

type ValidatedActionOptions = {
  requireActive?: boolean;
};

export function validatedActionWithUser<S extends z.ZodType<any, any>, T>(schema: S, action: ValidatedActionWithUserFunction<S, T>, options?: ValidatedActionOptions) {
  return async (_prevState: ActionState, formData: FormData) => {
    const requestId = crypto.randomUUID();
    const logger = getLogger({ requestId, component: 'validatedActionWithUser' });
    const requireActive = options?.requireActive ?? false;
    let user: User | null;
    try {
      user = requireActive ? await getActiveUser() : await getUser();
    } catch (error) {
      if (error instanceof InactiveTrialError) {
        logger.warn({ event: 'inactive_trial', message: (error as Error).message }, 'validatedActionWithUser.inactive');
        return { error: (error as Error).message };
      }
      logger.error({ err: error, message: 'validatedActionWithUser.getUser_failed' }, 'validatedActionWithUser.getUser_failed');
      throw error;
    }
    if (user == null) {
      logger.warn({ event: 'not_authenticated' }, 'validatedActionWithUser.no_user');
      throw new Error('User is not authenticated');
    }

    const parseResult = schema.safeParse(Object.fromEntries(formData));
    if (!parseResult.success) {
      logger.warn({ issues: parseResult.error.errors.map((e) => ({ path: e.path, message: e.message })) }, 'validatedActionWithUser.validation_failed');
      return { error: parseResult.error.errors[0].message };
    }

    try {
      return await withLogContext({ requestId, component: 'validatedActionWithUser', userId: String(user.id) }, async () => {
        return await action(parseResult.data, formData, user as User);
      });
    } catch (err) {
      const error = err as any;
      logger.error({ err: { name: error?.name, message: error?.message, digest: error?.digest, stack: error?.stack } }, 'validatedActionWithUser.unhandled_error');
      if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
        throw error;
      }
      return { error: error instanceof Error ? error.message : 'An unexpected error. Please try again.' };
    }
  };
}

type ActionWithTeamFunction<T> = (formData: FormData, team: TeamDataWithMembers) => Promise<T>;

type TeamActionOptions = {
  requireActive?: boolean;
};

export function withTeam<T>(action: ActionWithTeamFunction<T>, options?: TeamActionOptions) {
  return async (formData: FormData): Promise<T> => {
    const requireActive = options?.requireActive ?? true;
    let user: User | null;
    try {
      user = requireActive ? await getActiveUser() : await getUser();
    } catch (error) {
      throw error;
    }
    if (user == null) {
      redirect('/sign-in');
    }
    const team = await getTeamForUser();
    if (team == null) {
      throw new Error('Team not found');
    }
    return action(formData, team);
  };
}
