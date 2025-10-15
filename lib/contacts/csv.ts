const REQUIRED_FIELD_KEYS = ['firstName', 'lastName', 'email', 'company'] as const;

export type RequiredFieldKey = (typeof REQUIRED_FIELD_KEYS)[number];

export type ParsedCsvContact = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  tags: string[];
};

export const REQUIRED_FIELDS: ReadonlyArray<RequiredFieldKey> = REQUIRED_FIELD_KEYS;

export function normalizeRecord(record: Record<string, unknown>): ParsedCsvContact {
  const normalized: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = rawKey.trim().toLowerCase();
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    normalized[key] = value;
  }

  const resolve = (...keys: string[]) => keys.map((key) => normalized[key]).find((value) => value);

  const firstName = resolve('firstname', 'first_name');
  const lastName = resolve('lastname', 'last_name');
  const email = resolve('email');
  const company = resolve('company');
  const tagsRaw = resolve('tags');

  return {
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    email: (email ?? '').toLowerCase(),
    company: company ?? '',
    tags: tagsRaw
      ? tagsRaw
          .split(/[,;|]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
      : []
  } satisfies ParsedCsvContact;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) {
      continue;
    }

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim?.() ?? '';
    });

    records.push(record);
  }

  return records;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}
