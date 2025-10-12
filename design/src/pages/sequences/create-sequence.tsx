import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Plus,
  Mail,
  Clock,
  Users,
  Settings,
  Zap,
  ChevronRight,
  Save,
  Send,
  Timer,
  GitBranch,
  Target,
  MessageSquare,
  Calendar,
  Trash2,
  Copy,
  Move,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EmailStep {
  id: string;
  type: "email" | "delay" | "condition";
  subject?: string;
  content?: string;
  delay?: number;
  delayUnit?: "hours" | "days" | "weeks";
  condition?: string;
}

export default function CreateSequence() {
  const navigate = useNavigate();
  const [sequenceName, setSequenceName] = useState("");
  const [steps, setSteps] = useState<EmailStep[]>([
    { id: "1", type: "email", subject: "", content: "" }
  ]);
  const [activeStep, setActiveStep] = useState(0);

  const addStep = (type: "email" | "delay" | "condition") => {
    const newStep: EmailStep = {
      id: Date.now().toString(),
      type,
      ...(type === "email" && { subject: "", content: "" }),
      ...(type === "delay" && { delay: 1, delayUnit: "days" }),
      ...(type === "condition" && { condition: "opened_previous" }),
    };
    setSteps([...steps, newStep]);
    setActiveStep(steps.length);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    setSteps(newSteps);
    if (activeStep >= newSteps.length) {
      setActiveStep(Math.max(0, newSteps.length - 1));
    }
  };

  const duplicateStep = (index: number) => {
    const stepToDuplicate = { ...steps[index], id: Date.now().toString() };
    const newSteps = [...steps];
    newSteps.splice(index + 1, 0, stepToDuplicate);
    setSteps(newSteps);
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case "email": return <Mail className="h-4 w-4" />;
      case "delay": return <Clock className="h-4 w-4" />;
      case "condition": return <GitBranch className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Create Email Sequence</h1>
          <p className="text-muted-foreground mt-1">Build automated email campaigns with personalization</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/sequences")}>
            Cancel
          </Button>
          <Button variant="outline">
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button variant="gradient">
            <Send className="h-4 w-4 mr-2" />
            Save & Activate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Sequence Steps */}
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sequence Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ScrollArea className="h-[400px] pr-3">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`group relative p-3 rounded-lg border cursor-pointer transition-colors mb-2 ${
                      activeStep === index 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setActiveStep(index)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        {getStepIcon(step.type)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium capitalize">
                          {step.type === "email" ? `Email ${index + 1}` : step.type}
                        </p>
                        {step.type === "delay" && (
                          <p className="text-xs text-muted-foreground">
                            Wait {step.delay} {step.delayUnit}
                          </p>
                        )}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateStep(index);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStep(index);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </ScrollArea>
              
              <div className="pt-3 space-y-2 border-t">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => addStep("email")}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Add Email
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => addStep("delay")}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Add Delay
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => addStep("condition")}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  Add Condition
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Email Editor */}
        <div className="col-span-6">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {steps[activeStep]?.type === "email" 
                    ? `Email ${activeStep + 1}` 
                    : steps[activeStep]?.type === "delay"
                    ? "Delay Settings"
                    : "Condition Settings"}
                </CardTitle>
                <Badge variant="secondary">
                  Step {activeStep + 1} of {steps.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {steps[activeStep]?.type === "email" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Line</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="subject" 
                        placeholder="{{FirstName}}, quick question about {{Company}}"
                        value={steps[activeStep].subject || ""}
                        onChange={(e) => {
                          const newSteps = [...steps];
                          newSteps[activeStep].subject = e.target.value;
                          setSteps(newSteps);
                        }}
                      />
                      <Button variant="outline" size="icon">
                        <Zap className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="content">Email Content</Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Templates
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Zap className="h-3 w-3 mr-1" />
                          Variables
                        </Button>
                      </div>
                    </div>
                    <Textarea 
                      id="content"
                      placeholder="Hi {{FirstName}},

I noticed you're working at {{Company}} as {{Position}}.

I wanted to reach out because..."
                      rows={12}
                      value={steps[activeStep].content || ""}
                      onChange={(e) => {
                        const newSteps = [...steps];
                        newSteps[activeStep].content = e.target.value;
                        setSteps(newSteps);
                      }}
                    />
                  </div>

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Use personalization variables like {`{{FirstName}}`}, {`{{Company}}`}, {`{{Position}}`} to increase engagement
                    </AlertDescription>
                  </Alert>
                </>
              )}

              {steps[activeStep]?.type === "delay" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Wait Duration</Label>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <Input 
                          type="number" 
                          min="1" 
                          value={steps[activeStep].delay || 1}
                          onChange={(e) => {
                            const newSteps = [...steps];
                            newSteps[activeStep].delay = parseInt(e.target.value);
                            setSteps(newSteps);
                          }}
                        />
                      </div>
                      <Select 
                        defaultValue={steps[activeStep].delayUnit || "days"}
                        onValueChange={(value: "hours" | "days" | "weeks") => {
                          const newSteps = [...steps];
                          newSteps[activeStep].delayUnit = value;
                          setSteps(newSteps);
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hours">Hours</SelectItem>
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="weeks">Weeks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Timer className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Smart Send Time</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Emails will be sent at optimal times based on recipient timezone and engagement patterns
                    </p>
                  </div>
                </div>
              )}

              {steps[activeStep]?.type === "condition" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Condition Type</Label>
                    <Select 
                      defaultValue={steps[activeStep].condition || "opened_previous"}
                      onValueChange={(value) => {
                        const newSteps = [...steps];
                        newSteps[activeStep].condition = value;
                        setSteps(newSteps);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opened_previous">Opened Previous Email</SelectItem>
                        <SelectItem value="clicked_link">Clicked Link in Email</SelectItem>
                        <SelectItem value="replied">Replied to Email</SelectItem>
                        <SelectItem value="not_opened">Not Opened Previous Email</SelectItem>
                        <SelectItem value="custom">Custom Condition</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Alert>
                    <GitBranch className="h-4 w-4" />
                    <AlertDescription>
                      Add different paths based on recipient behavior to increase engagement
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar - Settings */}
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sequence Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Sequence Name</Label>
                <Input 
                  id="name" 
                  placeholder="Welcome Series"
                  value={sequenceName}
                  onChange={(e) => setSequenceName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Select defaultValue="all">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contacts</SelectItem>
                    <SelectItem value="leads">Leads Only</SelectItem>
                    <SelectItem value="customers">Customers Only</SelectItem>
                    <SelectItem value="tagged">Specific Tags</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Send Window</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select defaultValue="9">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select defaultValue="17">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="tracking">Email Tracking</Label>
                <Switch id="tracking" defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="stop-on-reply">Stop on Reply</Label>
                <Switch id="stop-on-reply" defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Performance Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Target Open Rate</span>
                  <span className="font-medium">40%</span>
                </div>
                <Slider defaultValue={[40]} max={100} step={5} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Target Reply Rate</span>
                  <span className="font-medium">15%</span>
                </div>
                <Slider defaultValue={[15]} max={100} step={5} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}