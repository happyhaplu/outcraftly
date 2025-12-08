import Link from "next/link";
import type { Metadata } from 'next';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Mail,
  Send,
  Target,
  Users
} from "lucide-react";

export const metadata: Metadata = {
  title: 'Dashboard | Outcraftly',
  description: 'View your email campaign performance, sequence analytics, and workspace activity.'
};

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getTeamForUser, getTeamUsageSummary, getUser } from "@/lib/db/queries";
import {
  DEFAULT_PLAN_USAGE_LIMITS,
  DEFAULT_USER_PLAN,
  type UserPlan
} from "@/lib/config/plans";
import { logger } from "@/lib/logger";

const stats = [
  {
    title: "Total Sent",
    value: "12,453",
    change: "+12.5%",
    trend: "up" as const,
    icon: Send
  },
  {
    title: "Open Rate",
    value: "68.3%",
    change: "+4.2%",
    trend: "up" as const,
    icon: Mail
  },
  {
    title: "Reply Rate",
    value: "24.1%",
    change: "-2.1%",
    trend: "down" as const,
    icon: Target
  },
  {
    title: "Active Contacts",
    value: "3,821",
    change: "+18.7%",
    trend: "up" as const,
    icon: Users
  }
];

const recentCampaigns = [
  {
    name: "Q4 Product Launch",
    status: "active" as const,
    sent: 2341,
    opened: 1876,
    replied: 423,
    progress: 65
  },
  {
    name: "Black Friday Promo",
    status: "scheduled" as const,
    sent: 0,
    opened: 0,
    replied: 0,
    progress: 0
  },
  {
    name: "Customer Feedback",
    status: "completed" as const,
    sent: 5432,
    opened: 4123,
    replied: 892,
    progress: 100
  }
];

const quickActions = [
  {
    title: "Create Sequence",
    description: "Start a new email sequence campaign",
    href: "/sequences",
    icon: Mail
  },
  {
    title: "Import Contacts",
    description: "Upload CSV files with new contacts",
    href: "/contacts",
    icon: Users
  },
  {
    title: "View Analytics",
    description: "Detailed insights and reports",
    href: "/analytics",
    icon: BarChart3
  }
];

export default async function DashboardPage() {
  try {
    logger.info({ component: 'Dashboard' }, 'Starting page load');
    const [user, team] = await Promise.all([getUser(), getTeamForUser()]);
    logger.info({ component: 'Dashboard', userId: user?.id, teamId: team?.id }, 'Got user and team');
    const usageSummary = team ? await getTeamUsageSummary(team.id) : null;
    logger.info({ component: 'Dashboard' }, 'Got usage summary');

  const rawPlan = usageSummary?.plan ?? user?.plan ?? DEFAULT_USER_PLAN;
  const planNames = Object.keys(DEFAULT_PLAN_USAGE_LIMITS) as UserPlan[];
  const currentPlan: UserPlan = planNames.includes(rawPlan as UserPlan)
    ? (rawPlan as UserPlan)
    : DEFAULT_USER_PLAN;
  const planLimits = usageSummary?.limits ??
    DEFAULT_PLAN_USAGE_LIMITS[currentPlan] ??
    DEFAULT_PLAN_USAGE_LIMITS[DEFAULT_USER_PLAN];

  const planSummary = [
    { label: "Prospects", value: planLimits.prospects.toLocaleString() },
    { label: "Emails / month", value: planLimits.emailsPerMonth.toLocaleString() },
    { label: "AI credits", value: planLimits.credits.toLocaleString() }
  ];

  const usageMetrics = usageSummary
    ? [
        {
          label: "Prospects",
          used: usageSummary.prospects.used,
          limit: usageSummary.prospects.limit,
          helper: "Total contacts across your workspace."
        },
        {
          label: "Emails (this month)",
          used: usageSummary.emails.used,
          limit: usageSummary.emails.limit,
          helper: "Resets monthly based on your billing cycle."
        },
        {
          label: "AI credits",
          used: usageSummary.credits.used,
          limit: usageSummary.credits.limit,
          helper: "Includes all AI-assisted features."
        }
      ]
    : null;

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
          Overview
        </p>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Monitor campaign performance and take action in one place.
        </p>
      </header>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">
              Current plan: {usageSummary?.plan ?? currentPlan}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Workspace limits for your subscription tier.
              {usageSummary?.planIsTrial ? (
                <Badge variant="secondary">Trial</Badge>
              ) : null}
              {usageSummary && !usageSummary.planIsActive ? (
                <Badge variant="outline">Inactive</Badge>
              ) : null}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/pricing">Compare plans</Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 text-sm">
          <div className="flex flex-wrap gap-6">
            {planSummary.map((item) => (
              <div key={item.label} className="min-w-[120px]">
                <p className="text-xs uppercase text-muted-foreground">{item.label}</p>
                <p className="text-base font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          {usageMetrics && (
            <div className="space-y-4">
              {usageMetrics.map((metric) => {
                const ratio = metric.limit === 0 ? 0 : metric.used / metric.limit;
                const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
                const usageClass = ratio >= 1 ? 'text-destructive' : ratio >= 0.9 ? 'text-amber-500' : 'text-foreground';
                const statusMessage = ratio >= 1 ? 'Limit reached' : ratio >= 0.9 ? 'Approaching your plan limit' : null;

                return (
                  <div key={metric.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span className="uppercase tracking-wide">{metric.label}</span>
                      <span className={usageClass}>
                        {metric.used.toLocaleString()} / {metric.limit.toLocaleString()}
                      </span>
                    </div>
                    <Progress value={percent} className="h-2" />
                    {statusMessage && (
                      <p className={`text-xs font-semibold ${usageClass}`}>
                        {statusMessage}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/80">{metric.helper}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.trend === "up";
          return (
            <Card
              key={stat.title}
              className="transition-shadow hover:shadow-lg"
            >
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                <div className="flex items-center gap-1 text-xs font-medium">
                  {isPositive ? (
                    <ArrowUpRight className="h-4 w-4 text-success" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-destructive" />
                  )}
                  <span className={isPositive ? "text-success" : "text-destructive"}>
                    {stat.change}
                  </span>
                  <span className="text-muted-foreground">from last month</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Recent Campaigns</CardTitle>
            <CardDescription>
              Your latest email sequences and their performance.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/sequences">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentCampaigns.map((campaign) => (
            <div
              key={campaign.name}
              className="flex flex-col gap-4 rounded-xl border border-border bg-background/80 p-4 transition-colors hover:bg-muted/60 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-base font-semibold text-foreground">
                    {campaign.name}
                  </h3>
                  <span
                    className={
                      campaign.status === "active"
                        ? "rounded-full bg-success/15 px-2 py-1 text-xs font-medium capitalize text-success"
                        : campaign.status === "scheduled"
                        ? "rounded-full bg-warning/15 px-2 py-1 text-xs font-medium capitalize text-warning"
                        : "rounded-full bg-muted px-2 py-1 text-xs font-medium capitalize text-muted-foreground"
                    }
                  >
                    {campaign.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>Sent: {campaign.sent.toLocaleString()}</span>
                  <span>Opened: {campaign.opened.toLocaleString()}</span>
                  <span>Replied: {campaign.replied.toLocaleString()}</span>
                </div>
                <Progress value={campaign.progress} className="h-2" />
              </div>
              <Button variant="ghost" size="sm" className="w-full md:w-auto">
                View details
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Card
              key={action.title}
              className="cursor-pointer transition-shadow hover:shadow-lg"
            >
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  {action.title}
                </CardTitle>
                <Icon className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {action.description}
                </p>
                <Button variant="gradient" size="sm" asChild>
                  <Link href={action.href}>Get started</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
  } catch (error) {
    logger.error({ component: 'Dashboard', error }, 'Dashboard error');
    throw error;
  }
}
