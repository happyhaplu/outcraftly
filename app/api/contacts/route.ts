import { z } from 'zod';

import {
  getPaginatedContactsForTeam,
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';
import { NextResponse } from 'next/server';
import type { NextRequest, RouteContext } from 'next/server';

import { createRouteHandler } from '@/lib/http/handler';
import { AuthError, ForbiddenError, WorkspaceError } from '@/lib/http/errors';
import { sanitizeObject } from '@/lib/http/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z
  .object({
    search: z.string().trim().max(256).optional(),
    tag: z.string().trim().max(128).optional(),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional()
  })
  .strict();

const handler = createRouteHandler({
  schema: { query: querySchema, params: z.object({}).strict() },
  handler: async ({ validated, log }) => {
    try {
      await getActiveUser();

      const team = await getTeamForUser();
      if (!team) {
        throw new WorkspaceError('No workspace associated with user');
      }

      const search = validated.query.search ?? undefined;
      const tag = validated.query.tag ?? undefined;
      const page = validated.query.page ? Number.parseInt(validated.query.page, 10) : 1;
      const limit = validated.query.limit ? Number.parseInt(validated.query.limit, 10) : 20;

      const result = await getPaginatedContactsForTeam(team.id, {
        search: search?.trim() || undefined,
        tag: tag?.trim() || undefined,
        page: Number.isFinite(page) && page > 0 ? page : 1,
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20
      });

      log.info({ teamId: team.id, returned: result.data.length }, 'Fetched paginated contacts');

      return NextResponse.json(
        sanitizeObject({
          data: result.data.map((contact) => ({
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            company: contact.company,
            jobTitle: contact.jobTitle ?? null,
            tags: contact.tags ?? [],
            createdAt: contact.createdAt
          })),
          total: result.total,
          page: result.page,
          totalPages: result.totalPages
        })
      );
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw new AuthError('Unauthorized');
      }

      if (error instanceof InactiveTrialError) {
        throw new ForbiddenError(TRIAL_EXPIRED_ERROR_MESSAGE);
      }

      throw error;
    }
  }
});

export async function GET(request: NextRequest, context: RouteContext) {
  return handler(request, context);
}
