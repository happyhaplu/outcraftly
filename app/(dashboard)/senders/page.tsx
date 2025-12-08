import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sender Accounts | Outcraftly',
  description: 'Monitor and manage your email sender accounts to maintain optimal deliverability.'
};

import { SenderForm } from './sender-form';
import { SenderList } from './sender-list';
import { getSendersForTeam, getTeamForUser } from '@/lib/db/queries';

export default async function SendersPage() {
  const team = await getTeamForUser();
  const senders = team ? await getSendersForTeam(team.id) : [];

  return (
    <section className="space-y-8 animate-fade-in">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary/80">
          Deliverability
        </p>
        <h1 className="text-3xl font-bold text-foreground">Sender accounts</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Keep emails landing in the inbox by monitoring connection health and credentials for every sending account in your workspace.
        </p>
      </header>

      {team ? (
        <>
          <Card className="transition-shadow hover:shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Add sender email</CardTitle>
              <CardDescription>
                Connect a new SMTP mailbox. We’ll verify the credentials instantly and keep them encrypted at rest.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SenderForm />
            </CardContent>
          </Card>

          <Card className="transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold">Sender list</CardTitle>
                <CardDescription>
                  Review every connected sender along with SMTP details and status.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SenderList initialSenders={senders} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-dashed border-primary/40 bg-primary/5 text-center">
          <CardContent className="space-y-4 py-12">
            <h2 className="text-xl font-semibold text-foreground">No workspace detected</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Join or create a workspace to start adding sender accounts.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
