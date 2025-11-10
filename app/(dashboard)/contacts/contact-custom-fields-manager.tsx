'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

import type { ContactCustomFieldDefinition } from './types';

const fetchCustomFields = async (url: string): Promise<ContactCustomFieldDefinition[]> => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' } });
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

type ContactCustomFieldsManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormMode = 'create' | 'edit' | null;

type FieldFormState = {
  id?: string;
  name: string;
  type: ContactCustomFieldDefinition['type'];
  description: string;
};

const emptyFormState: FieldFormState = {
  name: '',
  type: 'text',
  description: ''
};

export function ContactCustomFieldsManager({ open, onOpenChange }: ContactCustomFieldsManagerProps) {
  const { toast } = useToast();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error, isLoading, mutate: mutateFields } = useSWR<ContactCustomFieldDefinition[]>(
    open ? '/api/contacts/custom-fields' : null,
    fetchCustomFields,
    {
      revalidateOnFocus: false,
      keepPreviousData: true
    }
  );

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formState, setFormState] = useState<FieldFormState>(emptyFormState);
  const [formErrors, setFormErrors] = useState<{ name?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingField, setDeletingField] = useState<ContactCustomFieldDefinition | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormMode(null);
      setFormState(emptyFormState);
      setFormErrors(null);
      setDeletingField(null);
      setIsSaving(false);
      setIsDeleting(false);
    }
  }, [open]);

  const sortedFields = useMemo(() => {
    if (!data) {
      return [] as ContactCustomFieldDefinition[];
    }
    return [...data].sort((left, right) => left.name.localeCompare(right.name));
  }, [data]);

  const handleOpenCreate = () => {
    setFormState(emptyFormState);
    setFormErrors(null);
    setFormMode('create');
  };

  const handleOpenEdit = (field: ContactCustomFieldDefinition) => {
    setFormState({
      id: field.id,
      name: field.name,
      type: field.type,
      description: field.description ?? ''
    });
    setFormErrors(null);
    setFormMode('edit');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormErrors(null);

    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      setFormErrors({ name: 'Name is required' });
      return;
    }

    const payload: Record<string, unknown> = {
      name: trimmedName,
      type: formState.type
    };

    if (formMode === 'create') {
      if (formState.description.trim()) {
        payload.description = formState.description.trim();
      }
    } else {
      payload.description = formState.description.trim() ? formState.description.trim() : null;
    }

    const endpoint =
      formMode === 'edit' && formState.id
        ? `/api/contacts/custom-fields/${formState.id}`
        : '/api/contacts/custom-fields';

    const method = formMode === 'edit' ? 'PATCH' : 'POST';

    setIsSaving(true);
    try {
      const response = await fetch(endpoint, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : 'Unable to save custom field';
        toast({
          title: 'Save failed',
          description: message,
          variant: 'destructive'
        });
        if (result?.fieldErrors?.name?.[0]) {
          setFormErrors({ name: result.fieldErrors.name[0] });
        }
        return;
      }

      toast({
        title: formMode === 'edit' ? 'Custom field updated' : 'Custom field created',
        description: formMode === 'edit' ? 'Changes saved successfully.' : 'Field added successfully.'
      });

      setFormMode(null);
      setFormState(emptyFormState);
      await mutateFields();
      await mutateGlobal('/api/contacts/custom-fields');
      await mutateGlobal(
        (key) => typeof key === 'string' && key.startsWith('/api/contacts/') && key !== '/api/contacts/custom-fields',
        undefined,
        { revalidate: true }
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingField) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/contacts/custom-fields/${deletingField.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        const message = typeof result.error === 'string' ? result.error : 'Unable to delete custom field';
        toast({
          title: 'Delete failed',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Custom field deleted',
        description: `${deletingField.name} has been removed.`
      });

      setDeletingField(null);
      await mutateFields();
      await mutateGlobal('/api/contacts/custom-fields');
      await mutateGlobal(
        (key) => typeof key === 'string' && key.startsWith('/api/contacts/') && key !== '/api/contacts/custom-fields',
        undefined,
        { revalidate: true }
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage custom fields</DialogTitle>
          <DialogDescription>
            Create fields to capture additional details for your contacts. You can edit or remove fields at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Custom fields are shared across your workspace and appear on contact forms.
              </p>
            </div>
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              New field
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading custom fields...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Unable to load custom fields. Please try again.
            </div>
          ) : sortedFields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
              No custom fields yet. Create one to capture additional data like LinkedIn URL or lead source.
            </div>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
              {sortedFields.map((field) => (
                <div
                  key={field.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 text-sm md:flex-row md:items-center"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{field.name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{field.type}</span>
                      <span className="text-muted-foreground/80">Key: {field.key}</span>
                    </div>
                    {field.description ? (
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(field)} className="gap-2">
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => setDeletingField(field)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={formMode !== null} onOpenChange={(next) => (next ? undefined : setFormMode(null))}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{formMode === 'edit' ? 'Edit custom field' : 'New custom field'}</DialogTitle>
              <DialogDescription>
                {formMode === 'edit'
                  ? 'Update the label, type, or description for this field.'
                  : 'Define a field to capture additional details for your contacts.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="custom-field-name">Field name</Label>
              <Input
                id="custom-field-name"
                value={formState.name}
                onChange={(event) => {
                  setFormState((prev) => ({ ...prev, name: event.target.value }));
                  setFormErrors(null);
                }}
                placeholder="LinkedIn URL"
                aria-invalid={Boolean(formErrors?.name)}
                required
              />
              {formErrors?.name ? (
                <p className="text-xs text-destructive" role="alert">
                  {formErrors.name}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-field-type">Field type</Label>
              <select
                id="custom-field-type"
                value={formState.type}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, type: event.target.value as FieldFormState['type'] }))
                }
                className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Text accepts any string, number accepts numeric values, and date expects YYYY-MM-DD.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-field-description">Description (optional)</Label>
              <Textarea
                id="custom-field-description"
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Shown as helper text on the contact form"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormMode(null)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving...
                  </>
                ) : formMode === 'edit' ? (
                  'Save changes'
                ) : (
                  'Create field'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingField)} onOpenChange={(next) => (!next ? setDeletingField(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom field</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingField
                ? `Delete the field "${deletingField.name}"? This removes the field from contact forms.`
                : 'Delete this custom field?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
