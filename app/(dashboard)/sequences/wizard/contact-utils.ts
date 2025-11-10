import type { WizardContact } from './WizardStepEnrollProspects';

export function filterContacts(contacts: WizardContact[], searchTerm: string) {
  const trimmed = searchTerm.trim().toLowerCase();
  if (!trimmed) {
    return contacts;
  }
  return contacts.filter((contact) => {
    const haystacks = [contact.firstName, contact.lastName, contact.email, contact.company];
    const hasMatch = haystacks
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(trimmed));
    if (hasMatch) {
      return true;
    }
    if (!Array.isArray(contact.tags) || contact.tags.length === 0) {
      return false;
    }
    return contact.tags.some((tag) => tag.toLowerCase().includes(trimmed));
  });
}
