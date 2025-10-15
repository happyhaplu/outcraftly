'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ZodError } from 'zod';
import { useSWRConfig } from 'swr';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { contactFormSchema, parseTags } from '@/lib/validation/contact';

import type { ContactFormValues } from '@/lib/validation/contact';

const initialValues: ContactFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  company: '',
  tags: ''
};

type ContactFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
};

type FieldErrors = Partial<Record<keyof ContactFormValues, string>>;

export function ContactFormModal({ open, onOpenChange, onSuccess }: ContactFormModalProps) {
  const [values, setValues] = useState<ContactFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (!open) {
      setValues(initialValues);
      setErrors({});
      setSubmitError(null);
    }
  }, [open]);

  const isValid = useMemo(() => {
    try {
      contactFormSchema.parse(values);
      return true;
    } catch {
      return false;
    }
  }, [values]);

  const handleChange = (field: keyof ContactFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    try {
      const parsed = contactFormSchema.parse(values);
      const payload = {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        company: parsed.company,
        tags: parseTags(parsed.tags)
      };

      setIsSubmitting(true);

      const response = await fetch('/api/contacts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to create contact.');
      }

      await mutate('/api/contacts');
      const message = typeof data?.message === 'string' ? data.message : 'Contact created successfully';
      onSuccess(message);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors: FieldErrors = {};
        for (const issue of error.issues) {
          const field = issue.path[0] as keyof ContactFormValues | undefined;
          if (field) {
            fieldErrors[field] = issue.message;
          }
        }
        setErrors(fieldErrors);
      } else if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Create contact</DialogTitle>
            <DialogDescription>
              Add a single contact to your database. All fields except tags are required.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-first-name">First name</Label>
              <Input
                id="contact-first-name"
                value={values.firstName}
                onChange={handleChange('firstName')}
                placeholder="Avery"
                autoComplete="given-name"
                aria-invalid={Boolean(errors.firstName)}
                required
              />
              {errors.firstName && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.firstName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-last-name">Last name</Label>
              <Input
                id="contact-last-name"
                value={values.lastName}
                onChange={handleChange('lastName')}
                placeholder="Stone"
                autoComplete="family-name"
                aria-invalid={Boolean(errors.lastName)}
                required
              />
              {errors.lastName && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.lastName}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={values.email}
              onChange={handleChange('email')}
              placeholder="avery@example.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              required
            />
            {errors.email && (
              <p className="text-xs text-destructive" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-company">Company</Label>
            <Input
              id="contact-company"
              value={values.company}
              onChange={handleChange('company')}
              placeholder="Stone & Co."
              autoComplete="organization"
              aria-invalid={Boolean(errors.company)}
              required
            />
            {errors.company && (
              <p className="text-xs text-destructive" role="alert">
                {errors.company}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-tags">Tags (optional)</Label>
            <Input
              id="contact-tags"
              value={values.tags}
              onChange={handleChange('tags')}
              placeholder="prospect, north america"
            />
            <p className="text-xs text-muted-foreground">Separate tags with commas, semicolons, or pipes.</p>
          </div>

          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create contact'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
