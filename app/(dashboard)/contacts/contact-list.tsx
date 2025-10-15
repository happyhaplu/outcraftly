'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Users, Tag } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { ContactListItem } from './types';

const fetchContacts = async (): Promise<ContactListItem[]> => {
  const response = await fetch('/api/contacts');
  if (!response.ok) {
    throw new Error('Failed to load contacts');
  }

  const payload = await response.json();
  return payload.contacts as ContactListItem[];
};

type ContactListProps = {
  initialContacts: ContactListItem[];
};

export function ContactList({ initialContacts }: ContactListProps) {
  const {
    data: contacts = [],
    isValidating
  } = useSWR<ContactListItem[]>('/api/contacts', fetchContacts, {
    fallbackData: initialContacts
  });

  const totalContacts = useMemo(() => contacts.length, [contacts]);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-xl">Contact list</CardTitle>
          <CardDescription>{totalContacts} contacts available for targeting.</CardDescription>
        </div>
        {isValidating && <p className="text-xs text-muted-foreground">Refreshing contacts...</p>}
      </CardHeader>
      <CardContent className="overflow-hidden">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="size-6 text-primary" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No contacts yet</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Upload a CSV file to start building your outreach audience.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border/60 text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Tags</th>
                  <th className="px-4 py-3 font-semibold">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 bg-background">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">
                      <p className="font-medium">
                        {contact.firstName} {contact.lastName}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contact.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{contact.company}</td>
                    <td className="px-4 py-3">
                      {contact.tags && contact.tags.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {contact.tags.map((tag) => (
                            <span
                              key={`${contact.id}-${tag}`}
                              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                            >
                              <Tag className="h-3 w-3" aria-hidden />
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No tags</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Intl.DateTimeFormat('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      }).format(new Date(contact.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
