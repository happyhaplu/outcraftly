import { NextResponse } from 'next/server';

import { getContactsForTeam, getTeamForUser, getUser } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
  }

  const contacts = await getContactsForTeam(team.id);

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
