import type { WizardContact } from './WizardStepEnrollProspects';

export type ContactsApiResponse =
  | {
      data?: WizardContact[];
      contacts?: WizardContact[];
    }
  | WizardContact[];

export type TagsApiResponse = {
  tags?: string[];
};

export type CurrentUserResponse = {
  email?: string;
  timezone?: string | null;
};

export const fetchContacts = async (url: string): Promise<WizardContact[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof (payload as { error?: unknown })?.error === 'string'
      ? (payload as { error: string }).error
      : 'Unable to load contacts.';
    throw new Error(message);
  }
  const payload = (await response.json().catch(() => ({}))) as ContactsApiResponse;
  console.log('[fetchContacts] raw payload', payload);
  const contacts = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.contacts)
        ? payload.contacts
        : [];
  console.log('[fetchContacts] normalized contacts', Array.isArray(contacts) ? contacts.length : 0);
  return contacts.map((contact) => ({
    ...contact,
    company: contact.company ?? null,
    tags: Array.isArray(contact.tags)
      ? contact.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
  }));
};

export const fetchTags = async (url: string): Promise<string[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof (payload as { error?: unknown })?.error === 'string'
      ? (payload as { error: string }).error
      : 'Unable to load tags.';
    throw new Error(message);
  }
  const payload = (await response.json().catch(() => ({}))) as TagsApiResponse | null;
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
};

export const fetchCurrentUser = async (url: string): Promise<CurrentUserResponse | null> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  return payload as CurrentUserResponse;
};
