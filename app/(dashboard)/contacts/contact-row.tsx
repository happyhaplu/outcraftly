'use client';

import { useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

import type { ContactListItem } from './types';

type ContactRowProps = {
  contact: ContactListItem;
  isSelected: boolean;
  onToggleSelect: (contactId: string, selected: boolean) => void;
  onEdit: (contact: ContactListItem) => void;
  onEditTags: (contact: ContactListItem) => void;
  onDelete: (contact: ContactListItem) => void;
  onViewDetails: (contact: ContactListItem) => void;
};

export function ContactRow({
  contact,
  isSelected,
  onToggleSelect,
  onEdit,
  onEditTags,
  onDelete,
  onViewDetails
}: ContactRowProps) {
  // Top-level hook usage for derived values to keep rendering deterministic
  const stableId = useMemo(() => contact?.id ?? contact?.email ?? 'unknown-contact', [contact]);

  const displayName = useMemo(() => {
    const first = contact?.firstName ?? '';
    const last = contact?.lastName ?? '';
    const full = `${first} ${last}`.trim();
    return full.length ? full : contact?.email ?? 'Unknown';
  }, [contact]);

  const safeEmail = contact?.email ?? '';
  const safeCompany = contact?.company ?? '';

  const createdAtFormatted = useMemo(() => {
    const raw = contact?.createdAt;
    if (!raw) return '—';
    try {
      const date = new Date(raw);
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(date);
    } catch {
      return '—';
    }
  }, [contact]);

  // Ensure required handlers exist before rendering action controls.
  const safeOnToggle = onToggleSelect ?? (() => {});
  const safeOnEdit = onEdit ?? (() => {});
  const safeOnEditTags = onEditTags ?? (() => {});
  const safeOnDelete = onDelete ?? (() => {});
  const safeOnViewDetails = onViewDetails ?? (() => {});

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 align-top">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked: boolean | 'indeterminate') => safeOnToggle(stableId, checked === true)}
          aria-label={`Select ${displayName}`}
        />
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground align-top">
        <div className="font-medium text-foreground">{displayName}</div>
        <div>{safeEmail}</div>
        {contact?.jobTitle ? <div className="text-xs text-muted-foreground">{contact.jobTitle}</div> : null}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground align-top">{safeCompany}</td>
      <td className="px-4 py-3 align-top">
        {contact?.tags?.length ? (
          <div className="flex flex-wrap gap-2">
            {contact.tags.map((tag) => (
              <Badge key={`${stableId}-${tag}`} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground align-top">{createdAtFormatted}</td>
      <td className="px-4 py-3 text-right align-top">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Contact actions">
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => safeOnViewDetails(contact)}>View details</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => safeOnEdit(contact)}>Edit contact</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => safeOnEditTags(contact)}>Edit tags</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => safeOnDelete(contact)} className="text-destructive focus:text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
