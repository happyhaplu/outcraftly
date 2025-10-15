import { desc, and, eq, isNull, inArray, sql } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  senders,
  teamMembers,
  teams,
  users,
  contacts,
  type SenderStatus
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { normalizeTags } from '@/lib/validation/contact';

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

export type ContactFilters = {
  search?: string;
  tag?: string;
};

export async function getContactsForTeam(teamId: number, filters: ContactFilters = {}) {
  const conditions = [eq(contacts.teamId, teamId)];

  if (filters.search) {
    const searchTerm = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(
        lower(${contacts.firstName}) LIKE ${searchTerm} OR
        lower(${contacts.lastName}) LIKE ${searchTerm} OR
        lower(${contacts.email}) LIKE ${searchTerm} OR
        lower(${contacts.company}) LIKE ${searchTerm}
      )`
    );
  }

  if (filters.tag) {
    const tagValue = filters.tag.trim();
    if (tagValue.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(${contacts.tags}) AS tag
          WHERE lower(tag) = lower(${tagValue})
        )`
      );
    }
  }

  const whereCondition = conditions.length > 1 ? and(...conditions) : conditions[0];

  return await db
    .select()
    .from(contacts)
    .where(whereCondition)
    .orderBy(desc(contacts.createdAt));
}

export async function updateContact(
  teamId: number,
  contactId: string,
  data: {
    firstName?: string;
    lastName?: string;
    company?: string;
    tags?: string[];
  }
) {
  const updatePayload: Partial<{
    firstName: string;
    lastName: string;
    company: string;
    tags: string[];
  }> = {};

  if (typeof data.firstName === 'string') {
    updatePayload.firstName = data.firstName;
  }
  if (typeof data.lastName === 'string') {
    updatePayload.lastName = data.lastName;
  }
  if (typeof data.company === 'string') {
    updatePayload.company = data.company;
  }
  if (Array.isArray(data.tags)) {
    updatePayload.tags = data.tags;
  }

  if (Object.keys(updatePayload).length === 0) {
    return null;
  }

  const [updated] = await db
    .update(contacts)
    .set(updatePayload)
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .returning();

  return updated ?? null;
}

export async function deleteContact(teamId: number, contactId: string) {
  const result = await db
    .delete(contacts)
    .where(and(eq(contacts.teamId, teamId), eq(contacts.id, contactId)))
    .returning({ id: contacts.id });

  return result.length;
}

export async function bulkDeleteContacts(teamId: number, contactIds: string[]) {
  if (contactIds.length === 0) {
    return 0;
  }

  const result = await db
    .delete(contacts)
    .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, contactIds)))
    .returning({ id: contacts.id });

  return result.length;
}

export async function addTagsToContacts(
  teamId: number,
  contactIds: string[],
  tags: string[]
) {
  if (contactIds.length === 0) {
    return { updated: 0, applied: 0 } as const;
  }

  const tagsToAdd = normalizeTags(tags);
  if (tagsToAdd.length === 0) {
    return { updated: 0, applied: 0 } as const;
  }

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: contacts.id, tags: contacts.tags })
      .from(contacts)
      .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, contactIds)));

    if (existing.length === 0) {
      return { updated: 0, applied: 0 } as const;
    }

    let updated = 0;
    let applied = 0;

    for (const contact of existing) {
      const currentTags = Array.isArray(contact.tags)
        ? contact.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];

      const seen = new Set<string>();
      currentTags.forEach((tag) => {
        if (typeof tag === 'string') {
          const normalised = tag.trim().toLowerCase();
          if (normalised.length > 0) {
            seen.add(normalised);
          }
        }
      });

      const newTags: string[] = [];
      for (const tag of tagsToAdd) {
        const trimmed = tag.trim();
        if (!trimmed) {
          continue;
        }
        const key = trimmed.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        newTags.push(trimmed);
      }

      if (newTags.length === 0) {
        continue;
      }

      await tx
        .update(contacts)
        .set({ tags: [...currentTags, ...newTags] })
        .where(and(eq(contacts.id, contact.id), eq(contacts.teamId, teamId)));

      updated += 1;
      applied += newTags.length;
    }

    return { updated, applied } as const;
  });
}
export async function insertContacts(
  teamId: number,
  rows: Array<{
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    tags: string[];
  }>
) {
  if (rows.length === 0) {
    return 0;
  }

  const result = await db
    .insert(contacts)
    .values(
      rows.map((row) => ({
        teamId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        company: row.company,
        tags: row.tags
      }))
    )
    .onConflictDoNothing({
      target: [contacts.teamId, contacts.email]
    })
    .returning({ id: contacts.id });

  return result.length;
}

export async function getDistinctContactTags(teamId: number) {
  const result = await db.execute<{ tag: string | null }>(sql`
    SELECT DISTINCT NULLIF(trim(tag), '') AS tag
    FROM contacts, jsonb_array_elements_text(contacts.tags) AS tag
    WHERE contacts.team_id = ${teamId}
    ORDER BY tag ASC
  `);

  return Array.from(result)
    .map((row) => row.tag)
    .filter((tag): tag is string => Boolean(tag));
}

export async function updateContactForTeam(
  teamId: number,
  contactId: string,
  data: {
    firstName: string;
    lastName: string;
    company: string;
    tags: string[];
  }
) {
  const [updated] = await db
    .update(contacts)
    .set({
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      tags: data.tags
    })
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .returning();

  return updated || null;
}

export async function deleteContactForTeam(teamId: number, contactId: string) {
  const [deleted] = await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .returning({ id: contacts.id });

  return deleted ?? null;
}

export async function bulkDeleteContactsForTeam(teamId: number, contactIds: string[]) {
  if (contactIds.length === 0) {
    return 0;
  }

  const deleted = await db
    .delete(contacts)
    .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, contactIds)))
    .returning({ id: contacts.id });

  return deleted.length;
}
