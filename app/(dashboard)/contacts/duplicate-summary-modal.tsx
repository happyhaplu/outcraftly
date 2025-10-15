'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { UploadPreviewSummary } from './types';

type DuplicateSummaryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: UploadPreviewSummary | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DuplicateSummaryModal({
  open,
  onOpenChange,
  summary,
  isSubmitting,
  onCancel,
  onConfirm
}: DuplicateSummaryModalProps) {
  const duplicatesInFile = summary?.duplicatesInFile ?? [];
  const duplicatesInDatabase = summary?.duplicatesInDatabase ?? [];
  const duplicatesDetected = summary?.duplicatesDetected ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review import</DialogTitle>
          <DialogDescription>
            We scanned <strong>{summary?.fileName ?? 'your file'}</strong> for duplicates. Confirm to upload without
            duplicates or cancel to revise your CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total rows</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{summary?.totalRows ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unique contacts</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{summary?.uniqueContacts ?? 0}</p>
            </div>
            <div
              className={cn(
                'rounded-lg border px-4 py-3',
                duplicatesDetected > 0
                  ? 'border-destructive/40 bg-destructive/10'
                  : 'border-emerald-200 bg-emerald-50'
              )}
            >
              <p
                className={cn(
                  'text-xs font-semibold uppercase tracking-wide',
                  duplicatesDetected > 0 ? 'text-destructive' : 'text-emerald-700'
                )}
              >
                Duplicates detected
              </p>
              <p
                className={cn(
                  'mt-1 text-xl font-semibold',
                  duplicatesDetected > 0 ? 'text-destructive' : 'text-emerald-700'
                )}
              >
                {duplicatesDetected}
              </p>
            </div>
          </div>

          {duplicatesDetected > 0 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
                <p>
                  We found duplicates. These rows will be skipped during upload, but you can cancel now to double check
                  your CSV if needed.
                </p>
              </div>

              {duplicatesInFile.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-foreground">Duplicates within this file</h4>
                  <p className="text-xs text-muted-foreground">
                    Each email below appears more than once in your CSV.
                  </p>
                  <div className="mt-3 space-y-2">
                    {duplicatesInFile.map((duplicate) => (
                      <div
                        key={`in-file-${duplicate.email}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-destructive">
                          <Badge variant="destructive">Duplicate</Badge>
                          {duplicate.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {duplicate.occurrences} occurrences
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {duplicatesInDatabase.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-foreground">Already in your workspace</h4>
                  <p className="text-xs text-muted-foreground">These emails already exist in your contact list.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {duplicatesInDatabase.map((email) => (
                      <Badge key={`existing-${email}`} variant="destructive">
                        {email}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              <p>No duplicates found. You can safely upload your contacts.</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-3 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onCancel();
              onOpenChange(false);
            }}
            disabled={isSubmitting}
          >
            Cancel upload
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Uploading...' : duplicatesDetected > 0 ? 'Skip duplicates and upload' : 'Upload contacts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
