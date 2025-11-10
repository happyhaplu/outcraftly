'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Loader2, Search, Users, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export type SequenceEnrollDialogResult = {
  enrolled: number;
  skipped: number;
};

type EnrollableContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  tags: string[];
};

type SequenceEnrollDialogProps = {
  sequenceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (result: SequenceEnrollDialogResult) => void;
  onError: (message: string) => void;
};

type ContactsResponse = {
  contacts: EnrollableContact[];
};

type PaginatedContactsResponse = {
  data?: unknown[];
  total?: number;
  page?: number;
  totalPages?: number;
};

const fetchContacts = async (url: string): Promise<EnrollableContact[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load contacts');
  }

  const payload = (await response.json()) as ContactsResponse | PaginatedContactsResponse;

  if ('data' in payload && Array.isArray(payload.data)) {
    const list = payload.data as unknown[];
    return list
      .map((item): EnrollableContact | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const candidate = item as Partial<EnrollableContact> & { id?: unknown };
        if (typeof candidate.id !== 'string') {
          return null;
        }

        return {
          id: candidate.id,
          firstName: typeof candidate.firstName === 'string' ? candidate.firstName : '',
          lastName: typeof candidate.lastName === 'string' ? candidate.lastName : '',
          email: typeof candidate.email === 'string' ? candidate.email : '',
          company: typeof candidate.company === 'string' ? candidate.company : null,
          tags: Array.isArray(candidate.tags)
            ? candidate.tags.filter((tag): tag is string => typeof tag === 'string')
            : []
        } satisfies EnrollableContact;
      })
      .filter((contact): contact is EnrollableContact => contact !== null);
  }

  const contactsPayload = payload as ContactsResponse;
  if (Array.isArray(contactsPayload.contacts)) {
    return contactsPayload.contacts;
  }

  return [];
};

type ContactTagsResponse = {
  tags: unknown;
};

const fetchContactTags = async (url: string): Promise<string[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load contact tags');
  }
  const payload = (await response.json()) as ContactTagsResponse;
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  return tags
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((tag) => tag.length > 0);
};

function buildDisplayName(contact: EnrollableContact) {
  const name = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return name.length > 0 ? name : contact.email;
}

export function SequenceEnrollDialog({
  sequenceId,
  open,
  onOpenChange,
  onCompleted,
  onError
}: SequenceEnrollDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  const CONTACTS_ENDPOINT = '/api/contacts?limit=200';

  const { data, error, isLoading, mutate } = useSWR<EnrollableContact[]>(
    open ? CONTACTS_ENDPOINT : null,
    fetchContacts,
    {
      revalidateOnFocus: false,
      keepPreviousData: true
    }
  );

  const {
    data: contactTags,
    error: tagError,
    isLoading: tagsLoading
  } = useSWR<string[]>(open ? '/api/contact-tags' : null, fetchContactTags, {
    revalidateOnFocus: false
  });

  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setSelectedTagId('');
      setSelectedIds(new Set());
      setFormError(null);
    } else {
      void mutate();
    }
  }, [open, mutate]);

  const contacts = data ?? [];

  const availableTags = useMemo(() => {
    const collected = new Set<string>();

    (contactTags ?? []).forEach((tag) => {
      const trimmed = tag.trim();
      if (trimmed.length > 0) {
        collected.add(trimmed);
      }
    });

    contacts.forEach((contact) => {
      (contact.tags ?? []).forEach((tag) => {
        const trimmed = typeof tag === 'string' ? tag.trim() : '';
        if (trimmed.length > 0) {
          collected.add(trimmed);
        }
      });
    });

    return Array.from(collected).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [contactTags, contacts]);

  const filteredContacts = useMemo(() => {
    const loweredSearch = searchTerm.trim().toLowerCase();

    return contacts.filter((contact) => {
      const matchesSearch = loweredSearch
        ? [contact.firstName, contact.lastName, contact.email, contact.company]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(loweredSearch))
        : true;

      const matchesTag = selectedTagId
        ? (contact.tags ?? []).some((tag) => tag.toLowerCase() === selectedTagId.toLowerCase())
        : true;

      return matchesSearch && matchesTag;
    });
  }, [contacts, searchTerm, selectedTagId]);

  const toggleContact = (contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (filteredContacts.length === 0) {
      return;
    }

    setSelectedIds(new Set(filteredContacts.map((contact) => contact.id)));
    setFormError(null);
  };

  const clearSelection = () => {
    if (selectedIds.size === 0) {
      return;
    }

    setSelectedIds(new Set());
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      setFormError('Select at least one contact to enroll.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const body: Record<string, unknown> = {
        sequenceId,
        contactIds: Array.from(selectedIds)
      };

      const response = await fetch('/api/sequences/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof payload.error === 'string' ? payload.error : 'Failed to enroll contacts.';
        setFormError(message);
        onError(message);
        return;
      }

      onCompleted({
        enrolled: typeof payload.enrolled === 'number' ? payload.enrolled : selectedIds.size,
        skipped: typeof payload.skipped === 'number' ? payload.skipped : 0
      });
      toast({ title: 'Contacts enrolled successfully' });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to enroll contacts', error);
      const message = 'Something went wrong. Please try again.';
      setFormError(message);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCount = selectedIds.size;
  const totalCount = filteredContacts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <div className="space-y-6 p-6">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl font-semibold text-foreground">Enroll contacts</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Choose which contacts should enter this sequence. They will start at step one and follow the configured delays.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Available</p>
              <p className="text-lg font-semibold text-foreground">{contacts.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Matching filters</p>
              <p className="text-lg font-semibold text-foreground">{totalCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Selected</p>
              <p className="text-lg font-semibold text-foreground">{selectedCount}</p>
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Select contacts to enroll</h3>
            <p className="text-sm text-muted-foreground">
              Filter by tag, pick the contacts you want to enroll, and we&apos;ll add them to the start of the sequence.
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, email, or company"
                className="pl-10"
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="gap-2">
                    <span>{selectedTagId ? `Tag: ${selectedTagId}` : 'All tags'}</span>
                    {selectedTagId ? <Badge variant="secondary">Active</Badge> : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                  <DropdownMenuLabel>Filter by tag</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSelectedTagId('')}>All tags</DropdownMenuItem>
                  {tagError ? (
                    <DropdownMenuItem disabled>Unable to load tags</DropdownMenuItem>
                  ) : tagsLoading ? (
                    <DropdownMenuItem disabled>Loading tags…</DropdownMenuItem>
                  ) : availableTags.length === 0 ? (
                    <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
                  ) : (
                    availableTags.map((tag) => (
                      <DropdownMenuItem key={tag} onSelect={() => setSelectedTagId(tag)}>
                        {tag}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {selectedTagId ? (
                <Badge variant="outline" className="inline-flex items-center gap-1">
                  {selectedTagId}
                  <button
                    type="button"
                    onClick={() => setSelectedTagId('')}
                    className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground"
                    aria-label="Clear tag filter"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {filteredContacts.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={selectAllFiltered}
                  disabled={isLoading}
                >
                  Select all
                </Button>
              ) : null}
              {selectedIds.size > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                  Clear selection
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading contacts...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 px-4 py-12 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                Unable to load contacts. Please try again.
              </div>
            ) : totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
                <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
                {contacts.length === 0
                  ? 'No contacts available in this workspace yet.'
                  : selectedTagId
                    ? 'No contacts found for this tag.'
                    : 'No contacts match the current filters.'}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full divide-y divide-border/60 text-left text-sm">
                  <thead className="sticky top-0 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3"></th>
                      <th className="px-4 py-3 font-semibold">Contact</th>
                      <th className="px-4 py-3 font-semibold">Company</th>
                      <th className="px-4 py-3 font-semibold">Tags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 bg-background">
                    {filteredContacts.map((contact) => {
                      const isSelected = selectedIds.has(contact.id);
                      const displayName = buildDisplayName(contact);
                      return (
                        <tr
                          key={contact.id}
                          className={cn('transition-colors hover:bg-muted/30', isSelected && 'bg-primary/5')}
                        >
                          <td className="px-4 py-3 align-middle">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleContact(contact.id)}
                              aria-label={`Select contact ${displayName}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{displayName}</span>
                              <span className="text-xs text-muted-foreground">{contact.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{contact.company || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {(contact.tags ?? []).length === 0 ? (
                                <span className="text-xs text-muted-foreground">No tags</span>
                              ) : (
                                contact.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {selectedCount > 0
                ? `${selectedCount} ${selectedCount === 1 ? 'contact selected' : 'contacts selected'}`
                : 'Select contacts to enroll'}
            </span>
            <span>{totalCount} shown</span>
          </div>

          {formError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {formError}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              <p>Enrolled contacts start at step one and follow the existing step delays.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || selectedCount === 0}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Enrolling...
                  </>
                ) : (
                  'Enroll selected'
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
