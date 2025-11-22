import { z } from 'zod';
import { TeamDataWithMembers, User } from '@/lib/db/schema';
import { InactiveTrialError, getActiveUser, getTeamForUser, getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';

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
    try {
      console.log('[validatedAction] start keys count:', Array.from(formData.keys()).length);
      const result = schema.safeParse(Object.fromEntries(formData));
      if (result.success !== true) {
        console.error('[validatedAction] validation failed');
        return { error: result.error.errors[0].message };
      }
      return await action(result.data, formData);
    } catch (error) {
      console.error('[validatedAction] Error:', error);
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
    const requireActive = options?.requireActive ?? false;
    let user: User | null;
    try {
      user = requireActive ? await getActiveUser() : await getUser();
    } catch (error) {
      if (error instanceof InactiveTrialError) {
        return { error: error.message };
      }
      throw error;
    }
    if (user == null) {
      throw new Error('User is not authenticated');
    }
    const result = schema.safeParse(Object.fromEntries(formData));
    if (result.success !== true) {
      return { error: result.error.errors[0].message };
    }
    return action(result.data, formData, user);
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
