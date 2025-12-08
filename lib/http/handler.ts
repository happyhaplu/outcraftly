import { NextRequest, NextResponse } from 'next/server';
import type { RouteContext } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getLogger, withLogContext } from '@/lib/logger';
import {
  AuthError,
  ForbiddenError,
  HttpError,
  ValidationError,
  WorkspaceError,
  httpErrorResponse,
  isHttpError
} from './errors';
import { validateRequest, type ValidatedInput, type SchemaBundle } from './validation';

export type HandlerContext<TValidated> = {
  request: NextRequest;
  validated: TValidated;
  log: ReturnType<typeof getLogger>;
};

type DefaultValidated = { params: Record<string, unknown>; query: Record<string, unknown>; body: unknown };

type HandlerReturn = NextResponse | Response | unknown;

export type HandlerConfig<TSchema extends SchemaBundle | undefined> = {
  schema?: TSchema;
  handler: (context: HandlerContext<TSchema extends SchemaBundle ? ValidatedInput<TSchema> : DefaultValidated>) => Promise<HandlerReturn>;
};

export const createRouteHandler = <TSchema extends SchemaBundle | undefined>(config: HandlerConfig<TSchema>) => async (
  request: NextRequest,
  context: RouteContext
) => {
  const requestId = request?.headers?.get?.('x-request-id') ?? randomUUID();

  return withLogContext({ requestId, component: 'api-route' }, async () => {
    const baseLogger = getLogger();
    const route = resolveRoutePath(request);
    const handlerLogger = baseLogger.child({ route });
    let validated: ValidatedInput<SchemaBundle> | undefined;
    const resolvedParams = context?.params ? await context.params : {};
    const normalizedContext = {
      params: (resolvedParams ?? {}) as Record<string, string | string[]>
    };

    try {
      if (config.schema) {
  validated = (await validateRequest(request, normalizedContext, config.schema as SchemaBundle)) as ValidatedInput<SchemaBundle>;
      }

      const validatedInput = (validated ??
        ({
          params: normalizedContext.params ?? {},
          body: {},
          query: {}
        } as DefaultValidated)) as TSchema extends SchemaBundle
        ? ValidatedInput<NonNullable<TSchema>>
        : DefaultValidated;

      const handlerResult = await config.handler({
        request,
        validated: validatedInput,
        log: handlerLogger
      });

      const response = normalizeSuccessResponse(handlerResult);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      handlerLogger.error({ err: error }, 'API handler failed');

      const knownErrorResponse = mapKnownError(error);
      if (knownErrorResponse) {
        knownErrorResponse.headers.set('x-request-id', requestId);
        return knownErrorResponse;
      }

      if (isHttpError(error)) {
        const response = httpErrorResponse(error);
        response.headers.set('x-request-id', requestId);
        return response;
      }

      const response = httpErrorResponse(new HttpError(500, 'internal_error', 'Internal server error'));
      response.headers.set('x-request-id', requestId);
      return response;
    }
  });
};

const resolveRoutePath = (request: NextRequest): string => {
  const candidate = request.nextUrl?.pathname ?? request.url ?? 'unknown';
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return 'unknown';
  }

  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    try {
      return new URL(candidate).pathname || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  return candidate;
};

const mapKnownError = (error: unknown): NextResponse | null => {
  if (error instanceof AuthError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 401 });
  }

  if (error instanceof ValidationError || error instanceof WorkspaceError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 403 });
  }

  return null;
};

const normalizeSuccessResponse = (result: HandlerReturn): NextResponse => {
  if (result instanceof NextResponse) {
    return result;
  }

  if (result instanceof Response) {
    const clone = result.clone();
    const headers = new Headers(clone.headers);
    return new NextResponse(clone.body, {
      status: clone.status,
      statusText: clone.statusText,
      headers
    });
  }

  const sanitized = sanitizePayload(result);
  return NextResponse.json({ success: true, data: sanitized }, { status: 200 });
};

const sanitizePayload = (payload: unknown) => {
  if (payload === undefined) {
    return null;
  }

  if (payload instanceof Response || payload instanceof NextResponse) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return payload ?? null;
  }
};
