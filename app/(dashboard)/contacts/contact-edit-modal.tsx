'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

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

import type { ContactListItem } from './types';

const EMPTY_STATE = {
  firstName: '',
  lastName: '',
  email: '',
  company: '',
  tags: ''
};

type ContactEditModalProps = {
  contact: ContactListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
    tags: string[];
  }) => Promise<void>;
};

export function ContactEditModal({ contact, open, onOpenChange, onSubmit }: ContactEditModalProps) {
  const [values, setValues] = useState(EMPTY_STATE);
  const [errors, setErrors] = useState<{ [key: string]: string | undefined }>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && contact) {
      setValues({
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        company: contact.company,
        tags: contact.tags.join(', ')
      });
      setErrors({});
    } else if (!open) {
      setValues(EMPTY_STATE);
      setErrors({});
    }
  }, [open, contact]);

  const isValid = useMemo(() => {
    return (
      values.firstName.trim().length > 0 &&
      values.lastName.trim().length > 0 &&
      values.company.trim().length > 0
    );
  }, [values]);

  const handleChange = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contact) {
      return;
    }

    if (!isValid) {
      setErrors({
        firstName: values.firstName.trim() ? undefined : 'First name is required',
        lastName: values.lastName.trim() ? undefined : 'Last name is required',
        company: values.company.trim() ? undefined : 'Company is required'
      });
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        id: contact.id,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        company: values.company.trim(),
        tags: parseTags(values.tags)
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSave} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
            <DialogDescription>
              Update contact details. Email addresses are read-only to preserve historical activity.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-first-name">First name</Label>
              <Input
                id="edit-first-name"
                value={values.firstName}
                onChange={handleChange('firstName')}
                required
                aria-invalid={Boolean(errors.firstName)}
              />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-last-name">Last name</Label>
              <Input
                id="edit-last-name"
                value={values.lastName}
                onChange={handleChange('lastName')}
                required
                aria-invalid={Boolean(errors.lastName)}
              />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" value={values.email} disabled readOnly />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-company">Company</Label>
            <Input
              id="edit-company"
              value={values.company}
              onChange={handleChange('company')}
              required
              aria-invalid={Boolean(errors.company)}
            />
            {errors.company && <p className="text-xs text-destructive">{errors.company}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tags">Tags</Label>
            <Input
              id="edit-tags"
              value={values.tags}
              onChange={handleChange('tags')}
              placeholder="prospect, enterprise"
            />
            <p className="text-xs text-muted-foreground">Separate tags with commas, semicolons, or pipes.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSaving}>
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
