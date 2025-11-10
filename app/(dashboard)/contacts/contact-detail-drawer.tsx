'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

import type { ContactCustomFieldDefinition, ContactDetail } from './types';

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

const fetchContactDetail = async (url: string): Promise<ContactDetail> => {
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

type ContactDetailDrawerProps = {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ContactDetailDrawer({ contactId, open, onOpenChange }: ContactDetailDrawerProps) {
  const {
    data: contactDetail,
    isLoading: detailLoading,
    error: detailError,
    mutate: revalidateContact
  } = useSWR<ContactDetail>(
    open && contactId ? `/api/contacts/${contactId}` : null,
    fetchContactDetail,
    {
      revalidateOnFocus: false
    }
  );

  const {
    data: customFields,
    isLoading: fieldsLoading,
    error: fieldsError,
    mutate: revalidateFields
  } = useSWR<ContactCustomFieldDefinition[]>(
    open ? '/api/contacts/custom-fields' : null,
    fetchCustomFields,
    {
      revalidateOnFocus: false
    }
  );

  useEffect(() => {
    if (open && contactId) {
      void revalidateContact();
      void revalidateFields();
    }
  }, [open, contactId, revalidateContact, revalidateFields]);

  const formattedCreatedAt = contactDetail
    ? new Date(contactDetail.createdAt).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '';

  const customFieldPairs = customFields && contactDetail
    ? customFields
        .map((definition) => {
          const rawValue = contactDetail.customFields[definition.id];
          return {
            definition,
            value:
              rawValue === null || rawValue === undefined
                ? null
                : typeof rawValue === 'number'
                ? String(rawValue)
                : String(rawValue)
          };
        })
        .sort((left, right) => left.definition.name.localeCompare(right.definition.name))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contact details</DialogTitle>
          <DialogDescription>Review the latest information stored for this contact.</DialogDescription>
        </DialogHeader>

        {detailLoading || fieldsLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading contact details...
          </div>
        ) : detailError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Unable to load contact details. Please try again later.
          </div>
        ) : !contactDetail ? (
          <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            Select a contact to view their details.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-3">
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {contactDetail.firstName} {contactDetail.lastName}
                </h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>{contactDetail.email}</p>
                  <p>{contactDetail.company}</p>
                  {contactDetail.jobTitle ? <p>Job title: {contactDetail.jobTitle}</p> : null}
                  {contactDetail.timezone ? <p>Timezone: {contactDetail.timezone}</p> : null}
                  <p>Added: {formattedCreatedAt}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Tags</h4>
                {contactDetail.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {contactDetail.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tags assigned.</p>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Custom fields</h4>
                {fieldsError ? (
                  <p className="text-xs text-destructive">Unable to load custom fields for this contact.</p>
                ) : customFieldPairs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No custom fields are defined yet.</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {customFieldPairs.map(({ definition, value }) => (
                      <div key={definition.id} className="space-y-1">
                        <p className="font-medium text-foreground">{definition.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {value && value.length > 0 ? value : 'No value set'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
