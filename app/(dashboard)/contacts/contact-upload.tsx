'use client';

import { useMemo, useRef, useState } from 'react';
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSWRConfig } from 'swr';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { parseCsv, normalizeRecord, REQUIRED_FIELDS } from '@/lib/contacts/csv';

import { DuplicateSummaryModal } from './duplicate-summary-modal';
import type { UploadSummary, UploadPreviewSummary, FileDuplicateEntry } from './types';

type UploadFeedback = {
  type: 'success' | 'error';
  message: string;
  summary?: UploadSummary;
} | null;

const MAX_FILE_SIZE = 5 * 1024 * 1024;

type ContactUploadProps = {
  onSuccess?: (summary: UploadSummary) => void;
  onError?: (message: string) => void;
  onFinished?: () => void;
};

export function ContactUpload({ onSuccess, onError, onFinished }: ContactUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback>(null);
  const [preview, setPreview] = useState<UploadPreviewSummary | null>(null);
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const { mutate } = useSWRConfig();

  const fileDetails = useMemo(() => {
    if (!file) {
      return null;
    }

    const sizeInKb = file.size / 1024;
    const sizeLabel = sizeInKb > 1024 ? `${(sizeInKb / 1024).toFixed(1)} MB` : `${sizeInKb.toFixed(0)} KB`;

    return {
      name: file.name,
      size: sizeLabel
    };
  }, [file]);

  const resetFileState = () => {
    setFile(null);
    setPreview(null);
    setSummaryOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateFile = (nextFile: File) => {
    if (!nextFile.name.toLowerCase().endsWith('.csv')) {
      const message = 'Please upload a .csv file.';
      setFeedback({ type: 'error', message });
      onError?.(message);
      return false;
    }

    if (nextFile.size === 0) {
      const message = 'The selected file is empty.';
      setFeedback({ type: 'error', message });
      onError?.(message);
      return false;
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      const message = 'File must be smaller than 5MB.';
      setFeedback({ type: 'error', message });
      onError?.(message);
      return false;
    }

    return true;
  };

  const analyseFile = async (nextFile: File) => {
    setPreview(null);
    setSummaryOpen(false);
    try {
      setIsAnalyzing(true);
      setFeedback(null);

      const text = await nextFile.text();
      const records = parseCsv(text);

      if (records.length === 0) {
        throw new Error('The CSV file does not contain any rows.');
      }

      const duplicatesMap = new Map<string, number>();
      const duplicatesInFile: FileDuplicateEntry[] = [];

      const uniqueEmails: string[] = [];

      records.forEach((record, index) => {
        const normalized = normalizeRecord(record);

        for (const field of REQUIRED_FIELDS) {
          if (!normalized[field]) {
            throw new Error(`Missing required field "${field}" on row ${index + 2}.`);
          }
        }

        const email = normalized.email.trim().toLowerCase();
        const count = duplicatesMap.get(email) ?? 0;
        duplicatesMap.set(email, count + 1);
        if (count === 0) {
          uniqueEmails.push(email);
        }
      });

      duplicatesMap.forEach((occurrences, email) => {
        if (occurrences > 1) {
          duplicatesInFile.push({ email, occurrences });
        }
      });

      const fileDuplicateCount = duplicatesInFile.reduce((total, entry) => total + (entry.occurrences - 1), 0);

      const response = await fetch('/api/contacts/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emails: uniqueEmails })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to check duplicates.');
      }

      const payload = (await response.json()) as { duplicates?: string[] };
      const duplicatesInDatabase = Array.from(
        new Set((payload.duplicates ?? []).map((email) => email.toLowerCase()))
      );

      const uniqueContacts = Math.max(uniqueEmails.length - duplicatesInDatabase.length, 0);
      const duplicatesDetected = fileDuplicateCount + duplicatesInDatabase.length;

      setPreview({
        fileName: nextFile.name,
        totalRows: records.length,
        uniqueContacts,
        duplicatesDetected,
        duplicatesInFile,
        duplicatesInDatabase
      });

      setSummaryOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyse the CSV file.';
      setFeedback({ type: 'error', message });
      onError?.(message);
      resetFileState();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    if (!validateFile(nextFile)) {
      event.target.value = '';
      return;
    }

    setFile(nextFile);
    void analyseFile(nextFile);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const nextFile = event.dataTransfer.files?.[0];
    if (!nextFile) {
      return;
    }

    if (!validateFile(nextFile)) {
      return;
    }

    setFile(nextFile);
    void analyseFile(nextFile);
  };

  const handleUpload = async () => {
    if (!file) {
      const message = 'Select a CSV file before uploading.';
      setFeedback({ type: 'error', message });
      onError?.(message);
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/contacts/upload', {
        method: 'POST',
        body: formData
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Upload failed. Please try again.');
      }

      const summary = payload?.summary as UploadSummary | undefined;

      setFeedback({
        type: 'success',
        message: payload?.message ?? 'Contacts uploaded successfully.',
        summary
      });

      resetFileState();

      await mutate('/api/contacts');
      if (summary) {
        onSuccess?.(summary);
      }
      onFinished?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      setFeedback({ type: 'error', message });
      onError?.(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="border-primary/15 bg-background/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Upload contacts</CardTitle>
        <CardDescription>
          Drag in a CSV export or browse for a file. We’ll validate columns and highlight duplicates before upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          htmlFor="contact-upload"
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/60 bg-muted/10 px-6 py-12 text-center transition-colors',
            isDragging && 'border-primary/60 bg-primary/5',
            isAnalyzing && 'border-primary/80'
          )}
        >
          <UploadCloud className="h-8 w-8 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">Drag and drop your CSV</p>
            <p className="text-xs text-muted-foreground">or</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing...
              </span>
            ) : (
              'Browse file'
            )}
          </Button>
          <input
            id="contact-upload"
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={handleFileChange}
            disabled={isAnalyzing}
          />
        </label>

        {fileDetails && (
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
            <FileText className="h-5 w-5 text-primary" aria-hidden />
            <div className="flex flex-col text-left">
              <span className="font-medium text-foreground">{fileDetails.name}</span>
              <span className="text-xs text-muted-foreground">{fileDetails.size}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Accepted format: CSV up to 5MB. Required columns: firstName, lastName, email, company.
          </p>
          <Button
            type="button"
            onClick={() => setSummaryOpen(true)}
            disabled={!file || !preview || isAnalyzing || isUploading}
            className="w-full sm:w-auto"
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing...
              </span>
            ) : (
              'Review import'
            )}
          </Button>
        </div>

        {feedback && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            )}
            role="status"
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden />
            )}
            <div className="space-y-1">
              <p>{feedback.message}</p>
              {feedback.summary && (
                <p className="text-xs text-muted-foreground">
                  {feedback.summary.total} contacts processed, {feedback.summary.inserted} added, {feedback.summary.skipped} skipped (duplicates).
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <DuplicateSummaryModal
        open={isSummaryOpen && Boolean(file) && Boolean(preview)}
        onOpenChange={(open) => setSummaryOpen(open)}
        summary={preview}
        isSubmitting={isUploading}
        onCancel={() => {
          resetFileState();
        }}
        onConfirm={() => {
          void handleUpload();
        }}
      />
    </Card>
  );
}
