import { Suspense } from 'react';
import { Login } from '../login';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Outcraftly',
  description: 'Sign in to your Outcraftly workspace to manage your email sequences and contacts.'
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SignInPage() {
  console.log('[SignInPage] Rendering sign-in page...');

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <Login mode="signin" />
    </Suspense>
  );
}

