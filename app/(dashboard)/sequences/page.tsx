import { Card, CardContent } from '@/components/ui/card';

import { listSequencesForTeam, getTeamForUser } from '@/lib/db/queries';

import { SequenceDashboard } from './SequenceDashboard';
import { SequenceSummary } from './types';
import { normaliseTimestamp } from './utils';

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
  const summaries: SequenceSummary[] = sequences.map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    status: sequence.status,
    createdAt: normaliseTimestamp(sequence.createdAt),
    updatedAt: normaliseTimestamp(sequence.updatedAt),
    senderId: sequence.senderId ?? null,
    sender: sequence.sender && sequence.sender.id
      ? {
          id: sequence.sender.id,
          name: sequence.sender.name,
          email: sequence.sender.email,
          status: sequence.sender.status
        }
      : null,
    stepCount: Number(sequence.stepCount ?? 0)
  }));

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">Automation</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Sequences</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Create multi-step cadences, tune delays, and personalise every touchpoint before you hit launch.
        </p>
      </header>

      <SequenceDashboard initialSequences={summaries} />
    </section>
  );
}
