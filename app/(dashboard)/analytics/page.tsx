import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const metrics = [
  {
    id: 'sent',
    label: 'Total sent',
    value: '12,453',
    change: '+12.5%',
    caption: 'vs last month',
    tone: 'positive'
  },
  {
    id: 'open-rate',
    label: 'Open rate',
    value: '68.3%',
    change: '+4.2%',
    caption: 'vs last month',
    tone: 'positive'
  },
  {
    id: 'reply-rate',
    label: 'Reply rate',
    value: '24.1%',
    change: '-2.1%',
    caption: 'vs last month',
    tone: 'negative'
  },
  {
    id: 'active-contacts',
    label: 'Active contacts',
    value: '3,821',
    change: '+18.7%',
    caption: 'vs last month',
    tone: 'positive'
  }
];

const tonePalette: Record<string, string> = {
  positive: 'text-emerald-700 bg-emerald-100',
  negative: 'text-rose-700 bg-rose-100',
  neutral: 'text-slate-600 bg-slate-100'
};

export default function AnalyticsPage() {
  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-primary/80">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Analytics</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Understand performance across every step of your outbound pipeline with friendly, ready-to-share dashboards.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.id} className="border-primary/10">
            <CardHeader className="pb-3">
              <CardDescription className="uppercase tracking-wide text-xs">
                {metric.label}
              </CardDescription>
              <CardTitle className="text-3xl font-semibold text-foreground">
                {metric.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  tonePalette[metric.tone] || tonePalette.neutral
                }`}
              >
                {metric.change}
              </span>
              <p className="mt-2 text-xs text-muted-foreground">{metric.caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle className="text-xl">Recent campaigns</CardTitle>
          <CardDescription>
            A quick snapshot of how your latest plays are performing as they move through the ladder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {["Q4 Product Launch", "Black Friday Promo", "Customer Feedback"].map((campaign, index) => (
            <div
              key={campaign}
              className="rounded-xl border border-border/60 bg-background p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{campaign}</p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {index === 0 ? 'Active' : index === 1 ? 'Scheduled' : 'Completed'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Sent 2,341 emails · 1,876 opened · 423 replied
              </p>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${60 - index * 12}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
