import { Card, CardContent } from '@/components/ui/card';

import { ContactList } from './contact-list';
import { getContactsForTeam, getTeamForUser } from '@/lib/db/queries';
import { ContactActions } from './contact-actions';

export default async function ContactsPage() {
  const team = await getTeamForUser();
  const contacts = team ? await getContactsForTeam(team.id) : [];

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">People</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Contacts</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keep every contact organised with intelligent segments and quick filters designed for outbound teams.
        </p>
      </header>

      {team ? (
        <div className="space-y-8">
          <ContactActions />
          <ContactList
            initialContacts={contacts.map((contact) => ({
              id: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              company: contact.company,
              tags: contact.tags ?? [],
              createdAt:
                contact.createdAt instanceof Date
                  ? contact.createdAt.toISOString()
                  : new Date(contact.createdAt).toISOString()
            }))}
          />
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
