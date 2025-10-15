import type { ContactListItem } from '@/app/(dashboard)/contacts/types';

export type ContactFilterState = {
  search?: string;
  tag?: string;
};

const normalise = (value: string) => value.trim().toLowerCase();

export function applyContactFilters(
  contacts: ContactListItem[],
  filters: ContactFilterState
): ContactListItem[] {
  const searchTerm = filters.search ? normalise(filters.search) : '';
  const tagFilter = filters.tag ? filters.tag.trim() : '';

  return contacts.filter((contact) => {
    const matchesSearch = searchTerm
      ? [
          contact.firstName,
          contact.lastName,
          `${contact.firstName} ${contact.lastName}`,
          contact.email,
          contact.company
        ]
          .map((value) => normalise(value))
          .some((value) => value.includes(searchTerm))
      : true;

    const matchesTag = tagFilter
      ? (contact.tags || []).some((tag) => normalise(tag) === normalise(tagFilter))
      : true;

    return matchesSearch && matchesTag;
  });
}
