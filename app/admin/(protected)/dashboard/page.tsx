import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary/70">
          Welcome Admin
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">
          Hello, {admin.name || admin.email}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Use the navigation to review user accounts, manage billing, and monitor platform health. Add
          cards or metrics here as the dashboard evolves.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card/80 p-6 shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground">Active Users</p>
          <p className="mt-4 text-2xl font-semibold text-foreground">Coming soon</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/80 p-6 shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground">Recent Activity</p>
          <p className="mt-4 text-2xl font-semibold text-foreground">Coming soon</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/80 p-6 shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground">System Health</p>
          <p className="mt-4 text-2xl font-semibold text-foreground">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
