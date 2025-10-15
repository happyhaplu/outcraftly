'use client';

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
};

export function ContactRow({
  contact,
  isSelected,
  onToggleSelect,
  onEdit,
  onEditTags,
  onDelete
}: ContactRowProps) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 align-top">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked: boolean | 'indeterminate') => onToggleSelect(contact.id, checked === true)}
          aria-label={`Select ${contact.firstName} ${contact.lastName}`}
        />
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground align-top">
        <div className="font-medium text-foreground">
          {contact.firstName} {contact.lastName}
        </div>
        <div>{contact.email}</div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground align-top">{contact.company}</td>
      <td className="px-4 py-3 align-top">
        {contact.tags?.length ? (
          <div className="flex flex-wrap gap-2">
            {contact.tags.map((tag) => (
              <Badge key={`${contact.id}-${tag}`} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground align-top">
        {new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }).format(new Date(contact.createdAt))}
      </td>
      <td className="px-4 py-3 text-right align-top">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Contact actions">
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => onEdit(contact)}>Edit contact</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEditTags(contact)}>Edit tags</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onDelete(contact)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
