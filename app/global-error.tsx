'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error]', error);
    console.error('[Global Error Digest]', error.digest);
    console.error('[Global Error Message]', error.message);
    console.error('[Global Error Stack]', error.stack);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
          <div className="max-w-md space-y-4 text-center">
            <h2 className="text-2xl font-bold">Application Error</h2>
            <p className="text-gray-600">
              {error.message || 'An unexpected error occurred'}
            </p>
            {error.digest && (
              <p className="text-sm text-gray-500">Error ID: {error.digest}</p>
            )}
            <pre className="text-left text-xs overflow-auto max-h-40 bg-gray-100 p-2 rounded">
              {error.stack}
            </pre>
            <button
              onClick={reset}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
