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

export function validatedAction<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionFunction<S, T>
) {
  return async (prevState: ActionState, formData: FormData) => {
    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return { error: result.error.errors[0].message };
    }

    return action(result.data, formData);
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

export function validatedActionWithUser<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionWithUserFunction<S, T>,
  options?: ValidatedActionOptions
) {
  return async (prevState: ActionState, formData: FormData) => {
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

    if (!user) {
      throw new Error('User is not authenticated');
    }

    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
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

    if (!user) {
      redirect('/sign-in');
    }

    const team = await getTeamForUser();
    if (!team) {
      throw new Error('Team not found');
    }

    return action(formData, team);
  };
}
