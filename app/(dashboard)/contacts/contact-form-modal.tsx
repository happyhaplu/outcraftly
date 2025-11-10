'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
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
import type { ContactCustomFieldDefinition } from './types';

const initialValues: ContactFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  company: '',
  timezone: '',
  tags: ''
};

const fetchCustomFields = async (url: string): Promise<ContactCustomFieldDefinition[]> => {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      accept: 'application/json'
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let msg = body;
    try {
      const parsed = JSON.parse(body);
      msg = parsed?.error ?? body ?? '';
    } catch {
      // ignore
    }
    throw new Error(`Failed to load custom fields: ${response.status} ${msg}`);
  }

  const payload = (await response.json()) as { data?: unknown };
  if (!payload.data || !Array.isArray(payload.data)) {
    return [];
  }

  return payload.data.map((item) => {
    const row = item as Partial<ContactCustomFieldDefinition>;
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      key: String(row.key ?? ''),
      type: (row.type as ContactCustomFieldDefinition['type']) ?? 'text',
      description: (row.description as string | null) ?? null,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString()
    } satisfies ContactCustomFieldDefinition;
  });
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
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const { mutate } = useSWRConfig();

  const {
    data: customFields,
    isLoading: customFieldsLoading,
    error: customFieldsError
  } = useSWR<ContactCustomFieldDefinition[]>(
    open ? '/api/contacts/custom-fields' : null,
    fetchCustomFields,
    {
      revalidateOnFocus: false
    }
  );

  useEffect(() => {
    if (!open) {
      setValues(initialValues);
      setErrors({});
      setSubmitError(null);
      setCustomValues({});
      setCustomErrors({});
    }
  }, [open]);

  useEffect(() => {
    if (!customFields) {
      return;
    }

    setCustomValues((prev) => {
      const next: Record<string, string> = {};
      customFields.forEach((field) => {
        next[field.id] = field.id in prev ? prev[field.id] : '';
      });
      return next;
    });

    setCustomErrors((prev) => {
      if (!prev || Object.keys(prev).length === 0) {
        return prev;
      }

      const next: Record<string, string> = {};
      customFields.forEach((field) => {
        if (prev[field.id]) {
          next[field.id] = prev[field.id];
        }
      });
      return next;
    });
  }, [customFields]);

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
      const trimmedTimezone = parsed.timezone?.trim();
      const payload = {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        company: parsed.company,
        ...(trimmedTimezone ? { timezone: trimmedTimezone } : {}),
        tags: parseTags(parsed.tags)
      };

      let customFieldPayload: Record<string, string | number> | undefined;
      if (customFields && customFields.length > 0) {
        const nextErrors: Record<string, string> = {};
        const nextPayload: Record<string, string | number> = {};

        for (const field of customFields) {
          const currentValue = customValues[field.id] ?? '';
          const trimmed = currentValue.trim();

          if (!trimmed) {
            continue;
          }

          if (field.type === 'text') {
            nextPayload[field.id] = trimmed;
            continue;
          }

          if (field.type === 'number') {
            const numeric = Number(trimmed);
            if (!Number.isFinite(numeric)) {
              nextErrors[field.id] = 'Enter a valid number';
              continue;
            }
            nextPayload[field.id] = numeric;
            continue;
          }

          if (field.type === 'date') {
            const pattern = /^\d{4}-\d{2}-\d{2}$/;
            if (!pattern.test(trimmed)) {
              nextErrors[field.id] = 'Use YYYY-MM-DD';
              continue;
            }
            nextPayload[field.id] = trimmed;
          }
        }

        if (Object.keys(nextErrors).length > 0) {
          setCustomErrors(nextErrors);
          return;
        }

        setCustomErrors({});
        if (Object.keys(nextPayload).length > 0) {
          customFieldPayload = nextPayload;
        }
      }

      setIsSubmitting(true);

      const response = await fetch('/api/contacts/create', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(
          customFieldPayload ? { ...payload, customFields: customFieldPayload } : payload
        )
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to create contact.');
      }

  await mutate((key) => typeof key === 'string' && key.startsWith('/api/contacts'));
      const message = typeof data?.message === 'string' ? data.message : 'Contact created successfully';
      onSuccess(message);
      onOpenChange(false);
      setCustomValues({});
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
            <Label htmlFor="contact-timezone">Timezone (optional)</Label>
            <Input
              id="contact-timezone"
              value={values.timezone ?? ''}
              onChange={handleChange('timezone')}
              placeholder="America/New_York"
              autoComplete="off"
              aria-invalid={Boolean(errors.timezone)}
            />
            <p className="text-xs text-muted-foreground">Use an IANA timezone, e.g. America/Los_Angeles.</p>
            {errors.timezone && (
              <p className="text-xs text-destructive" role="alert">
                {errors.timezone}
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

          {customFieldsLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading custom fields...
            </div>
          ) : customFieldsError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Unable to load custom fields. They will be hidden until the list loads.
            </div>
          ) : customFields && customFields.length > 0 ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">Custom fields</h4>
                <p className="text-xs text-muted-foreground">
                  Values entered here are stored with the contact and appear wherever the field is shown.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {customFields.map((field) => {
                  const inputId = `create-custom-field-${field.id}`;
                  const value = customValues[field.id] ?? '';
                  const errorMessage = customErrors[field.id];

                  const handleCustomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
                    const nextValue = event.target.value;
                    setCustomValues((prev) => ({ ...prev, [field.id]: nextValue }));
                    setCustomErrors((prev) => {
                      if (!prev[field.id]) {
                        return prev;
                      }
                      const next = { ...prev };
                      delete next[field.id];
                      return next;
                    });
                  };

                  if (field.type === 'text') {
                    return (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={inputId}>{field.name}</Label>
                        <Input
                          id={inputId}
                          value={value}
                          onChange={handleCustomChange}
                          placeholder={field.description ?? ''}
                          aria-invalid={Boolean(errorMessage)}
                        />
                        {errorMessage ? (
                          <p className="text-xs text-destructive" role="alert">
                            {errorMessage}
                          </p>
                        ) : field.description ? (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        ) : null}
                      </div>
                    );
                  }

                  if (field.type === 'number') {
                    return (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={inputId}>{field.name}</Label>
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="decimal"
                          value={value}
                          onChange={handleCustomChange}
                          placeholder={field.description ?? ''}
                          aria-invalid={Boolean(errorMessage)}
                        />
                        {errorMessage ? (
                          <p className="text-xs text-destructive" role="alert">
                            {errorMessage}
                          </p>
                        ) : field.description ? (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={inputId}>{field.name}</Label>
                      <Input
                        id={inputId}
                        type="date"
                        value={value}
                        onChange={handleCustomChange}
                        placeholder="YYYY-MM-DD"
                        aria-invalid={Boolean(errorMessage)}
                      />
                      {errorMessage ? (
                        <p className="text-xs text-destructive" role="alert">
                          {errorMessage}
                        </p>
                      ) : field.description ? (
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Use YYYY-MM-DD format.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting || customFieldsLoading}>
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
