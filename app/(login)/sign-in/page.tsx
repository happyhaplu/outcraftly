import { Suspense } from 'react';
import { Login } from '../login';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SignInPage() {
  console.log('[SignInPage] Rendering sign-in page...');
  
  try {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
        <Login mode="signin" />
      </Suspense>
    );
  } catch (error) {
    console.error('[SignInPage] Error rendering:', error);
    throw error;
  }
}

