import { exit } from 'node:process';

import { client } from '@/lib/db/drizzle';
import { runTrialExpiry } from '@/lib/workers/trial-expiry';

async function main() {
  const now = new Date();
  console.log('Running trial expiry job at', now.toISOString());

  const expired = await runTrialExpiry(now);
  console.log('Expired trials count:', expired.length);
}

main()
  .catch((error) => {
    console.error('Trial expiry job failed', error);
    exit(1);
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
