import { redirect } from 'next/navigation';

type LegacySequencePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LegacySequencePage(props: LegacySequencePageProps) {
  const { id } = await props.params;
  redirect(`/sequences/${id}/edit`);
}
