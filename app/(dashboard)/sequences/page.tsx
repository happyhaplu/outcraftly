import { Card, CardContent } from '@/components/ui/card';
import type { Metadata } from 'next';

import { listSequencesForTeam, getTeamForUser } from '@/lib/db/queries';

export const metadata: Metadata = {
  title: 'Sequences | Outcraftly',
  description: 'Create and manage automated email sequences for your cold outreach campaigns.'
};

import { mapSequenceSummary, type RawSequence } from '@/lib/sequences/utils';

import { SequenceOverview } from './SequenceOverview';
import type { SequenceSummary } from './types';

export default async function SequencesPage() {
  const team = await getTeamForUser();

  if (!team) {
    return (
      <section className="space-y-8">
        <header>
          <p className="text-sm uppercase tracking-wide text-primary/80">Automation</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">Sequences</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Launch, analyse, and iterate on cold outreach flows with versioning baked in.
          </p>
        </header>

        <Card className="border-dashed border-primary/40 bg-primary/5 text-center">
          <CardContent className="space-y-4 py-12">
            <h2 className="text-xl font-semibold text-foreground">No workspace detected</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Join or create a workspace to start building automated outreach sequences.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const sequences = await listSequencesForTeam(team.id);
  const summaries: SequenceSummary[] = sequences
    .map((sequence) => mapSequenceSummary(sequence as RawSequence))
    .filter((sequence) => !sequence.deletedAt);

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">Automation</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Sequences</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Create multi-step cadences, tune delays, and personalise every touchpoint before you hit launch.
        </p>
      </header>
      <SequenceOverview initialSequences={summaries} />
    </section>
  );
}
