import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowUpRight,
  ArrowDownRight,
  Mail,
  Users,
  Send,
  TrendingUp,
  Calendar,
  Target,
  Clock,
  BarChart3,
} from "lucide-react";
import { Link } from "react-router-dom";

const stats = [
  {
    title: "Total Sent",
    value: "12,453",
    change: "+12.5%",
    trend: "up",
    icon: Send,
  },
  {
    title: "Open Rate",
    value: "68.3%",
    change: "+4.2%",
    trend: "up",
    icon: Mail,
  },
  {
    title: "Reply Rate",
    value: "24.1%",
    change: "-2.1%",
    trend: "down",
    icon: Target,
  },
  {
    title: "Active Contacts",
    value: "3,821",
    change: "+18.7%",
    trend: "up",
    icon: Users,
  },
];

const recentCampaigns = [
  {
    name: "Q4 Product Launch",
    status: "active",
    sent: 2341,
    opened: 1876,
    replied: 423,
    progress: 65,
  },
  {
    name: "Black Friday Promo",
    status: "scheduled",
    sent: 0,
    opened: 0,
    replied: 0,
    progress: 0,
  },
  {
    name: "Customer Feedback",
    status: "completed",
    sent: 5432,
    opened: 4123,
    replied: 892,
    progress: 100,
  },
];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Monitor your email campaign performance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="hover:shadow-medium transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="flex items-center gap-1 mt-2">
                {stat.trend === "up" ? (
                  <ArrowUpRight className="h-4 w-4 text-success" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-destructive" />
                )}
                <span
                  className={`text-xs font-medium ${
                    stat.trend === "up" ? "text-success" : "text-destructive"
                  }`}
                >
                  {stat.change}
                </span>
                <span className="text-xs text-muted-foreground">from last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Campaigns</CardTitle>
              <CardDescription>Your latest email sequences and their performance</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/sequences">View all</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentCampaigns.map((campaign) => (
              <div
                key={campaign.name}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium text-foreground">{campaign.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        campaign.status === "active"
                          ? "bg-success/10 text-success"
                          : campaign.status === "scheduled"
                          ? "bg-warning/10 text-warning"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <div className="flex gap-6 text-sm text-muted-foreground">
                    <span>Sent: {campaign.sent.toLocaleString()}</span>
                    <span>Opened: {campaign.opened.toLocaleString()}</span>
                    <span>Replied: {campaign.replied.toLocaleString()}</span>
                  </div>
                  <Progress value={campaign.progress} className="mt-3 h-2" />
                </div>
                <Button variant="ghost" size="sm">
                  View Details
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-medium transition-shadow cursor-pointer">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Create Sequence</CardTitle>
              <Mail className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Start a new email sequence campaign
            </p>
            <Button variant="gradient" size="sm" className="mt-4" asChild>
              <Link to="/sequences">Get Started</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-medium transition-shadow cursor-pointer">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Import Contacts</CardTitle>
              <Users className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Upload CSV files with new contacts
            </p>
            <Button variant="gradient" size="sm" className="mt-4" asChild>
              <Link to="/contacts">Import Now</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-medium transition-shadow cursor-pointer">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">View Analytics</CardTitle>
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Detailed insights and reports
            </p>
            <Button variant="gradient" size="sm" className="mt-4" asChild>
              <Link to="/analytics">View Reports</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}