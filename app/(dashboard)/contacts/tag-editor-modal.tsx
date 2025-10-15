'use client';

import { useEffect, useState } from 'react';
import { Loader2, Tag } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { parseTags } from '@/lib/validation/contact';

import type { ContactListItem } from './types';

type TagEditorModalProps = {
  contact: ContactListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (tags: string[]) => Promise<void>;
};

export function TagEditorModal({ contact, open, onOpenChange, onSubmit }: TagEditorModalProps) {
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (contact && open) {
      setTagInput(contact.tags.join(', '));
    } else if (!open) {
      setTagInput('');
    }
  }, [contact, open]);

  const handleSave = async () => {
    if (!contact) {
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(parseTags(tagInput));
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit tags</DialogTitle>
          <DialogDescription>
            Add or remove tags for <strong>{contact?.firstName} {contact?.lastName}</strong>. Separate tags with commas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact-tags-input" className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" aria-hidden /> Tags
            </Label>
            <Input
              id="contact-tags-input"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="prospect, enterprise, warm"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">We’ll normalise casing and remove duplicates automatically.</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save tags'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
