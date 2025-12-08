import { Suspense } from 'react';
import { Login } from '../login';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up | Outcraftly',
  description: 'Create your Outcraftly account and start automating your cold email outreach today.'
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <Login mode="signup" />
    </Suspense>
  );
}
