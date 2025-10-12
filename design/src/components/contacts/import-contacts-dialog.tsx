import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ImportContactsDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      // Simulate file analysis
      setTimeout(() => {
        setDuplicates([
          { email: "john@example.com", name: "John Smith", status: "duplicate" },
          { email: "sarah@example.com", name: "Sarah Johnson", status: "duplicate" },
        ]);
      }, 500);
    }
  };

  const handleImport = () => {
    setImporting(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setImporting(false);
        setOpen(false);
        setFile(null);
        setUploadProgress(0);
      }
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gradient">
          <Upload className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import multiple contacts at once
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="mapping">Mapping</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium">
                  {file ? file.name : "Click to upload CSV file"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  or drag and drop your file here
                </p>
              </label>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                CSV should contain columns: First Name, Last Name, Email, Company, Position
              </AlertDescription>
            </Alert>
            
            <Button variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download Sample CSV
            </Button>
          </TabsContent>
          
          <TabsContent value="mapping" className="space-y-4">
            <div className="space-y-3">
              <Label>Map CSV columns to contact fields</Label>
              {[
                { csv: "email_address", field: "Email" },
                { csv: "first_name", field: "First Name" },
                { csv: "last_name", field: "Last Name" },
                { csv: "company_name", field: "Company" },
                { csv: "job_title", field: "Position" },
              ].map((mapping, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Badge variant="secondary" className="min-w-[120px]">
                    {mapping.csv}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="min-w-[120px]">
                    {mapping.field}
                  </Badge>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="review" className="space-y-4">
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">245</p>
                <p className="text-sm text-muted-foreground">Total Contacts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">243</p>
                <p className="text-sm text-muted-foreground">Valid</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">2</p>
                <p className="text-sm text-muted-foreground">Duplicates</p>
              </div>
            </div>
            
            {duplicates.length > 0 && (
              <div className="space-y-2">
                <Label>Duplicate Contacts (will be skipped)</Label>
                <ScrollArea className="h-[150px] border rounded-lg p-3">
                  {duplicates.map((dup, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{dup.name}</p>
                        <p className="text-xs text-muted-foreground">{dup.email}</p>
                      </div>
                      <Badge variant="secondary">Duplicate</Badge>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
            
            {importing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Importing contacts...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="gradient" 
            onClick={handleImport}
            disabled={!file || importing}
          >
            {importing ? "Importing..." : "Import Contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}