import { NextResponse } from 'next/server';

import {
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE,
  createContactCustomFieldDefinition,
  createContactWithCustomFields,
  findContactByEmail,
  getActiveUser,
  getTeamForUser,
  listContactCustomFieldDefinitions,
  updateContact
} from '@/lib/db/queries';
import type { ContactCustomFieldType } from '@/lib/db/queries';

import type {
  CustomFieldDef,
  ImportOptions,
  ImportResponseSummary,
  ImportRow
} from '@/types/shared';

export const runtime = 'nodejs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeTags = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
};

const coerceCustomFieldType = (value: unknown): ContactCustomFieldType => {
  return value === 'number' || value === 'date' ? value : 'text';
};

const toCustomFieldValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value).trim();
};

export async function POST(request: Request) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!payload || !Array.isArray((payload as any).rows)) {
      return NextResponse.json({ error: 'Expected { rows: Array } in request body' }, { status: 400 });
    }

    const options = (payload as { options?: ImportOptions }).options ?? {};
    const rawMetadata = options.customFieldMetadata;
    const metadataMap = new Map<string, { name: string; type: ContactCustomFieldType }>();

    if (Array.isArray(rawMetadata)) {
      for (const entry of rawMetadata) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const key = typeof (entry as any).key === 'string' ? (entry as any).key.trim() : '';
        if (!key) {
          continue;
        }

        const name = typeof (entry as any).name === 'string' ? (entry as any).name.trim() : '';
        metadataMap.set(key, {
          name: name || key,
          type: coerceCustomFieldType((entry as any).type)
        });
      }
    } else if (rawMetadata && typeof rawMetadata === 'object') {
      for (const [rawKey, value] of Object.entries(rawMetadata as Record<string, unknown>)) {
        if (!rawKey || typeof value !== 'object' || value === null) {
          continue;
        }

        const key = rawKey.trim();
        if (!key) {
          continue;
        }

        const name = typeof (value as any).name === 'string' ? (value as any).name.trim() : '';
        metadataMap.set(key, {
          name: name || key,
          type: coerceCustomFieldType((value as any).type)
        });
      }
    }

    const rows = (payload as { rows: ImportRow[] }).rows;
    const summary: ImportResponseSummary = {
      total: rows.length,
      imported: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      duplicates: 0,
      errors: []
    };

    const seenEmails = new Set<string>();

    const existingDefs = await listContactCustomFieldDefinitions(team.id);
    const defsByKey = new Map<string, { id: string; key: string; name: string }>();
    const defsById = new Map<string, { id: string; key: string; name: string }>();

    for (const definition of existingDefs) {
      defsByKey.set(definition.key, { id: definition.id, key: definition.key, name: definition.name });
      defsById.set(definition.id, { id: definition.id, key: definition.key, name: definition.name });
    }

    const createMissing = Boolean(options.createMissingCustomFields) || metadataMap.size > 0;
    const customKeys = new Set<string>();

    for (const row of rows) {
      if (row?.customFields && typeof row.customFields === 'object') {
        for (const key of Object.keys(row.customFields)) {
          if (!UUID_REGEX.test(key)) {
            customKeys.add(key);
          }
        }
      }
    }

    const createdCustomFields: CustomFieldDef[] = [];

    if (createMissing && customKeys.size > 0) {
      for (const rawKey of customKeys) {
        if (defsByKey.has(rawKey)) {
          continue;
        }

        const meta = metadataMap.get(rawKey);
        const label = meta?.name
          ? meta.name
          : rawKey
              .replace(/[_\-]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/(^|\s)\S/g, (token) => token.toUpperCase());

        try {
          const created = await createContactCustomFieldDefinition(team.id, {
            name: label || rawKey,
            type: meta?.type ?? 'text'
          });

          defsByKey.set(created.key, { id: created.id, key: created.key, name: created.name });
          defsByKey.set(rawKey, { id: created.id, key: created.key, name: created.name });
          defsById.set(created.id, { id: created.id, key: created.key, name: created.name });

          createdCustomFields.push({
            id: created.id,
            key: created.key,
            name: created.name,
            type: created.type,
            createdAt: created.createdAt?.toISOString?.()
          });
        } catch (error) {
          console.error('contacts/import: failed to create custom field', rawKey, error);
        }
      }
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];

      const email = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';
      if (!email) {
        summary.skipped += 1;
        summary.errors?.push({ rowIndex: index, message: 'Missing or invalid email' });
        continue;
      }

      if (seenEmails.has(email)) {
        summary.skipped += 1;
        summary.duplicates += 1;
        summary.errors?.push({ rowIndex: index, message: 'Duplicate email in import file' });
        continue;
      }
      seenEmails.add(email);

      const firstName = sanitizeString(row.firstName);
      const lastName = sanitizeString(row.lastName);
      const company = sanitizeString(row.company);
      const jobTitle = sanitizeString(row.jobTitle);
      const normalizedTags = normalizeTags(row.tags);

  const customFieldValues: Record<string, string> = {};
      if (row.customFields && typeof row.customFields === 'object') {
        for (const [key, value] of Object.entries(row.customFields)) {
          const coerced = toCustomFieldValue(value);
          if (coerced === undefined) {
            continue;
          }

          if (UUID_REGEX.test(key)) {
            if (defsById.has(key)) {
              customFieldValues[key] = coerced;
            }
            continue;
          }

          const definition = defsByKey.get(key);
          if (definition) {
            customFieldValues[definition.id] = coerced;
          }
        }
      }

      const customPayload = Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined;

      try {
        const existing = await findContactByEmail(team.id, email);

        if (existing) {
          const updatePayload: Parameters<typeof updateContact>[2] = {};
          let hasUpdates = false;

          if (typeof firstName === 'string') {
            updatePayload.firstName = firstName;
            hasUpdates = true;
          }
          if (typeof lastName === 'string') {
            updatePayload.lastName = lastName;
            hasUpdates = true;
          }
          if (typeof company === 'string') {
            updatePayload.company = company;
            hasUpdates = true;
          }
          if (jobTitle !== undefined) {
            updatePayload.jobTitle = jobTitle ?? null;
            hasUpdates = true;
          }
          if (normalizedTags !== undefined) {
            updatePayload.tags = normalizedTags;
            hasUpdates = true;
          }
          if (customPayload) {
            updatePayload.customFields = customPayload;
            hasUpdates = true;
          }

          if (!hasUpdates) {
            summary.skipped += 1;
            summary.errors?.push({ rowIndex: index, message: 'No mapped fields to update' });
            continue;
          }

          const updated = await updateContact(team.id, existing.id, updatePayload);
          if (!updated) {
            summary.skipped += 1;
            summary.errors?.push({ rowIndex: index, message: 'Unable to update contact' });
            continue;
          }

          summary.updated += 1;
          continue;
        }

        await createContactWithCustomFields(team.id, {
          firstName: firstName ?? '',
          lastName: lastName ?? '',
          email,
          company: company ?? '',
          jobTitle: jobTitle ?? null,
          tags: normalizedTags ?? [],
          customFields: customPayload
        });
        summary.created += 1;
      } catch (error) {
        summary.skipped += 1;
        summary.errors?.push({
          rowIndex: index,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    summary.imported = summary.created + summary.updated;
    if (createdCustomFields.length > 0) {
      summary.createdCustomFields = createdCustomFields;
    }
    if (summary.errors && summary.errors.length === 0) {
      delete summary.errors;
    }

    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to import contacts', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
