import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const contactSegments = [
  {
    id: 'prospects',
    name: 'High intent prospects',
    total: 1286,
    change: '+8.3% vs last month',
    description: 'Leads who engaged with the last two campaigns.'
  },
  {
    id: 'warm-leads',
    name: 'Warm leads',
    total: 842,
    change: '+4.1% vs last month',
    description: 'Responses that requested pricing or a follow-up call.'
  },
  {
    id: 'nurture',
    name: 'Nurture sequence',
    total: 2154,
    change: '-1.2% vs last month',
    description: 'Contacts still warming up after the first outreach attempt.'
  }
];

export default function ContactsPage() {
  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">People</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Contacts</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keep every contact organised with intelligent segments and quick filters designed for outbound teams.
        </p>
      </header>

      <Card className="border-primary/10">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl">Smart segments</CardTitle>
            <CardDescription>
              Launch a targeted campaign or export enriched data to your CRM in a single click.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Import CSV</Button>
            <Button>Create segment</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {contactSegments.map((segment) => (
            <div
              key={segment.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{segment.name}</p>
                <p className="text-sm text-muted-foreground">{segment.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total contacts</p>
                  <p className="text-lg font-semibold text-foreground">{segment.total.toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {segment.change}
                </span>
                <Button variant="outline" size="sm">
                  View details
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
