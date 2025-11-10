'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
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

import type { ContactCustomFieldDefinition, ContactDetail, ContactListItem } from './types';

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
    customFields?: Record<string, string | number | null>;
  }) => Promise<void>;
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

const fetchContactDetail = async (url: string): Promise<ContactDetail> => {
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
    throw new Error(`Failed to load contact: ${response.status} ${msg}`);
  }

  const payload = (await response.json()) as { data?: unknown };
  const data = payload.data as Partial<ContactDetail>;

  return {
    id: String(data?.id ?? ''),
    firstName: String(data?.firstName ?? ''),
    lastName: String(data?.lastName ?? ''),
    email: String(data?.email ?? ''),
    company: String(data?.company ?? ''),
    jobTitle: (data?.jobTitle as string | null) ?? null,
    timezone: (data?.timezone as string | null) ?? null,
    tags: Array.isArray(data?.tags) ? (data?.tags as string[]) : [],
    createdAt: typeof data?.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    customFields: (data?.customFields as ContactDetail['customFields']) ?? {}
  } satisfies ContactDetail;
};

export function ContactEditModal({ contact, open, onOpenChange, onSubmit }: ContactEditModalProps) {
  const [values, setValues] = useState(EMPTY_STATE);
  const [errors, setErrors] = useState<{ [key: string]: string | undefined }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [initialCustomValues, setInitialCustomValues] = useState<Record<string, string>>({});
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});

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

  const {
    data: contactDetail,
    isLoading: detailLoading,
    error: contactDetailError
  } = useSWR<ContactDetail>(
    open && contact ? `/api/contacts/${contact.id}` : null,
    fetchContactDetail,
    {
      revalidateOnFocus: false
    }
  );

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
      setCustomValues({});
      setInitialCustomValues({});
      setCustomErrors({});
    } else if (!open) {
      setValues(EMPTY_STATE);
      setErrors({});
      setCustomValues({});
      setInitialCustomValues({});
      setCustomErrors({});
    }
  }, [open, contact]);

  useEffect(() => {
    if (!open || !customFields || !contactDetail || !contact || contactDetail.id !== contact.id) {
      return;
    }

    const initial: Record<string, string> = {};
    const current: Record<string, string> = {};

    customFields.forEach((field) => {
      const rawValue = contactDetail.customFields[field.id];
      if (rawValue === null || rawValue === undefined) {
        initial[field.id] = '';
        current[field.id] = '';
        return;
      }

      if (field.type === 'number' && typeof rawValue === 'number') {
        const formatted = String(rawValue);
        initial[field.id] = formatted;
        current[field.id] = formatted;
        return;
      }

      const formatted = String(rawValue);
      initial[field.id] = formatted;
      current[field.id] = formatted;
    });

    setInitialCustomValues(initial);
    setCustomValues(current);
    setCustomErrors({});
  }, [open, customFields, contactDetail, contact]);

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

    const customFieldPayload: Record<string, string | number | null> = {};
    if (customFields && customFields.length > 0) {
      const nextErrors: Record<string, string> = {};

      for (const field of customFields) {
        const currentValue = customValues[field.id] ?? '';
        const trimmed = currentValue.trim();
        const initialValue = initialCustomValues[field.id] ?? '';

        if (!trimmed) {
          if (initialValue) {
            customFieldPayload[field.id] = null;
          }
          continue;
        }

        if (field.type === 'text') {
          customFieldPayload[field.id] = trimmed;
          continue;
        }

        if (field.type === 'number') {
          const numeric = Number(trimmed);
          if (!Number.isFinite(numeric)) {
            nextErrors[field.id] = 'Enter a valid number';
            continue;
          }
          customFieldPayload[field.id] = numeric;
          continue;
        }

        if (field.type === 'date') {
          const pattern = /^\d{4}-\d{2}-\d{2}$/;
          if (!pattern.test(trimmed)) {
            nextErrors[field.id] = 'Use YYYY-MM-DD';
            continue;
          }
          customFieldPayload[field.id] = trimmed;
        }
      }

      if (Object.keys(nextErrors).length > 0) {
        setCustomErrors(nextErrors);
        return;
      }

      setCustomErrors({});
    }

    setIsSaving(true);
    try {
      await onSubmit({
        id: contact.id,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        company: values.company.trim(),
        tags: parseTags(values.tags),
        customFields: Object.keys(customFieldPayload).length > 0 ? customFieldPayload : undefined
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

          {customFieldsLoading || detailLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading custom fields...
            </div>
          ) : customFieldsError || contactDetailError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              We couldn't load custom field data right now. Please retry after refreshing the page.
            </div>
          ) : customFields && customFields.length > 0 ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">Custom fields</h4>
                <p className="text-xs text-muted-foreground">
                  Update additional contact data. Clear a value to remove it from the contact.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {customFields.map((field) => {
                  const inputId = `edit-custom-field-${field.id}`;
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
          ) : customFields ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              No custom fields are defined yet. Use "Manage custom fields" to create the first one.
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSaving || detailLoading}>
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
