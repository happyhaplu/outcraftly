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
import { ContactDetailDrawer } from './contact-detail-drawer';
import type { ContactListItem } from './types';

type PaginatedResponse = {
  data: ContactListItem[];
  total: number;
  page: number;
  totalPages: number;
};

type ContactListInitialPage = PaginatedResponse;

type ContactListProps = {
  initialPage: ContactListInitialPage;
};

const PAGE_SIZE = 20;

const fetchContacts = async (url: string): Promise<PaginatedResponse> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load contacts');
  }

  return (await response.json()) as PaginatedResponse;
};

export function ContactList({ initialPage }: ContactListProps) {
  const searchParams = useSearchParams();
  const fallbackPage = useMemo(() => initialPage, [initialPage]);

  const initialSearch = searchParams.get('search') ?? '';
  const initialTag = searchParams.get('tag') ?? '';
  const initialPageParam = Number.parseInt(searchParams.get('page') ?? `${initialPage.page}`, 10);
  const initialPageNumber =
    Number.isFinite(initialPageParam) && initialPageParam > 0 ? initialPageParam : initialPage.page;

  const [filters, setFilters] = useState<ContactFiltersState>({ search: initialSearch, tag: initialTag });
  const [page, setPage] = useState<number>(initialPageNumber);

  useEffect(() => {
    const nextFilters: ContactFiltersState = {
      search: searchParams.get('search') ?? '',
      tag: searchParams.get('tag') ?? ''
    };

    const nextPageParam = Number.parseInt(searchParams.get('page') ?? `${fallbackPage.page}`, 10);
    const sanitizedPage =
      Number.isFinite(nextPageParam) && nextPageParam > 0 ? nextPageParam : fallbackPage.page;

    setFilters((prev) =>
      prev.search === nextFilters.search && prev.tag === nextFilters.tag ? prev : nextFilters
    );
    setPage((prev) => (prev === sanitizedPage ? prev : sanitizedPage));
  }, [searchParams, fallbackPage.page]);

  const handleFiltersChange = useCallback((next: ContactFiltersState) => {
    setFilters(next);
    setPage(1);
  }, []);

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) {
      params.set('search', filters.search.trim());
    }
    if (filters.tag.trim()) {
      params.set('tag', filters.tag.trim());
    }
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    const query = params.toString();
    return query ? `/api/contacts?${query}` : '/api/contacts';
  }, [filters.search, filters.tag, page]);

  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  const isBaseQuery =
    filters.search.trim().length === 0 &&
    filters.tag.trim().length === 0 &&
    page === fallbackPage.page;

  const { data: paginated, isValidating } = useSWR<PaginatedResponse>(queryKey, fetchContacts, {
    fallbackData: isBaseQuery ? fallbackPage : undefined,
    revalidateOnFocus: false
  });

  const contacts = paginated?.data ?? (isBaseQuery ? fallbackPage.data : []);
  const totalMatches = paginated?.total ?? fallbackPage.total;
  const currentPage = paginated?.page ?? page;
  const totalPages = paginated?.totalPages ?? Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));

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
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
      return next;
    });
  }, [contacts]);

  const revalidateContacts = useCallback(async () => {
    await mutate((key) => typeof key === 'string' && key.startsWith('/api/contacts'));
  }, [mutate]);

  const revalidateContactDetail = useCallback(
    async (contactId: string) => {
      await mutate(`/api/contacts/${contactId}`);
    },
    [mutate]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelect = useCallback((contactId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(contactId);
      } else {
        next.delete(contactId);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (checked === true) {
        setSelectedIds(new Set(contacts.map((contact) => contact.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [contacts]
  );

  const handleViewDetails = useCallback((toView: ContactListItem) => {
    setDetailContactId(toView.id);
    setIsDetailOpen(true);
  }, []);

  const handleEditSubmit = useCallback(
    async (payload: {
      id: string;
      firstName: string;
      lastName: string;
      company: string;
      tags: string[];
      customFields?: Record<string, string | number | null>;
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
      if (detailContactId === payload.id) {
        await revalidateContactDetail(payload.id);
      }
    },
    [toast, revalidateContacts, detailContactId, revalidateContactDetail]
  );

  const handleUpdateTags = useCallback(
    async (tags: string[]) => {
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
      if (detailContactId === tagModalContact.id) {
        await revalidateContactDetail(tagModalContact.id);
      }
    },
    [tagModalContact, toast, revalidateContacts, detailContactId, revalidateContactDetail]
  );

  const handleConfirmDelete = useCallback(async () => {
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
      if (detailContactId === contactToDelete.id) {
        await revalidateContactDetail(contactToDelete.id);
      }
      setIsDeleteDialogOpen(false);
      setContactToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }, [contactToDelete, toast, revalidateContacts, detailContactId, revalidateContactDetail]);

  const handleBulkDelete = useCallback(async () => {
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
      if (detailContactId && ids.includes(detailContactId)) {
        await revalidateContactDetail(detailContactId);
        setIsDetailOpen(false);
        setDetailContactId(null);
      }
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedIds, toast, clearSelection, revalidateContacts, detailContactId, revalidateContactDetail]);

  const handleBulkAddTags = useCallback(
    async (tags: string[]) => {
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
        if (detailContactId && ids.includes(detailContactId)) {
          await revalidateContactDetail(detailContactId);
        }
        setIsBulkTagModalOpen(false);
      } finally {
        setIsBulkTagSaving(false);
      }
    },
    [selectedIds, toast, revalidateContacts, detailContactId, revalidateContactDetail]
  );

  const availableTags = useMemo(() => {
    const combined = [...fallbackPage.data, ...contacts];
    const unique = new Set<string>();
    combined.forEach((contact) => {
      contact.tags.forEach((tag) => {
        if (tag.trim()) {
          unique.add(tag);
        }
      });
    });
    return Array.from(unique);
  }, [contacts, fallbackPage.data]);

  const selectedCount = selectedIds.size;
  const pageCount = contacts.length;
  const allSelected = pageCount > 0 && selectedCount === pageCount;
  const partiallySelected = selectedCount > 0 && selectedCount < pageCount;
  const headerCheckboxState = allSelected ? true : partiallySelected ? 'indeterminate' : false;

  const hasFilters = filters.search.trim().length > 0 || filters.tag.trim().length > 0;
  const descriptionText = hasFilters
    ? `${totalMatches} ${totalMatches === 1 ? 'contact matches' : 'contacts match'} your filters.`
    : `${totalMatches} ${totalMatches === 1 ? 'contact is' : 'contacts are'} available for targeting.`;

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

          <ContactFilters value={filters} onChange={handleFiltersChange} availableTags={availableTags} />
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
                  disabled={isBulkTagSaving || isBulkDeleting}
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
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" aria-hidden />
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
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Page {Math.min(currentPage, totalPages)} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
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

      <ContactDetailDrawer
        contactId={detailContactId}
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setDetailContactId(null);
          }
        }}
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
