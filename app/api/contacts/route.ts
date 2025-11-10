import { NextResponse } from 'next/server';

import {
  getPaginatedContactsForTeam,
  getTeamForUser,
  getActiveUser,
  InactiveTrialError,
  UnauthorizedError,
  TRIAL_EXPIRED_ERROR_MESSAGE
} from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await getActiveUser();

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'No workspace associated with user' }, { status: 400 });
    }

    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? undefined;
    const tag = url.searchParams.get('tag') ?? undefined;
    const pageParam = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
    const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);

    const result = await getPaginatedContactsForTeam(team.id, {
      search: search?.trim() || undefined,
      tag: tag?.trim() || undefined,
      page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1,
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof InactiveTrialError) {
      return NextResponse.json({ error: TRIAL_EXPIRED_ERROR_MESSAGE }, { status: 403 });
    }

    console.error('Failed to list contacts', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
