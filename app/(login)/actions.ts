'use server';

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  teams,
  teamMembers,
  activityLogs,
  type NewUser,
  type NewTeam,
  type NewTeamMember,
  type NewActivityLog,
  ActivityType,
  invitations
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createCheckoutSession } from '@/lib/payments/stripe';
import { calculateTrialExpiry, getUser, getUserWithTeam } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || ''
  };
  await db.insert(activityLogs).values(newActivity);
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
});

async function fetchUserWithTeam(email: string) {
  try {
    console.log('[fetchUserWithTeam] Querying database for email:', email);
    const rows = await db
      .select({
        user: users,
        team: {
          id: teams.id,
          name: teams.name,
          createdAt: teams.createdAt,
          updatedAt: teams.updatedAt,
          planName: teams.planName,
          subscriptionStatus: teams.subscriptionStatus,
          stripeCustomerId: teams.stripeCustomerId,
          stripeSubscriptionId: teams.stripeSubscriptionId,
          stripeProductId: teams.stripeProductId
        }
      })
      .from(users)
      .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
      .leftJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(users.email, email))
      .limit(1);

    console.log('[fetchUserWithTeam] Query returned', rows.length, 'rows');

    if (rows.length === 0) {
      return null;
    }

    const [{ user, team }] = rows;
    console.log('[fetchUserWithTeam] Found user ID:', user.id, 'with team:', team?.id || 'none');
    return {
      user,
      team: team && team.id !== null ? { ...team, paymentStatus: 'unpaid' as const } : null
    };
  } catch (error) {
    console.error('[fetchUserWithTeam] Database query error:', error);
    console.error('[fetchUserWithTeam] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error?.constructor?.name
    });
    throw error; // Re-throw to be caught by signIn handler
  }
}

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  try {
    console.log('[signIn] Starting sign-in process for email:', data.email);
    const { email, password } = data;

    console.log('[signIn] Fetching user with team from database');
    const row = await fetchUserWithTeam(email);

    if (!row) {
      console.log('[signIn] User not found in database');
      return {
        error: 'Invalid email or password. Please try again.',
        email,
        password
      };
    }

    const { user: foundUser, team: foundTeam } = row;
    console.log('[signIn] User found, ID:', foundUser.id, 'Team:', foundTeam?.id || 'none');

    console.log('[signIn] Verifying password');
    const isPasswordValid = await comparePasswords(
      password,
      foundUser.passwordHash
    );

    if (!isPasswordValid) {
      console.log('[signIn] Invalid password for user:', foundUser.id);
      return {
        error: 'Invalid email or password. Please try again.',
        email,
        password
      };
    }

    console.log('[signIn] Password valid, setting session and logging activity');
    await Promise.all([
      setSession(foundUser),
      logActivity(foundTeam?.id, foundUser.id, ActivityType.SIGN_IN)
    ]);

    const redirectTo = formData.get('redirect') as string | null;
    if (redirectTo === 'checkout') {
      const priceId = formData.get('priceId') as string;
      console.log('[signIn] Redirecting to checkout with priceId:', priceId);
      return createCheckoutSession({ team: foundTeam, priceId });
    }

    console.log('[signIn] Sign-in successful, redirecting to dashboard');
    redirect('/dashboard');
  } catch (error) {
    console.error('[signIn] Fatal error during sign-in:', error);
    console.error('[signIn] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[signIn] Error type:', error?.constructor?.name);
    
    // Re-throw redirect errors (these are expected behavior in Next.js)
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error;
    }
    
    // Return user-friendly error for all other cases
    return {
      error: 'An error occurred during sign-in. Please try again or contact support if the problem persists.',
      email: data.email,
      password: ''
    };
  }
});

const signUpSchema = z
  .object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    inviteId: z
      .string()
      .optional()
      .transform((val) => (val && val.length > 0 ? val : undefined))
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { name, email, password, inviteId } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: 'Failed to create user. Please try again.',
      name,
      email,
      password,
      confirmPassword: ''
    };
  }

  const passwordHash = await hashPassword(password);

  const signupDate = new Date();
  const newUser: NewUser = {
    name,
    email,
    passwordHash,
    role: 'user', // Default global role; team ownership handled via invitations
    signupDate,
    trialExpiresAt: calculateTrialExpiry(signupDate),
    status: 'active'
  };

  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: 'Failed to create user. Please try again.',
      name,
      email,
      password,
      confirmPassword: ''
    };
  }

  let teamId: number;
  let userRole: string;
  let createdTeam: typeof teams.$inferSelect | null = null;

  if (inviteId) {
    // Check if there's a valid invitation
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, parseInt(inviteId)),
          eq(invitations.email, email),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    if (invitation) {
      teamId = invitation.teamId;
      userRole = invitation.role;

      await db
        .update(invitations)
        .set({ status: 'accepted' })
        .where(eq(invitations.id, invitation.id));

      await logActivity(teamId, createdUser.id, ActivityType.ACCEPT_INVITATION);

      [createdTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
    } else {
      return {
        error: 'Invalid or expired invitation.',
        name,
        email,
        password,
        confirmPassword: ''
      };
    }
  } else {
    // Create a new team if there's no invitation
    const newTeam: NewTeam = {
      name: `${email}'s Team`,
      planName: 'Starter'
    };

    [createdTeam] = await db.insert(teams).values(newTeam).returning();

    if (!createdTeam) {
      return {
        error: 'Failed to create team. Please try again.',
        name,
        email,
        password,
        confirmPassword: ''
      };
    }

    teamId = createdTeam.id;
    userRole = 'owner';

    await logActivity(teamId, createdUser.id, ActivityType.CREATE_TEAM);
  }

  const newTeamMember: NewTeamMember = {
    userId: createdUser.id,
    teamId: teamId,
    role: userRole
  };

  await Promise.all([
    db.insert(teamMembers).values(newTeamMember),
    logActivity(teamId, createdUser.id, ActivityType.SIGN_UP),
    setSession(createdUser)
  ]);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: createdTeam, priceId });
  }

  redirect('/dashboard');
});

export async function signOut() {
  const user = (await getUser()) as User;
  const userWithTeam = await getUserWithTeam(user.id);
  await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  (await cookies()).delete('session');
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Current password is incorrect.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password must be different from the current password.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation password do not match.'
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD)
    ]);

    return {
      success: 'Password updated successfully.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Incorrect password. Account deletion failed.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

    // Soft delete
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')` // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));

    if (userWithTeam?.teamId) {
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, user.id),
            eq(teamMembers.teamId, userWithTeam.teamId)
          )
        );
    }

    (await cookies()).delete('session');
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address')
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, success: 'Account updated successfully.' };
  }
);

const removeTeamMemberSchema = z.object({
  memberId: z.number()
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.teamId, userWithTeam.teamId)
        )
      );

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.REMOVE_TEAM_MEMBER
    );

    return { success: 'Team member removed successfully' };
  },
  { requireActive: true }
);

const inviteTeamMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['member', 'owner'])
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    const existingMember = await db
      .select()
      .from(users)
      .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
      .where(
        and(eq(users.email, email), eq(teamMembers.teamId, userWithTeam.teamId))
      )
      .limit(1);

    if (existingMember.length > 0) {
      return { error: 'User is already a member of this team' };
    }

    // Check if there's an existing invitation
    const existingInvitation = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.teamId, userWithTeam.teamId),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    if (existingInvitation.length > 0) {
      return { error: 'An invitation has already been sent to this email' };
    }

    // Create a new invitation
    await db.insert(invitations).values({
      teamId: userWithTeam.teamId,
      email,
      role,
      invitedBy: user.id,
      status: 'pending'
    });

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.INVITE_TEAM_MEMBER
    );

    // TODO: Send invitation email and include ?inviteId={id} to sign-up URL
    // await sendInvitationEmail(email, userWithTeam.team.name, role)

    return { success: 'Invitation sent successfully' };
  },
  { requireActive: true }
);
