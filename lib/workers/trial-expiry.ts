import { expireTrialUsers } from '@/lib/db/queries';

export type TrialExpiryResult = {
  id: number;
  email: string;
  trialExpiresAt: Date | null;
};

export async function runTrialExpiry(now = new Date()): Promise<TrialExpiryResult[]> {
  const expired = await expireTrialUsers(now);

  if (expired.length > 0) {
    console.info('Expired trial users', expired.map((user) => ({
      id: user.id,
      email: user.email,
      trialExpiresAt: user.trialExpiresAt?.toISOString() ?? null
    })));
  } else {
    console.info('No trials expired during this run');
  }

  return expired as TrialExpiryResult[];
}
