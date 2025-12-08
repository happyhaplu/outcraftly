import { NextResponse } from 'next/server';
import { z } from 'zod';

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error'
  | 'validation_failed';

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class AuthError extends HttpError {
  constructor(message = 'Unauthorized', details?: Record<string, unknown>) {
    super(401, 'unauthorized', message, details);
    this.name = 'AuthError';
  }
}

export class WorkspaceError extends HttpError {
  constructor(message = 'Workspace not found', details?: Record<string, unknown>) {
    super(400, 'bad_request', message, details);
    this.name = 'WorkspaceError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details?: Record<string, unknown>) {
    super(403, 'forbidden', message, details);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super(400, 'validation_failed', message, details);
    this.name = 'ValidationError';
  }
}

export const isHttpError = (error: unknown): error is HttpError => error instanceof HttpError;

export const mapZodError = (error: z.ZodError) =>
  new ValidationError('Validation failed', {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }))
  });

export const httpErrorResponse = (error: HttpError) =>
  NextResponse.json(
    {
      success: false,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    },
    { status: error.status }
  );
