import { Card, CardContent } from '@/components/ui/card';
import { Suspense } from 'react';

import { ContactList } from './contact-list';
import { getPaginatedContactsForTeam, getTeamForUser } from '@/lib/db/queries';
import { ContactActions } from './contact-actions';

export default async function ContactsPage() {
  const team = await getTeamForUser();
  const paginatedContacts = team
    ? await getPaginatedContactsForTeam(team.id, {
        page: 1,
        limit: 20
      })
    : null;

  const initialPage = paginatedContacts
    ? {
        data: paginatedContacts.data.map((contact) => ({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          company: contact.company,
          jobTitle: contact.jobTitle ?? null,
          tags: Array.isArray(contact.tags) ? contact.tags : [],
          createdAt:
            contact.createdAt instanceof Date
              ? contact.createdAt.toISOString()
              : new Date(contact.createdAt).toISOString()
        })),
        total: paginatedContacts.total,
        page: paginatedContacts.page,
        totalPages: paginatedContacts.totalPages
      }
    : null;

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">People</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Contacts</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keep every contact organised with intelligent segments and quick filters designed for outbound teams.
        </p>
      </header>

      {team && initialPage ? (
        <div className="space-y-8">
          <ContactActions />
          <Suspense fallback={<div>Loading contacts...</div>}>
            <ContactList initialPage={initialPage} />
          </Suspense>
        </div>
      ) : (
        <Card className="border-dashed border-primary/40 bg-primary/5 text-center">
          <CardContent className="space-y-4 py-12">
            <h2 className="text-xl font-semibold text-foreground">No workspace detected</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Join or create a workspace to start managing contacts.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
