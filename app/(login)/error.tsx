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
    console.error('[Login Error Boundary]', error);
    console.error('[Login Error Digest]', error.digest);
    console.error('[Login Error Message]', error.message);
    console.error('[Login Error Stack]', error.stack);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md space-y-4 text-center">
        <h2 className="text-2xl font-bold">Something went wrong!</h2>
        <p className="text-gray-600">
          Error: {error.message || 'Unknown error'}
        </p>
        {error.digest && (
          <p className="text-sm text-gray-500">Digest: {error.digest}</p>
        )}
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
