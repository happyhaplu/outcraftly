import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Target, Users, Play, Pause, MoreVertical, Edit, Trash2, Copy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Sequences() {
  const navigate = useNavigate();
  const [sequences] = useState([
    { id: 1, name: "Welcome Series", emails: 5, duration: "14 days", sent: 234, open: 67, status: "active", contacts: 450 },
    { id: 2, name: "Re-engagement Campaign", emails: 3, duration: "7 days", sent: 128, open: 45, status: "paused", contacts: 280 },
    { id: 3, name: "Product Launch", emails: 8, duration: "21 days", sent: 567, open: 72, status: "active", contacts: 890 },
  ]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Sequences</h1>
          <p className="text-muted-foreground mt-1">Create and manage automated email campaigns</p>
        </div>
        <Button variant="gradient" onClick={() => navigate("/sequences/create")}>
          <Plus className="h-4 w-4 mr-2" />
          New Sequence
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {sequences.map((seq) => (
          <Card key={seq.id} className="hover:shadow-medium transition-all group">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{seq.name}</CardTitle>
                  <CardDescription>{seq.emails} emails • {seq.duration}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={seq.status === "active" ? "default" : "secondary"} 
                    className={seq.status === "active" ? "bg-success/10 text-success" : ""}>
                    {seq.status}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span>{seq.sent}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Target className="h-3 w-3 text-muted-foreground" />
                  <span>{seq.open}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span>{seq.contacts}</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                {seq.status === "active" ? (
                  <Button variant="outline" size="sm" className="flex-1">
                    <Pause className="h-3 w-3 mr-1" />
                    Pause
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="flex-1">
                    <Play className="h-3 w-3 mr-1" />
                    Resume
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="flex-1">
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}