export type ContactRecord = {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  tags?: string[];
  customFields?: Record<string, string>;
  customFieldsByName?: Record<string, string>;
};

function normalizeKey(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function lookupCustomField(contact: ContactRecord, keyOrName: string) {
  if (!contact) return undefined;
  const cf = contact.customFields ?? {};

  // direct key
  if (keyOrName in cf) return cf[keyOrName];

  // by display name
  if (contact.customFieldsByName && keyOrName in contact.customFieldsByName) {
    return contact.customFieldsByName[keyOrName];
  }

  // normalized lookup
  const norm = normalizeKey(keyOrName);
  for (const k of Object.keys(cf)) {
    if (normalizeKey(k) === norm) return cf[k];
  }

  if (contact.customFieldsByName) {
    for (const k of Object.keys(contact.customFieldsByName)) {
      if (normalizeKey(k) === norm) return contact.customFieldsByName[k];
    }
  }

  return undefined;
}

export function renderTemplate(template: string, contact: ContactRecord, opts?: { emptyPlaceholder?: string }) {
  const emptyPlaceholder = opts?.emptyPlaceholder ?? '';

  return template.replace(/{{\s*([^}]+)\s*}}/g, (match: string, raw: string) => {
    const parts = raw.split('|').map((p: string) => p.trim());
    const key = parts[0];
    const filters = parts.slice(1);

    // system fields
    switch (key) {
      case 'firstName':
      case 'firstname':
        return formatValue(contact.firstName, filters, emptyPlaceholder);
      case 'lastName':
      case 'lastname':
        return formatValue(contact.lastName, filters, emptyPlaceholder);
      case 'email':
        return formatValue(contact.email, filters, emptyPlaceholder);
      case 'company':
        return formatValue(contact.company, filters, emptyPlaceholder);
      case 'jobTitle':
      case 'jobtitle':
        return formatValue(contact.jobTitle, filters, emptyPlaceholder);
      case 'title':
        return formatValue(contact.jobTitle, filters, emptyPlaceholder);
      case 'phone':
        return formatValue(contact.phone, filters, emptyPlaceholder);
      case 'tags':
        return formatValue(Array.isArray(contact.tags) ? contact.tags.join(', ') : undefined, filters, emptyPlaceholder);
      default:
        break;
    }

    // customFields.key
    if (key.startsWith('customFields.')) {
      const k = key.slice('customFields.'.length);
      const v = contact.customFields?.[k] ?? lookupCustomField(contact, k);
      return formatValue(v, filters, emptyPlaceholder);
    }

    // attempt system field case-insensitive
    const lower = key.toLowerCase();
    if (lower === 'firstname' || lower === 'first_name') return formatValue(contact.firstName, filters, emptyPlaceholder);
    if (lower === 'lastname' || lower === 'last_name') return formatValue(contact.lastName, filters, emptyPlaceholder);
    if (lower === 'email' || lower === 'email_address') return formatValue(contact.email, filters, emptyPlaceholder);

    // shorthand: try custom field by display name or normalized key
    const v = lookupCustomField(contact, key);
    return formatValue(v, filters, emptyPlaceholder);
  });
}

function formatValue(value: unknown, filters: string[], emptyPlaceholder: string) {
  let out = value == null ? emptyPlaceholder : String(value);
  for (const f of filters) {
    if (!f) continue;
    if (f === 'uppercase') out = out.toUpperCase();
    else if (f === 'lowercase') out = out.toLowerCase();
    else if (f === 'trim') out = out.trim();
  }
  return out;
}

export default { renderTemplate };
