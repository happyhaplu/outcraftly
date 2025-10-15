import { NextResponse } from 'next/server';

import { getContactsForTeam, getTeamForUser, getUser } from '@/lib/db/queries';

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? undefined;
  const tag = url.searchParams.get('tag') ?? undefined;

  const contacts = await getContactsForTeam(team.id, {
    search: search?.trim() || undefined,
    tag: tag?.trim() || undefined
  });

  return NextResponse.json({
    contacts: contacts.map((contact) => ({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      company: contact.company,
      tags: contact.tags ?? [],
      createdAt: contact.createdAt
    }))
  });
}
