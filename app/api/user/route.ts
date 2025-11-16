import { z } from 'zod';

import { getUser } from '@/lib/db/queries';
import { createRouteHandler } from '@/lib/http/handler';
import { jsonOk, sanitizeObject } from '@/lib/http/response';

const schema = {
  query: z.object({}).strict(),
  params: z.object({}).strict()
};

export const GET = createRouteHandler({
  schema,
  handler: async ({ log }) => {
    const user = await getUser();
    log.info({ userId: user?.id ?? null }, 'Fetched current user');
    return jsonOk(sanitizeObject(user));
  }
});
