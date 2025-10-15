import { NextResponse } from 'next/server';
import { getContactsForTeam, getTeamForUser, getUser, insertContacts } from '@/lib/db/queries';
import { normalizeRecord, parseCsv, REQUIRED_FIELDS } from '@/lib/contacts/csv';
import type { ParsedCsvContact } from '@/lib/contacts/csv';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data request' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds the 5MB size limit' }, { status: 400 });
    }

    const filename = file.name ?? '';
    if (!filename.toLowerCase().endsWith('.csv')) {
      return NextResponse.json({ error: 'Only CSV files are supported' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let records: Record<string, unknown>[];
    try {
      records = parseCsv(buffer.toString('utf-8'));
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Failed to parse CSV file. Please check the format.' },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'The CSV file does not contain any rows.' }, { status: 400 });
    }

  const existingContacts = await getContactsForTeam(team.id);
  const existingEmails = new Set(existingContacts.map((contact) => contact.email.toLowerCase()));

    const seenEmails = new Set<string>();
  const rows: ParsedCsvContact[] = [];
    let duplicateCount = 0;

    for (const record of records) {
      const normalized = normalizeRecord(record);

      for (const field of REQUIRED_FIELDS) {
        if (!normalized[field]) {
          return NextResponse.json(
            { error: `Missing required field "${field}" in CSV row.` },
            { status: 400 }
          );
        }
      }

    const email = normalized.email.toLowerCase();
      if (existingEmails.has(email) || seenEmails.has(email)) {
        duplicateCount += 1;
        continue;
      }

      seenEmails.add(email);
      rows.push({
        firstName: normalized.firstName,
        lastName: normalized.lastName,
        email,
        company: normalized.company,
        tags: normalized.tags
      });
    }

    const inserted = await insertContacts(team.id, rows);
    duplicateCount += rows.length - inserted;

    return NextResponse.json(
      {
        message: 'Contacts uploaded successfully',
        summary: {
          total: records.length,
          inserted,
          skipped: duplicateCount,
          duplicates: duplicateCount
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to upload contacts', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
