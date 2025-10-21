import { notFound, redirect } from 'next/navigation';

import { getSequenceWithSteps, getTeamForUser } from '@/lib/db/queries';
import { sequenceIdSchema } from '@/lib/validation/sequence';

import { SequenceEditor } from './SequenceEditor';
import { normaliseTimestamp } from '../utils';
import type { SequenceDetail } from '../types';

type SequenceEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SequenceEditPage(props: SequenceEditPageProps) {
  const { id } = await props.params;

  const parsed = sequenceIdSchema.safeParse({ id });
  if (!parsed.success) {
    notFound();
  }

  const team = await getTeamForUser();
  if (!team) {
    redirect('/sequences');
  }

  const sequence = await getSequenceWithSteps(team.id, parsed.data.id);
  if (!sequence) {
    notFound();
  }

  const initialSequence: SequenceDetail = {
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
    steps: (sequence.steps ?? []).map((step) => ({
      id: step.id,
      subject: step.subject,
      body: step.body,
      delayHours: step.delayHours ?? 0,
      order: step.order ?? 0
    }))
  };

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">Automation</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Edit sequence</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Update messaging, personalise tokens, and fine-tune delays before launching your outreach.
        </p>
      </header>

      <SequenceEditor sequenceId={initialSequence.id} initialSequence={initialSequence} />
    </section>
  );
}
