import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  senders,
  teamMembers,
  teams,
  users,
  type SenderStatus
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getTeamByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  return result?.team || null;
}

export async function getSendersForTeam(teamId: number) {
  return await db
    .select()
    .from(senders)
    .where(eq(senders.teamId, teamId))
    .orderBy(desc(senders.createdAt));
}

export async function findSenderByEmail(teamId: number, email: string) {
  const result = await db
    .select()
    .from(senders)
    .where(and(eq(senders.teamId, teamId), eq(senders.email, email)))
    .limit(1);

  return result[0] || null;
}

export async function getSenderForTeam(teamId: number, senderId: number) {
  return await db
    .select()
    .from(senders)
    .where(and(eq(senders.teamId, teamId), eq(senders.id, senderId)))
    .limit(1)
    .then((rows) => rows[0] || null);
}

export async function updateSenderStatus(
  teamId: number,
  senderId: number,
  status: SenderStatus
) {
  const [updated] = await db
    .update(senders)
    .set({ status })
    .where(and(eq(senders.id, senderId), eq(senders.teamId, teamId)))
    .returning();

  return updated || null;
}

export async function deleteSender(teamId: number, senderId: number) {
  await db
    .delete(senders)
    .where(and(eq(senders.id, senderId), eq(senders.teamId, teamId)));
}

export async function addSender(
  teamId: number,
  data: {
    name: string;
    email: string;
    host: string;
    port: number;
    username: string;
    password: string;
    status?: string;
  }
) {
  const [inserted] = await db
    .insert(senders)
    .values({
      teamId,
      name: data.name,
      email: data.email,
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
      status: data.status ?? 'active'
    })
    .returning();

  return inserted;
}
