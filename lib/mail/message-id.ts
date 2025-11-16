import { randomUUID } from 'node:crypto';

const FALLBACK_DOMAIN = 'mail.outcraftly.local';

export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutAngles = trimmed.replace(/^<+/, '').replace(/>+$/, '');
  const cleaned = withoutAngles.trim().toLowerCase();

  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeMessageIdList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalised = normalizeMessageId(value);
    if (normalised && !seen.has(normalised)) {
      seen.add(normalised);
      result.push(normalised);
    }

    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }

  return result;
}

export function generateFallbackMessageId(sequenceId?: string | null): string {
  const unique = randomUUID();
  const sequenceFragment = sequenceId ? `${sequenceId.toLowerCase()}-` : '';
  return `${sequenceFragment}${unique}@${FALLBACK_DOMAIN}`;
}
