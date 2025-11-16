import { NextResponse } from 'next/server';
import DOMPurify from 'isomorphic-dompurify';

export const jsonOk = <T>(payload: T, init?: ResponseInit) =>
  NextResponse.json({ success: true, data: payload }, init);

export const jsonError = (code: string, message: string, status = 400, details?: Record<string, unknown>) =>
  NextResponse.json(
    {
      success: false,
      code,
      message,
      ...(details ? { details } : {})
    },
    { status }
  );

export const sanitizeHtml = (input: string) => DOMPurify.sanitize(input, { USE_PROFILES: { html: true } });

export const sanitizeObject = <T>(payload: T): T => {
  if (payload === null || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeObject(item)) as unknown as T;
  }

  return Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (typeof value === 'string') {
      acc[key] = sanitizeHtml(value);
      return acc;
    }

    if (value && typeof value === 'object') {
      acc[key] = sanitizeObject(value);
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {}) as T;
};
