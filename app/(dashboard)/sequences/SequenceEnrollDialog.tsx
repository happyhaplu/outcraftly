'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Loader2, Search, Users } from 'lucide-react';

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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { formatTimeRangePreview } from '@/lib/timezone';
import type { SequenceScheduleInput } from '@/lib/validation/sequence';

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

const fetchContacts = async (url: string): Promise<EnrollableContact[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load contacts');
  }
  const payload = (await response.json()) as ContactsResponse;
  return Array.isArray(payload.contacts) ? payload.contacts : [];
};

function buildDisplayName(contact: EnrollableContact) {
  const name = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return name.length > 0 ? name : contact.email;
}

type CurrentUser = {
  timezone: string | null;
};

const fetchCurrentUser = async (url: string): Promise<CurrentUser | null> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const timezoneValue = typeof (payload as { timezone?: unknown }).timezone === 'string' ? (payload as { timezone: string }).timezone : null;
  return { timezone: timezoneValue };
};

function parseTimeMinutes(value: string): number | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const [hours, minutes] = value.split(':');
  if (hours == null || minutes == null) {
    return null;
  }

  const hourNumber = Number.parseInt(hours, 10);
  const minuteNumber = Number.parseInt(minutes, 10);

  if (Number.isNaN(hourNumber) || Number.isNaN(minuteNumber)) {
    return null;
  }

  return hourNumber * 60 + minuteNumber;
}

export function SequenceEnrollDialog({
  sequenceId,
  open,
  onOpenChange,
  onCompleted,
  onError
}: SequenceEnrollDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'none' | 'fixed' | 'window'>('none');
  const [sendTime, setSendTime] = useState('09:00');
  const [windowStart, setWindowStart] = useState('09:00');
  const [windowEnd, setWindowEnd] = useState('17:00');
  const [respectTimezone, setRespectTimezone] = useState(true);

  const { data, error, isLoading, mutate } = useSWR<EnrollableContact[]>(
    open ? '/api/contacts' : null,
    fetchContacts,
    {
      revalidateOnFocus: false,
      keepPreviousData: true
    }
  );

  const { data: currentUser } = useSWR<CurrentUser | null>(open ? '/api/user' : null, fetchCurrentUser, {
    revalidateOnFocus: false
  });

  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setActiveTag('');
      setSelectedIds(new Set());
      setFormError(null);
      setScheduleMode('none');
      setSendTime('09:00');
      setWindowStart('09:00');
      setWindowEnd('17:00');
      setRespectTimezone(true);
    } else {
      void mutate();
    }
  }, [open, mutate]);

  const contacts = data ?? [];

  const fallbackTimezone = useMemo(() => {
    const tz = currentUser?.timezone?.trim();
    return tz && tz.length > 0 ? tz : 'UTC';
  }, [currentUser?.timezone]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    contacts.forEach((contact) => {
      (contact.tags ?? []).forEach((tag) => {
        const trimmed = typeof tag === 'string' ? tag.trim() : '';
        if (trimmed.length > 0) {
          tags.add(trimmed);
        }
      });
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const loweredSearch = searchTerm.trim().toLowerCase();

    return contacts.filter((contact) => {
      const matchesSearch = loweredSearch
        ? [contact.firstName, contact.lastName, contact.email, contact.company]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(loweredSearch))
        : true;

      const matchesTag = activeTag
        ? (contact.tags ?? []).some((tag) => tag.toLowerCase() === activeTag.toLowerCase())
        : true;

      return matchesSearch && matchesTag;
    });
  }, [contacts, searchTerm, activeTag]);

  const activeSchedule = useMemo<SequenceScheduleInput | null>(() => {
    if (scheduleMode === 'fixed') {
      if (!sendTime) {
        return null;
      }

      return {
        mode: 'fixed',
        sendTime,
        respectContactTimezone: respectTimezone
      };
    }

    if (scheduleMode === 'window') {
      if (!windowStart || !windowEnd) {
        return null;
      }

      const startMinutes = parseTimeMinutes(windowStart);
      const endMinutes = parseTimeMinutes(windowEnd);

      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
        return null;
      }

      return {
        mode: 'window',
        sendWindowStart: windowStart,
        sendWindowEnd: windowEnd,
        respectContactTimezone: respectTimezone
      };
    }

    return null;
  }, [scheduleMode, sendTime, windowStart, windowEnd, respectTimezone]);

  const schedulePreviewLabel = useMemo(() => {
    if (!activeSchedule) {
      return null;
    }

    try {
      return formatTimeRangePreview(activeSchedule, fallbackTimezone);
    } catch (error) {
      console.warn('Unable to build schedule preview', error);
      return null;
    }
  }, [activeSchedule, fallbackTimezone]);

  const scheduleSummary = useMemo(() => {
    if (scheduleMode === 'none') {
      return {
        primary: 'Contacts will be eligible for sending as soon as the worker runs.',
        secondary: 'They will follow the per-step delays defined in the sequence.'
      } as const;
    }

    const windowLabel = `${windowStart}–${windowEnd}`;
    const prettyLabel = schedulePreviewLabel ?? (scheduleMode === 'fixed' ? sendTime : windowLabel);

    const primary = scheduleMode === 'fixed'
      ? respectTimezone
        ? `Step one will send around ${prettyLabel} in each contact’s timezone.`
        : `Step one will send around ${prettyLabel} (${fallbackTimezone}).`
      : respectTimezone
        ? `Step one will send between ${prettyLabel} in each contact’s timezone.`
        : `Step one will send between ${prettyLabel} (${fallbackTimezone}).`;

    const secondary = respectTimezone
      ? `Contacts without a timezone will use ${fallbackTimezone}.`
      : `All contacts will use ${fallbackTimezone}.`;

    return { primary, secondary } as const;
  }, [
    fallbackTimezone,
    respectTimezone,
    scheduleMode,
    schedulePreviewLabel,
    sendTime,
    windowEnd,
    windowStart
  ]);

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

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      setFormError('Select at least one contact to enroll.');
      return;
    }

    let schedulePayload: SequenceScheduleInput | undefined;

    if (scheduleMode === 'fixed') {
      const minutes = parseTimeMinutes(sendTime);
      if (minutes == null) {
        setFormError('Enter a send time in HH:MM format.');
        return;
      }

      schedulePayload = {
        mode: 'fixed',
        sendTime,
        respectContactTimezone: respectTimezone
      };
    } else if (scheduleMode === 'window') {
      const startMinutes = parseTimeMinutes(windowStart);
      const endMinutes = parseTimeMinutes(windowEnd);

      if (startMinutes == null || endMinutes == null) {
        setFormError('Enter a valid start and end time in HH:MM format.');
        return;
      }

      if (endMinutes <= startMinutes) {
        setFormError('Window end time must be after the start time.');
        return;
      }

      schedulePayload = {
        mode: 'window',
        sendWindowStart: windowStart,
        sendWindowEnd: windowEnd,
        respectContactTimezone: respectTimezone
      };
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const body: Record<string, unknown> = {
        sequenceId,
        contactIds: Array.from(selectedIds)
      };

      if (schedulePayload) {
        body.schedule = schedulePayload;
      }

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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enroll contacts</DialogTitle>
          <DialogDescription>
            Choose which contacts should enter this sequence. They will start at step one and follow the configured delays.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Delivery timing</h3>
              <p className="text-xs text-muted-foreground">
                Decide when step one should send after enrollment. You can fine-tune the worker cadence below.
              </p>
            </div>

            <RadioGroup
              value={scheduleMode}
              onValueChange={(value) => setScheduleMode(value as 'none' | 'fixed' | 'window')}
              className="grid gap-3"
            >
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors',
                  scheduleMode === 'none' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border/60'
                )}
              >
                <RadioGroupItem value="none" id="schedule-none" className="mt-1" />
                <div>
                  <Label htmlFor="schedule-none" className="text-sm font-medium text-foreground">
                    Send immediately
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Contacts enter the queue right away and follow each step&apos;s delay.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  'rounded-lg border bg-background p-3 transition-colors',
                  scheduleMode === 'fixed' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border/60'
                )}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="fixed" id="schedule-fixed" className="mt-1" />
                  <div>
                    <Label htmlFor="schedule-fixed" className="text-sm font-medium text-foreground">
                      Fixed time
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Deliver at the same local time after applying the step delay.
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 pl-7 md:pl-9">
                  <div>
                    <Label htmlFor="schedule-fixed-time" className="text-xs text-muted-foreground">
                      Send at
                    </Label>
                    <Input
                      id="schedule-fixed-time"
                      type="time"
                      value={sendTime}
                      onChange={(event) => setSendTime(event.target.value)}
                      className="mt-1 w-32"
                      disabled={scheduleMode !== 'fixed'}
                    />
                  </div>
                </div>

                {scheduleMode === 'fixed' ? (
                  <label className="mt-2 flex items-center gap-2 pl-7 text-xs text-muted-foreground">
                    <Checkbox
                      checked={respectTimezone}
                      onCheckedChange={(checked) => setRespectTimezone(checked === true)}
                    />
                    Respect contact timezone
                  </label>
                ) : null}
              </div>

              <div
                className={cn(
                  'rounded-lg border bg-background p-3 transition-colors',
                  scheduleMode === 'window' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border/60'
                )}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="window" id="schedule-window" className="mt-1" />
                  <div>
                    <Label htmlFor="schedule-window" className="text-sm font-medium text-foreground">
                      Time window
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Randomise the first send within a window after the delay.
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 pl-7 md:pl-9">
                  <div>
                    <Label htmlFor="schedule-window-start" className="text-xs text-muted-foreground">
                      Window start
                    </Label>
                    <Input
                      id="schedule-window-start"
                      type="time"
                      value={windowStart}
                      onChange={(event) => setWindowStart(event.target.value)}
                      className="mt-1 w-32"
                      disabled={scheduleMode !== 'window'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="schedule-window-end" className="text-xs text-muted-foreground">
                      Window end
                    </Label>
                    <Input
                      id="schedule-window-end"
                      type="time"
                      value={windowEnd}
                      onChange={(event) => setWindowEnd(event.target.value)}
                      className="mt-1 w-32"
                      disabled={scheduleMode !== 'window'}
                    />
                  </div>
                </div>

                {scheduleMode === 'window' ? (
                  <label className="mt-2 flex items-center gap-2 pl-7 text-xs text-muted-foreground">
                    <Checkbox
                      checked={respectTimezone}
                      onCheckedChange={(checked) => setRespectTimezone(checked === true)}
                    />
                    Respect contact timezone
                  </label>
                ) : null}
              </div>
            </RadioGroup>

            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                scheduleMode === 'none'
                  ? 'border-dashed border-border/60 bg-background/70 text-muted-foreground'
                  : 'border-border/60 bg-background text-muted-foreground'
              )}
            >
              <p>{scheduleSummary.primary}</p>
              {scheduleSummary.secondary ? <p className="mt-1">{scheduleSummary.secondary}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, email, or company"
                className="pl-9"
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="gap-2">
                  {activeTag ? `Tag: ${activeTag}` : 'All tags'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuItem onSelect={() => setActiveTag('')}>All tags</DropdownMenuItem>
                {availableTags.length === 0 ? (
                  <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
                ) : (
                  availableTags.map((tag) => (
                    <DropdownMenuItem key={tag} onSelect={() => setActiveTag(tag)}>
                      {tag}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="rounded-xl border border-border/60">
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

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
