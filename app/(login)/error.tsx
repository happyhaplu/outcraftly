'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep client console noise minimal; full details are in server logs.
    console.error('[Login Error Boundary] message:', error.message);
    if (error.digest) console.error('[Login Error Boundary] digest:', error.digest);
  }, [error]);

  const shortDigest = error.digest ? String(error.digest).slice(0, 12) : null;
  const ts = new Date().toISOString();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md space-y-4 text-center">
        <h2 className="text-2xl font-bold">Something went wrong</h2>
        <p className="text-gray-600">
          An internal error occurred while processing your request.
        </p>
        {shortDigest && (
          <p className="text-sm text-gray-500">Reference: {shortDigest} • {ts}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Please contact support and include the reference above so we can look up server logs.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
