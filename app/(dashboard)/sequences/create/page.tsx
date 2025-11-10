import { redirect } from 'next/navigation';

import { getTeamForUser } from '@/lib/db/queries';

import { SequenceCreateShell } from './SequenceCreateShell';

export default async function SequenceCreatePage() {
  const team = await getTeamForUser();
  if (!team) {
    redirect('/sequences');
  }

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">Automation</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Create sequence</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Build your cadence from scratch, personalise each step, and assign a sender before launching outreach.
        </p>
      </header>

      <SequenceCreateShell />
    </section>
  );
}
