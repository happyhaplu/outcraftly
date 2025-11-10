import { describe, expect, it } from 'vitest';

import { renderTemplate, type ContactRecord } from '@/lib/sequence/sequence-engine';

describe('renderTemplate', () => {
  it('renders system fields case-insensitively', () => {
    const contact: ContactRecord = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      company: 'Acme Inc'
    };

    const result = renderTemplate('Hi {{ firstName }} from {{company}}', contact);
    expect(result).toBe('Hi Jane from Acme Inc');
  });

  it('resolves custom fields via canonical key', () => {
    const contact: ContactRecord = {
      email: 'contact@example.com',
      customFields: {
        source: 'Webinar',
        '123e4567-e89b-12d3-a456-426614174000': 'Referral'
      }
    };

    const template = 'Source {{customFields.source}} id {{customFields.123e4567-e89b-12d3-a456-426614174000}}';
    const result = renderTemplate(template, contact);
    expect(result).toBe('Source Webinar id Referral');
  });

  it('resolves custom fields via display name lookup', () => {
    const contact: ContactRecord = {
      email: 'contact@example.com',
      customFields: {},
      customFieldsByName: {
        'Favorite Color': 'Blue'
      }
    };

    const result = renderTemplate('Color is {{ Favorite Color }}', contact);
    expect(result).toBe('Color is Blue');
  });

  it('applies filters and placeholders', () => {
    const contact: ContactRecord = {
      email: 'contact@example.com',
      customFields: {
        title: '  founder  '
      }
    };

    const template = 'Role: {{customFields.title|trim|uppercase}} Missing: {{unknown|trim}}';
    const result = renderTemplate(template, contact, { emptyPlaceholder: '(n/a)' });
    expect(result).toBe('Role: FOUNDER Missing: (n/a)');
  });

  it('formats tags list', () => {
    const contact: ContactRecord = {
      email: 'contact@example.com',
      tags: ['alpha', 'beta']
    };

    const result = renderTemplate('Tags: {{ tags }}', contact);
    expect(result).toBe('Tags: alpha, beta');
  });
});
