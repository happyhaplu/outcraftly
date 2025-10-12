import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Mail,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Edit,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Sender {
  id: string;
  email: string;
  name: string;
  provider: string;
  status: "active" | "inactive" | "error";
  dailyLimit: number;
  sentToday: number;
  enabled: boolean;
}

const initialSenders: Sender[] = [
  {
    id: "1",
    email: "sales@outcraftly.com",
    name: "Sales Team",
    provider: "Gmail",
    status: "active",
    dailyLimit: 500,
    sentToday: 234,
    enabled: true,
  },
  {
    id: "2",
    email: "outreach@outcraftly.com",
    name: "Outreach Team",
    provider: "Outlook",
    status: "active",
    dailyLimit: 500,
    sentToday: 189,
    enabled: true,
  },
  {
    id: "3",
    email: "marketing@outcraftly.com",
    name: "Marketing",
    provider: "Custom SMTP",
    status: "error",
    dailyLimit: 1000,
    sentToday: 0,
    enabled: false,
  },
];

export default function Senders() {
  const { toast } = useToast();
  const [senders, setSenders] = useState<Sender[]>(initialSenders);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSender, setNewSender] = useState({
    email: "",
    name: "",
    provider: "",
    smtpHost: "",
    smtpPort: "",
    smtpUser: "",
    smtpPassword: "",
  });

  const handleToggleSender = (id: string) => {
    setSenders(prev =>
      prev.map(sender =>
        sender.id === id ? { ...sender, enabled: !sender.enabled } : sender
      )
    );
    toast({
      title: "Sender updated",
      description: "Sender status has been changed.",
    });
  };

  const handleDeleteSender = (id: string) => {
    setSenders(prev => prev.filter(sender => sender.id !== id));
    toast({
      title: "Sender removed",
      description: "The sender account has been removed.",
    });
  };

  const handleAddSender = () => {
    const newId = (senders.length + 1).toString();
    setSenders(prev => [
      ...prev,
      {
        id: newId,
        email: newSender.email,
        name: newSender.name,
        provider: newSender.provider,
        status: "inactive",
        dailyLimit: 500,
        sentToday: 0,
        enabled: false,
      },
    ]);
    setIsAddDialogOpen(false);
    setNewSender({
      email: "",
      name: "",
      provider: "",
      smtpHost: "",
      smtpPort: "",
      smtpUser: "",
      smtpPassword: "",
    });
    toast({
      title: "Sender added",
      description: "New sender account has been added successfully.",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertCircle className="h-4 w-4 text-warning" />;
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sender Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage your email sending accounts</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="gradient">
              <Plus className="h-4 w-4 mr-2" />
              Add Sender
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Sender Account</DialogTitle>
              <DialogDescription>
                Configure a new email account for sending campaigns
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="sender@example.com"
                  value={newSender.email}
                  onChange={(e) => setNewSender({ ...newSender, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  placeholder="Sales Team"
                  value={newSender.name}
                  onChange={(e) => setNewSender({ ...newSender, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="provider">Email Provider</Label>
                <Select
                  value={newSender.provider}
                  onValueChange={(value) => setNewSender({ ...newSender, provider: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gmail">Gmail</SelectItem>
                    <SelectItem value="Outlook">Outlook</SelectItem>
                    <SelectItem value="Custom SMTP">Custom SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newSender.provider === "Custom SMTP" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="smtpHost">SMTP Host</Label>
                      <Input
                        id="smtpHost"
                        placeholder="smtp.example.com"
                        value={newSender.smtpHost}
                        onChange={(e) => setNewSender({ ...newSender, smtpHost: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="smtpPort">SMTP Port</Label>
                      <Input
                        id="smtpPort"
                        placeholder="587"
                        value={newSender.smtpPort}
                        onChange={(e) => setNewSender({ ...newSender, smtpPort: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="smtpUser">SMTP Username</Label>
                    <Input
                      id="smtpUser"
                      placeholder="username"
                      value={newSender.smtpUser}
                      onChange={(e) => setNewSender({ ...newSender, smtpUser: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="smtpPassword">SMTP Password</Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      placeholder="••••••••"
                      value={newSender.smtpPassword}
                      onChange={(e) => setNewSender({ ...newSender, smtpPassword: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="gradient" onClick={handleAddSender}>
                Add Sender
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {senders.map((sender) => (
          <Card key={sender.id} className="hover:shadow-medium transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-primary flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{sender.name}</CardTitle>
                    <CardDescription>{sender.email}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(sender.status)}
                    <Badge
                      variant={sender.status === "active" ? "default" : "secondary"}
                      className={
                        sender.status === "active"
                          ? "bg-success/10 text-success hover:bg-success/20"
                          : sender.status === "error"
                          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                          : ""
                      }
                    >
                      {sender.status}
                    </Badge>
                  </div>
                  <Switch
                    checked={sender.enabled}
                    onCheckedChange={() => handleToggleSender(sender.id)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Provider</p>
                  <p className="text-sm font-medium">{sender.provider}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Daily Limit</p>
                  <p className="text-sm font-medium">{sender.dailyLimit} emails</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Sent Today</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{sender.sentToday}</p>
                    <Progress
                      value={(sender.sentToday / sender.dailyLimit) * 100}
                      className="flex-1 h-2"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="icon">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteSender(sender.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {senders.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No sender accounts</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first sender account to start sending emails
            </p>
            <Button variant="gradient" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Sender
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}