import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const senderAccounts = [
  {
    id: '1',
    name: 'Sales Team',
    email: 'sales@outcraftly.com',
    provider: 'Gmail',
    status: 'active',
    dailyLimit: 500,
    sentToday: 234
  },
  {
    id: '2',
    name: 'Outreach Team',
    email: 'outreach@outcraftly.com',
    provider: 'Outlook',
    status: 'active',
    dailyLimit: 500,
    sentToday: 189
  },
  {
    id: '3',
    name: 'Marketing',
    email: 'marketing@outcraftly.com',
    provider: 'Custom SMTP',
    status: 'needs attention',
    dailyLimit: 1000,
    sentToday: 0
  }
];

const statusClasses: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  'needs attention': 'bg-amber-100 text-amber-700'
};

export default function SendersPage() {
  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">Deliverability</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Sender accounts</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keep emails landing in the inbox by monitoring daily limits and connection health for every sending account in your workspace.
        </p>
      </header>

      <Card className="border-primary/10">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl">Active senders</CardTitle>
            <CardDescription>
              Toggle individual mailboxes, review sending volume, and address connection issues before they impact campaigns.
            </CardDescription>
          </div>
          <Button>Add sender</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {senderAccounts.map((sender) => (
            <div
              key={sender.id}
              className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">{sender.name}</p>
                <p className="truncate text-sm text-muted-foreground">{sender.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{sender.provider}</span>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    statusClasses[sender.status] || statusClasses.inactive
                  }`}
                >
                  {sender.status}
                </span>
                <dl className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="uppercase tracking-wide">Daily limit</dt>
                    <dd className="text-sm font-semibold text-foreground">{sender.dailyLimit}</dd>
                  </div>
                  <div className="h-6 w-px bg-border/60" aria-hidden />
                  <div>
                    <dt className="uppercase tracking-wide">Sent today</dt>
                    <dd className="text-sm font-semibold text-foreground">{sender.sentToday}</dd>
                  </div>
                </dl>
                <Button variant="outline" size="sm">
                  Manage
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
