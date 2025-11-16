import { NextRequest } from 'next/server';
import { z, ZodTypeAny } from 'zod';
import { mapZodError } from './errors';
import { getLogger } from '@/lib/logger';

const parseQuery = (request: NextRequest) => {
  const maybeNextUrl = (request as unknown as { nextUrl?: { searchParams?: URLSearchParams } }).nextUrl;
  if (maybeNextUrl?.searchParams instanceof URLSearchParams) {
    return Object.fromEntries(maybeNextUrl.searchParams.entries());
  }

  if (typeof request.url === 'string' && request.url.length > 0) {
    try {
      const url = new URL(request.url, 'http://localhost');
      return Object.fromEntries(url.searchParams.entries());
    } catch {
      return {};
    }
  }

  return {};
};

export type SchemaBundle = {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
};

export type ValidatedInput<TSchema extends SchemaBundle> = {
  params: TSchema['params'] extends ZodTypeAny ? z.infer<TSchema['params']> : Record<string, never>;
  query: TSchema['query'] extends ZodTypeAny ? z.infer<TSchema['query']> : Record<string, never>;
  body: TSchema['body'] extends ZodTypeAny ? z.infer<TSchema['body']> : unknown;
};

export const validateRequest = async <TSchema extends SchemaBundle>(
  request: NextRequest,
  context: { params?: Record<string, string | string[]> },
  schema: TSchema
): Promise<ValidatedInput<TSchema>> => {
  const logger = getLogger({ component: 'request-validation' });

  try {
    const params = schema.params ? schema.params.parse(context.params ?? {}) : {};
    const query = schema.query ? schema.query.parse(parseQuery(request)) : {};
    let body: unknown = {};

    if (schema.body) {
      const raw = await request.json().catch(() => {
        throw mapZodError(
          new z.ZodError([
            {
              code: 'custom',
              message: 'Invalid JSON body',
              path: []
            }
          ])
        );
      });
      body = schema.body.parse(raw);
    }

    return { params, query, body } as ValidatedInput<TSchema>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw mapZodError(error);
    }

    logger.error({ err: error }, 'Request validation failed unexpectedly');
    throw error;
  }
};
