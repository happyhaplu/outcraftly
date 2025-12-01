'use client';

import { useState } from 'react';
import { Loader2, Tag } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { parseTags } from '@/lib/validation/contact';

type BulkTagModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (tags: string[]) => Promise<void>;
  isSubmitting: boolean;
  selectionCount: number;
};

export function BulkTagModal({ open, onOpenChange, onSubmit, isSubmitting, selectionCount }: BulkTagModalProps) {
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTagInput('');
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const tags = parseTags(tagInput);
    if (tags.length === 0) {
      setError('Enter at least one tag to apply.');
      return;
    }

    setError(null);
    try {
      await onSubmit(tags);
    } catch (submissionError) {
      // Parent surface errors via toasts; keep modal open for correction.
      console.error('Bulk tag submission failed', submissionError);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && handleOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add tags to selected contacts</DialogTitle>
          <DialogDescription>
            Apply new tags to <strong>{selectionCount}</strong> selected
            {selectionCount === 1 ? ' contact' : ' contacts'} without affecting existing tags.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-tag-input" className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" aria-hidden /> Tags to add
            </Label>
            <Input
              id="bulk-tag-input"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="prospect, warm, enterprise"
              disabled={isSubmitting}
              aria-invalid={error ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Separate multiple tags with commas, semicolons, or pipes.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Applying...
              </span>
            ) : (
              'Apply tags'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
