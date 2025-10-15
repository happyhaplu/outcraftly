'use client';

import { type MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Loader2, Tag, Trash2, Users } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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

import { ContactFilters, type ContactFiltersState } from './contact-filters';
import { ContactRow } from './contact-row';
import { ContactEditModal } from './contact-edit-modal';
import { TagEditorModal } from './tag-editor-modal';
import { BulkTagModal } from './bulk-tag-modal';
import type { ContactListItem } from './types';

const fetchContacts = async (url: string): Promise<ContactListItem[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load contacts');
  }

  const payload = (await response.json()) as { contacts?: ContactListItem[] };
  return payload.contacts ?? [];
};

type ContactListProps = {
  initialContacts: ContactListItem[];
};

export function ContactList({ initialContacts }: ContactListProps) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ContactFiltersState>(() => ({
    search: searchParams.get('search') ?? '',
    tag: searchParams.get('tag') ?? ''
  }));

  useEffect(() => {
    const nextFilters = {
      search: searchParams.get('search') ?? '',
      tag: searchParams.get('tag') ?? ''
    };

    setFilters((prev) =>
      prev.search === nextFilters.search && prev.tag === nextFilters.tag ? prev : nextFilters
    );
  }, [searchParams]);

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) {
      params.set('search', filters.search.trim());
    }
    if (filters.tag.trim()) {
      params.set('tag', filters.tag.trim());
    }
    const query = params.toString();
    return query ? `/api/contacts?${query}` : '/api/contacts';
  }, [filters]);

  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  const { data: contacts = [], isValidating } = useSWR<ContactListItem[]>(queryKey, fetchContacts, {
    fallbackData: queryKey === '/api/contacts' ? initialContacts : undefined,
    revalidateOnFocus: false
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingContact, setEditingContact] = useState<ContactListItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tagModalContact, setTagModalContact] = useState<ContactListItem | null>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<ContactListItem | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkTagModalOpen, setIsBulkTagModalOpen] = useState(false);
  const [isBulkTagSaving, setIsBulkTagSaving] = useState(false);

  const totalContacts = contacts.length;
  const selectedCount = selectedIds.size;
  const hasFilters = filters.search.trim().length > 0 || filters.tag.trim().length > 0;

  const availableTags = useMemo(() => {
    const all = [...initialContacts, ...contacts];
    const tagSet = new Set<string>();
    all.forEach((contact) => {
      contact.tags.forEach((tag) => {
        if (tag.trim()) {
          tagSet.add(tag);
        }
      });
    });
    return Array.from(tagSet);
  }, [contacts, initialContacts]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }

      const next = new Set<string>();
      contacts.forEach((contact) => {
        if (prev.has(contact.id)) {
          next.add(contact.id);
        }
      });

      if (next.size === prev.size) {
        let unchanged = true;
        prev.forEach((id) => {
          if (!next.has(id)) {
            unchanged = false;
          }
        });
        if (unchanged) {
          return prev;
        }
      }

      return next;
    });
  }, [contacts]);

  const revalidateContacts = useCallback(async () => {
    await mutate((key) => typeof key === 'string' && key.startsWith('/api/contacts'));
  }, [mutate]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelect = (contactId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(contactId);
      } else {
        next.delete(contactId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedIds(new Set(contacts.map((contact) => contact.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleEditSubmit = async (payload: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
    tags: string[];
  }) => {
    const response = await fetch('/api/contacts/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.error === 'string' ? data.error : 'Failed to update contact';
      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive'
      });
      throw new Error(message);
    }

    toast({
      title: 'Contact updated',
      description: 'Changes saved successfully.'
    });

    await revalidateContacts();
  };

  const handleUpdateTags = async (tags: string[]) => {
    if (!tagModalContact) {
      return;
    }

    const response = await fetch('/api/contacts/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: tagModalContact.id,
        tags
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.error === 'string' ? data.error : 'Failed to update tags';
      toast({
        title: 'Tag update failed',
        description: message,
        variant: 'destructive'
      });
      throw new Error(message);
    }

    toast({
      title: 'Tags updated',
      description: 'Tags saved successfully.'
    });

    await revalidateContacts();
  };

  const handleConfirmDelete = async () => {
    if (!contactToDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/contacts/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: contactToDelete.id })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === 'string' ? data.error : 'Failed to delete contact';
        toast({
          title: 'Delete failed',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Contact deleted',
        description: `${contactToDelete.firstName} ${contactToDelete.lastName} has been removed.`
      });

      setSelectedIds((prev) => {
        if (!prev.has(contactToDelete.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(contactToDelete.id);
        return next;
      });

      await revalidateContacts();
      setIsDeleteDialogOpen(false);
      setContactToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const response = await fetch('/api/contacts/bulk-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === 'string' ? data.error : 'Failed to delete contacts';
        toast({
          title: 'Bulk delete failed',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Contacts deleted',
        description: data.message ?? `${ids.length} contacts deleted.`
      });

      clearSelection();
      await revalidateContacts();
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkAddTags = async (tags: string[]) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || tags.length === 0) {
      return;
    }

    setIsBulkTagSaving(true);
    try {
      const response = await fetch('/api/contacts/bulk-tag', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids, tags })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === 'string' ? data.error : 'Failed to add tags';
        toast({
          title: 'Tag update failed',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Tags added',
        description: data.message ?? 'Tags applied to selected contacts.'
      });

      await revalidateContacts();
      setIsBulkTagModalOpen(false);
    } finally {
      setIsBulkTagSaving(false);
    }
  };

  const allSelected = contacts.length > 0 && selectedCount === contacts.length;
  const partiallySelected = selectedCount > 0 && selectedCount < contacts.length;
  const headerCheckboxState = allSelected ? true : partiallySelected ? 'indeterminate' : false;

  const descriptionText = hasFilters
    ? `${totalContacts} ${totalContacts === 1 ? 'contact matches' : 'contacts match'} your filters.`
    : `${totalContacts} ${totalContacts === 1 ? 'contact is' : 'contacts are'} available for targeting.`;

  return (
    <>
      <Card className="border-border/60">
        <CardHeader className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">Contact list</CardTitle>
              <CardDescription>{descriptionText}</CardDescription>
            </div>
            {isValidating && <p className="text-xs text-muted-foreground">Refreshing contacts...</p>}
          </div>

          <ContactFilters value={filters} onChange={setFilters} availableTags={availableTags} />
        </CardHeader>

        <CardContent className="space-y-4">
          {selectedCount > 0 && (
            <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                {selectedCount} {selectedCount === 1 ? 'contact' : 'contacts'} selected.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsBulkTagModalOpen(true)}
                  disabled={isBulkTagSaving}
                >
                  <span className="flex items-center gap-2">
                    <Tag className="h-4 w-4" aria-hidden />
                    Add tag
                  </span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection} disabled={isBulkDeleting}>
                  Clear selection
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Delete selected
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="size-6 text-primary" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {hasFilters ? 'No contacts match your filters' : 'No contacts yet'}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {hasFilters
                  ? 'Adjust or clear the filters above to see more contacts.'
                  : 'Upload a CSV file to start building your outreach audience.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border/60 text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <Checkbox
                        checked={headerCheckboxState}
                        onCheckedChange={handleToggleSelectAll}
                        aria-label="Select all contacts"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Company</th>
                    <th className="px-4 py-3 font-semibold">Tags</th>
                    <th className="px-4 py-3 font-semibold">Added</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 bg-background">
                  {contacts.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      isSelected={selectedIds.has(contact.id)}
                      onToggleSelect={handleToggleSelect}
                      onEdit={(current) => {
                        setEditingContact(current);
                        setIsEditModalOpen(true);
                      }}
                      onEditTags={(current) => {
                        setTagModalContact(current);
                        setIsTagModalOpen(true);
                      }}
                      onDelete={(current) => {
                        setContactToDelete(current);
                        setIsDeleteDialogOpen(true);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContactEditModal
        contact={editingContact}
        open={isEditModalOpen}
        onOpenChange={(open) => {
          setIsEditModalOpen(open);
          if (!open) {
            setEditingContact(null);
          }
        }}
        onSubmit={handleEditSubmit}
      />

      <TagEditorModal
        contact={tagModalContact}
        open={isTagModalOpen}
        onOpenChange={(open) => {
          setIsTagModalOpen(open);
          if (!open) {
            setTagModalContact(null);
          }
        }}
        onSubmit={handleUpdateTags}
      />

      <BulkTagModal
        open={isBulkTagModalOpen}
        onOpenChange={(open) => {
          if (!open && isBulkTagSaving) {
            return;
          }
          setIsBulkTagModalOpen(open);
        }}
        onSubmit={handleBulkAddTags}
        isSubmitting={isBulkTagSaving}
        selectionCount={selectedCount}
      />

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setContactToDelete(null);
          }
          setIsDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. We will permanently remove{' '}
              <span className="font-semibold text-foreground">
                {contactToDelete?.firstName} {contactToDelete?.lastName}
              </span>{' '}
              and any associated segmentation data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={async (event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                await handleConfirmDelete();
              }}
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </span>
              ) : (
                'Delete contact'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
