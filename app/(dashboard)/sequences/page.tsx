import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const activeSequences = [
  {
    id: 'product-launch',
    name: 'Q4 product launch',
    status: 'Active',
    steps: 5,
    replyRate: '24.1%',
    sent: 2341,
    updatedAt: '2 days ago'
  },
  {
    id: 'founder-outreach',
    name: 'Founder outreach',
    status: 'Running',
    steps: 4,
    replyRate: '18.4%',
    sent: 1567,
    updatedAt: '4 hours ago'
  },
  {
    id: 'follow-up',
    name: 'Post-demo follow-ups',
    status: 'Paused',
    steps: 3,
    replyRate: '32.5%',
    sent: 623,
    updatedAt: 'Yesterday'
  }
];

const statusPalette: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Running: 'bg-blue-100 text-blue-700',
  Paused: 'bg-amber-100 text-amber-700'
};

export default function SequencesPage() {
  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">Automation</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Sequences</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Launch, analyse, and iterate on cold outreach flows with versioning baked in.
        </p>
      </header>

      <Card className="border-primary/10">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl">Active sequences</CardTitle>
            <CardDescription>
              Track performance metrics for every automation touchpoint and spot what needs a refresh fast.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Import steps</Button>
            <Button>New sequence</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeSequences.map((sequence) => (
            <div
              key={sequence.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{sequence.name}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Updated {sequence.updatedAt}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    statusPalette[sequence.status] || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {sequence.status}
                </span>
                <div>
                  <p className="text-muted-foreground">Steps</p>
                  <p className="text-lg font-semibold text-foreground">{sequence.steps}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Reply rate</p>
                  <p className="text-lg font-semibold text-foreground">{sequence.replyRate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Emails sent</p>
                  <p className="text-lg font-semibold text-foreground">{sequence.sent.toLocaleString()}</p>
                </div>
                <Button variant="outline" size="sm">
                  View performance
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
