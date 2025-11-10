const DEFAULT_INTERVAL_MINUTES = 5;

function parseInterval(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export const DEFAULT_MIN_SEND_INTERVAL_MINUTES = DEFAULT_INTERVAL_MINUTES;

export function getMinSendIntervalMinutes(): number {
  const disableInterval = (process.env.DISABLE_MIN_SEND_INTERVAL ?? '').toLowerCase();
  if (disableInterval === 'true' || disableInterval === '1') {
    return 0;
  }

  const envValue = parseInterval(process.env.MIN_SEND_INTERVAL_MINUTES);
  return envValue ?? DEFAULT_MIN_SEND_INTERVAL_MINUTES;
}
